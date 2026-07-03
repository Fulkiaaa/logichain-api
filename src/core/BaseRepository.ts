import type { ChangeStream } from 'mongodb';
import type {
  ClientSession,
  FilterQuery,
  HydratedDocument,
  Model,
  UpdateQuery,
} from 'mongoose';
import mongoose from 'mongoose';

import type { BaseEntity } from './BaseEntity';
import { ConflictError, NotFoundError } from './errors';

/**
 * Changement observé sur une collection via Change Stream, déjà traduit en
 * objet du domaine (Entity) — la couche Service ne voit jamais le document
 * Mongo brut, conformément au découpage N-Tier.
 */
export interface EntityChange<TEntity> {
  operationType: 'insert' | 'update' | 'replace' | 'delete';
  entity: TEntity | null; // null pour un delete (ou fullDocument disparu)
  documentId: string;
  /** Champs réellement modifiés (updates uniquement) — sert à dédupliquer. */
  updatedFields?: string[];
}

/**
 * Jeton de transaction opaque exposé aux couches Service.
 *
 * Volontairement aliasé ici (et non importé de `mongoose` côté Service) pour que
 * la couche métier reste indépendante de l'ODM : un service reçoit une `TxSession`,
 * la transmet aux méthodes du repository, mais n'appelle jamais de méthode dessus.
 */
export type TxSession = ClientSession;

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Repository abstrait générique — UNIQUE couche autorisée à dialoguer avec Mongoose.
 *
 * Justification POO :
 *  - Héritage : factorise CRUD générique (findById, list, create, update, delete).
 *  - Polymorphisme : la méthode abstraite `toEntity()` est implémentée par chaque
 *    sous-classe pour mapper un document Mongoose vers une Entity du domaine.
 *  - Encapsulation : `model` est protected, jamais exposé hors de la hiérarchie.
 *
 * Génériques :
 *  - TEntity   : type de l'entité métier renvoyée (jamais de document brut côté Service).
 *  - TRawDoc   : type brut inféré du schéma Mongoose (sans Document<...>).
 *                Les documents retournés par les queries sont HydratedDocument<TRawDoc>.
 */
export abstract class BaseRepository<TEntity extends BaseEntity, TRawDoc> {
  protected readonly model: Model<TRawDoc>;

  protected constructor(model: Model<TRawDoc>) {
    this.model = model;
  }

  protected abstract toEntity(doc: HydratedDocument<TRawDoc>): TEntity;

  public async findById(id: string): Promise<TEntity | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    const doc = await this.model.findById(id).exec();
    return doc ? this.toEntity(doc) : null;
  }

  public async findByIdOrFail(id: string, resourceName: string): Promise<TEntity> {
    const entity = await this.findById(id);
    if (!entity) {
      throw new NotFoundError(resourceName, id);
    }
    return entity;
  }

  public async list(
    filter: FilterQuery<TRawDoc> = {},
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<TEntity>> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const [docs, count] = await Promise.all([
      this.model
        .find(filter)
        .sort(options.sort ?? { createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return {
      data: docs.map((doc) => this.toEntity(doc)),
      count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 0,
    };
  }

  public async exists(filter: FilterQuery<TRawDoc>): Promise<boolean> {
    const doc = await this.model.exists(filter).exec();
    return doc !== null;
  }

  protected async deleteById(id: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(id)) {
      return false;
    }
    const res = await this.model.deleteOne({ _id: id }).exec();
    return res.deletedCount > 0;
  }

  /**
   * Exécute un travail dans une transaction MongoDB (ACID).
   *
   * Ouvre une session, lance `withTransaction` (commit automatique en cas de
   * succès, rollback si le callback jette), puis ferme la session. Le replica
   * set `rs0` est requis pour les transactions multi-documents.
   *
   * La couche Service orchestre QUOI rendre atomique ; la mécanique de session
   * (création, commit, rollback) reste confinée ici, dans la couche d'accès aux
   * données.
   */
  public async withTransaction<T>(work: (session: TxSession) => Promise<T>): Promise<T> {
    const session = await this.model.db.startSession();
    try {
      let result: T;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result!;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Mise à jour atomique avec contrôle de version (verrouillage optimiste).
   * Lance ConflictError si la version attendue ne correspond pas — le client
   * doit alors re-fetch et merger (cas typique sync offline → online).
   *
   * Une `session` peut être fournie pour participer à une transaction ACID :
   * la mise à jour est alors annulée si la transaction échoue.
   */
  /**
   * Ouvre un Change Stream MongoDB sur la collection et traduit chaque
   * changement en `EntityChange` du domaine (via `toEntity`), avant de le
   * passer au callback. Le replica set `rs0` est requis (déjà en place).
   *
   * Confine l'accès à Mongoose dans le repository : les couches supérieures
   * (Service temps réel) reçoivent des Entities, jamais des documents bruts.
   *
   * `fullDocument: 'updateLookup'` recharge le document complet après update,
   * indispensable pour reconstruire l'entité.
   */
  public watchEntities(onChange: (change: EntityChange<TEntity>) => void): ChangeStream {
    const stream = this.model.watch([], { fullDocument: 'updateLookup' });

    stream.on('change', (raw: unknown) => {
      const change = raw as {
        operationType: string;
        fullDocument?: unknown;
        documentKey?: { _id?: unknown };
        updateDescription?: { updatedFields?: Record<string, unknown> };
      };
      const documentId = String(change.documentKey?._id ?? '');
      const op = change.operationType;

      if (op === 'delete') {
        onChange({ operationType: 'delete', entity: null, documentId });
        return;
      }
      if (op === 'insert' || op === 'update' || op === 'replace') {
        const entity = change.fullDocument
          ? this.toEntity(this.model.hydrate(change.fullDocument as Partial<TRawDoc>))
          : null;
        const updatedFields = change.updateDescription?.updatedFields
          ? Object.keys(change.updateDescription.updatedFields)
          : undefined;
        onChange({ operationType: op, entity, documentId, ...(updatedFields ? { updatedFields } : {}) });
      }
    });

    return stream;
  }

  protected async updateWithVersion(
    id: string,
    expectedVersion: number,
    update: UpdateQuery<TRawDoc>,
    session?: TxSession,
  ): Promise<HydratedDocument<TRawDoc>> {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: id, __v: expectedVersion } as FilterQuery<TRawDoc>,
        { ...update, $inc: { __v: 1 } } as UpdateQuery<TRawDoc>,
        { new: true, runValidators: true, ...(session ? { session } : {}) },
      )
      .exec();

    if (!doc) {
      const current = await this.model.findById(id).session(session ?? null).exec();
      if (!current) {
        throw new NotFoundError(this.model.modelName, id);
      }
      const actualVersion = (current as unknown as { __v: number }).__v;
      throw new ConflictError(
        `Version stale pour ${this.model.modelName} ${id}`,
        expectedVersion,
        actualVersion,
      );
    }

    return doc as HydratedDocument<TRawDoc>;
  }
}
