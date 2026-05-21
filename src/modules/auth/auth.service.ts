import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';

import { env } from '@/config/env';
import { ConflictError, UnauthorizedError } from '@/core/errors';
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

  private signAccessToken(user: UserEntity): string {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const opts: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
    return jwt.sign(payload, env.JWT_SECRET, opts);
  }

  private signRefreshToken(user: UserEntity): string {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const opts: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'] };
    return jwt.sign(payload, env.JWT_SECRET, opts);
  }
}
