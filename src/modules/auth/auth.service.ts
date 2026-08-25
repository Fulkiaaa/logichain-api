import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';

import { env } from '@/config/env';
import { BusinessRuleError, ConflictError, UnauthorizedError } from '@/core/errors';
import type { JwtPayload } from '@/middlewares/auth.middleware';

import type { UserEntity } from './user.entity';
import type { UserRole } from './user.model';
import type { UserRepository } from './user.repository';

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  role?: UserRole;
}

export interface LoginResult {
  token: string;
  refreshToken: string;
  user: ReturnType<UserEntity['toJSON']>;
}

export class AuthService {
  constructor(private readonly users: UserRepository) {}

  public async register(input: RegisterInput): Promise<UserEntity> {
    if (await this.users.existsByEmail(input.email)) {
      throw new ConflictError(`L'email ${input.email} est déjà utilisé`);
    }
    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
    return this.users.create({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      role: input.role ?? 'field_agent',
      // Un mot de passe choisi par l'admin n'est jamais définitif : son
      // titulaire devra le remplacer avant d'accéder à quoi que ce soit.
      mustChangePassword: true,
    });
  }

  public async login(email: string, password: string): Promise<LoginResult> {
    const raw = await this.users.findRawByEmailWithHash(email);
    if (!raw) {
      // Pas d'info de différenciation : évite le user-enumeration
      throw new UnauthorizedError('Email ou mot de passe invalide');
    }
    if (!raw.active) {
      throw new UnauthorizedError('Compte désactivé');
    }
    const ok = await bcrypt.compare(password, raw.passwordHash);
    if (!ok) {
      throw new UnauthorizedError('Email ou mot de passe invalide');
    }
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError();
    }
    return {
      token: this.signAccessToken(user),
      refreshToken: this.signRefreshToken(user),
      user: user.toJSON(),
    };
  }

  public async refresh(refreshToken: string): Promise<LoginResult> {
    let payload: JwtPayload;
    try {
      payload = jwt.verify(refreshToken, env.JWT_SECRET) as JwtPayload;
    } catch {
      throw new UnauthorizedError('Refresh token invalide ou expiré');
    }
    const user = await this.users.findById(payload.sub);
    if (!user || !user.active) {
      throw new UnauthorizedError();
    }
    return {
      token: this.signAccessToken(user),
      refreshToken: this.signRefreshToken(user),
      user: user.toJSON(),
    };
  }

  /**
   * Remplacement du mot de passe par son titulaire (identifié par le JWT).
   *
   * Renvoie une paire de jetons NEUVE : l'ancienne porte encore
   * `mustChangePassword: true` et laisserait le compte bloqué par
   * `requirePasswordChanged` jusqu'à son expiration.
   */
  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<LoginResult> {
    const raw = await this.users.findRawByIdWithHash(userId);
    if (!raw || !raw.active) {
      throw new UnauthorizedError();
    }
    const ok = await bcrypt.compare(currentPassword, raw.passwordHash);
    if (!ok) {
      throw new UnauthorizedError('Mot de passe actuel invalide');
    }
    if (await bcrypt.compare(newPassword, raw.passwordHash)) {
      throw new BusinessRuleError(
        'password.must_differ',
        'Le nouveau mot de passe doit être différent de l\'actuel',
      );
    }
    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
    const user = await this.users.updatePassword(userId, passwordHash);
    return {
      token: this.signAccessToken(user),
      refreshToken: this.signRefreshToken(user),
      user: user.toJSON(),
    };
  }

  /**
   * Profil complet du titulaire du jeton. Le JWT ne porte que l'identité
   * minimale (id, email, rôle) : le `fullName` et l'état `active` doivent être
   * relus en base. Un seul appel Mongo, au démarrage de l'app cliente — c'est
   * précisément pour ça que `requireAuth` n'en fait aucun sur les autres routes.
   */
  public async me(userId: string): Promise<UserEntity> {
    const user = await this.users.findById(userId);
    if (!user || !user.active) {
      throw new UnauthorizedError();
    }
    return user;
  }

  private signAccessToken(user: UserEntity): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
    const opts: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
    return jwt.sign(payload, env.JWT_SECRET, opts);
  }

  private signRefreshToken(user: UserEntity): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
    const opts: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'] };
    return jwt.sign(payload, env.JWT_SECRET, opts);
  }
}
