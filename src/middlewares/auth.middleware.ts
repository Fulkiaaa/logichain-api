import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '@/config/env';
import {
  ForbiddenError,
  PasswordChangeRequiredError,
  UnauthorizedError,
} from '@/core/errors';

export type UserRole = 'admin' | 'logistics_manager' | 'field_agent' | 'transporter';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /**
   * Porté par le jeton plutôt que relu en base : `requireAuth` ne fait aucun
   * appel Mongo, et on ne veut pas lui en ajouter un sur CHAQUE requête pour un
   * cas qui ne concerne que la première connexion. Corollaire : changer son mot
   * de passe doit émettre une nouvelle paire de jetons (voir AuthService).
   */
  mustChangePassword?: boolean;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token Bearer manquant');
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      mustChangePassword: payload.mustChangePassword ?? false,
    };
    next();
  } catch {
    throw new UnauthorizedError('Token invalide ou expiré');
  }
};

/**
 * Variante d'authentification pour le flux SSE : accepte le token soit via le
 * header `Authorization: Bearer`, soit via `?token=` (car l'API navigateur
 * `EventSource` ne permet pas d'envoyer d'en-tête personnalisé).
 */
export const requireAuthFlexible: RequestHandler = (req, _res, next) => {
  let token: string | undefined;
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) {
    token = header.slice('Bearer '.length).trim();
  } else if (typeof req.query.token === 'string' && req.query.token.length > 0) {
    token = req.query.token;
  }

  if (!token) {
    throw new UnauthorizedError('Token Bearer ou paramètre ?token= requis');
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      mustChangePassword: payload.mustChangePassword ?? false,
    };
    next();
  } catch {
    throw new UnauthorizedError('Token invalide ou expiré');
  }
};

/**
 * Ferme toutes les routes métier à un compte encore sur mot de passe temporaire.
 * À placer APRÈS `requireAuth`, jamais sur /auth/me (le client en a besoin pour
 * savoir dans quel état il se trouve) ni sur /auth/password (la sortie de secours).
 */
export const requirePasswordChanged: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    throw new UnauthorizedError();
  }
  if (req.user.mustChangePassword) {
    throw new PasswordChangeRequiredError();
  }
  next();
};

/**
 * Garde de rôle. Le tableau des rôles autorisés est exposé sur le handler
 * (`allowedRoles`) : c'est ce qui permet à `permissionMatrix.test.ts` de relire
 * la matrice d'autorisation réellement branchée sur les routeurs, plutôt que de
 * la redocumenter à côté du code — où elle divergerait tôt ou tard.
 */
export interface RoleGuard extends RequestHandler {
  readonly allowedRoles: readonly UserRole[];
}

export const requireRole = (...allowed: UserRole[]): RoleGuard => {
  const guard: RequestHandler = (req, _res, next) => {
    if (!req.user) {
      throw new UnauthorizedError();
    }
    if (!allowed.includes(req.user.role)) {
      throw new ForbiddenError(`Rôle ${req.user.role} non autorisé`);
    }
    next();
  };
  return Object.assign(guard, { allowedRoles: Object.freeze([...allowed]) });
};
