import { BaseRepository } from '@/core/BaseRepository';

import { UserEntity } from './user.entity';
import { UserModel, type UserDoc, type UserRaw, type UserRole } from './user.model';

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
  ): Promise<{ id: string; passwordHash: string; role: UserRole; active: boolean } | null> {
    const doc = await this.model
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .exec();
    if (!doc) return null;
    return {
      id: String(doc._id),
      passwordHash: (doc as unknown as { passwordHash: string }).passwordHash,
      role: doc.role as UserRole,
      active: doc.active ?? true,
    };
  }

  public async create(input: {
    email: string;
    passwordHash: string;
    fullName: string;
    role: UserRole;
  }): Promise<UserEntity> {
    const doc = await this.model.create({
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      fullName: input.fullName,
      role: input.role,
      active: true,
    });
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
