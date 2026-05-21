import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '@/config/env';
import { ForbiddenError, UnauthorizedError } from '@/core/errors';

export type UserRole = 'admin' | 'logistics_manager' | 'field_agent' | 'transporter';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token Bearer manquant');
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    throw new UnauthorizedError('Token invalide ou expiré');
  }
};

export const requireRole =
  (...allowed: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) {
      throw new UnauthorizedError();
    }
    if (!allowed.includes(req.user.role)) {
      throw new ForbiddenError(`Rôle ${req.user.role} non autorisé`);
    }
    next();
  };
