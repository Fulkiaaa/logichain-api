import { BaseRepository } from '@/core/BaseRepository';
import { NotFoundError } from '@/core/errors';

import { UserEntity } from './user.entity';
import { UserModel, type UserDoc, type UserRaw, type UserRole } from './user.model';

/** Projection interne : identité + hash. Ne doit jamais sortir de la couche auth. */
export interface RawCredentials {
  id: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
}

const toCredentials = (doc: UserDoc): RawCredentials => ({
  id: String(doc._id),
  passwordHash: (doc as unknown as { passwordHash: string }).passwordHash,
  role: doc.role as UserRole,
  active: doc.active ?? true,
  mustChangePassword: doc.mustChangePassword ?? false,
});

export class UserRepository extends BaseRepository<UserEntity, UserRaw> {
  constructor() {
    super(UserModel);
  }

  protected toEntity(doc: UserDoc): UserEntity {
    const raw = doc.toObject({ virtuals: false });
    return new UserEntity({
      id: String(raw._id),
      version: (raw as unknown as { __v: number }).__v ?? 0,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      email: raw.email,
      fullName: raw.fullName,
      role: raw.role as UserRole,
      active: raw.active ?? true,
      mustChangePassword: raw.mustChangePassword ?? false,
    });
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    const doc = await this.model.findOne({ email: email.toLowerCase() }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  /**
   * Renvoie le doc Mongoose brut avec passwordHash (champ select:false).
   * UNIQUEMENT pour la vérification du mot de passe — ne pas exposer.
   */
  public async findRawByEmailWithHash(
    email: string,
  ): Promise<RawCredentials | null> {
    const doc = await this.model
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .exec();
    return doc ? toCredentials(doc) : null;
  }

  /**
   * Même usage que findRawByEmailWithHash, mais par identifiant : le changement
   * de mot de passe part du `sub` du JWT, pas d'un email saisi.
   */
  public async findRawByIdWithHash(id: string): Promise<RawCredentials | null> {
    const doc = await this.model.findById(id).select('+passwordHash').exec();
    return doc ? toCredentials(doc) : null;
  }

  public async create(input: {
    email: string;
    passwordHash: string;
    fullName: string;
    role: UserRole;
    mustChangePassword: boolean;
  }): Promise<UserEntity> {
    const doc = await this.model.create({
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      fullName: input.fullName,
      role: input.role,
      active: true,
      mustChangePassword: input.mustChangePassword,
    });
    return this.toEntity(doc);
  }

  /**
   * Écrit le nouveau hash et lève le drapeau, en une seule opération atomique.
   *
   * Volontairement hors de `save()` : celui-ci ne touche jamais au passwordHash
   * (champ `select:false`), et on ne veut pas qu'une sauvegarde d'entité banale
   * puisse réinitialiser un mot de passe par effet de bord.
   */
  public async updatePassword(id: string, passwordHash: string): Promise<UserEntity> {
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        { $set: { passwordHash, mustChangePassword: false } },
        { new: true, runValidators: true },
      )
      .exec();
    if (!doc) {
      throw new NotFoundError('Utilisateur', id);
    }
    return this.toEntity(doc);
  }

  public async save(entity: UserEntity): Promise<UserEntity> {
    const json = entity.toJSON();
    const doc = await this.updateWithVersion(entity.id, entity.version, {
      $set: { fullName: json.fullName, role: json.role, active: json.active },
    });
    return this.toEntity(doc);
  }

  public async existsByEmail(email: string): Promise<boolean> {
    return this.exists({ email: email.toLowerCase() });
  }
}
