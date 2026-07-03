import { rateLimit, type Options } from 'express-rate-limit';

import { env } from '@/config/env';
import { RateLimitError } from '@/core/errors';
import { logger } from '@/core/logger';

/**
 * Rate limiting applicatif (protection anti-abus / anti brute-force).
 *
 * Deux limiteurs :
 *  - `apiLimiter`   : plafond global sur toute l'API (/api/v1), par IP.
 *  - `loginLimiter` : plafond strict sur POST /auth/login. Ne compte que les
 *    tentatives *échouées* (`skipSuccessfulRequests`) : un utilisateur légitime
 *    n'est jamais pénalisé, seules les tentatives ratées s'accumulent.
 *
 * Le dépassement renvoie un HTTP 429 au format d'erreur maison
 * `{ error: { code, message } }`, cohérent avec error-handler.middleware.ts.
 *
 * Note : derrière un reverse proxy (Traefik en prod), l'app active
 * `trust proxy` pour que le limiteur voie l'IP réelle du client, pas celle
 * du proxy (voir app.ts).
 */
function jsonHandler(message: string): Options['handler'] {
  return (req, res, _next, options) => {
    logger.warn(
      { ip: req.ip, path: req.path, method: req.method },
      'Rate limit dépassé',
    );
    const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
    const error = new RateLimitError(message, { retryAfterSeconds });
    res.status(error.httpStatus).json({ error: error.toJSON() });
  };
}

/** Limiteur global : appliqué à /api/v1 dans app.ts. */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler('Trop de requêtes, réessayez plus tard'),
});

/** Limiteur strict pour le login : appliqué à POST /auth/login. */
export const loginLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler(
    'Trop de tentatives de connexion, réessayez dans quelques minutes',
  ),
});
