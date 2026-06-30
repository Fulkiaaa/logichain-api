import { createHash, timingSafeEqual } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { env } from '@/config/env';

/**
 * Comparaison à temps constant : on hashe les deux chaînes (digest de longueur
 * fixe) avant `timingSafeEqual`, ce qui évite à la fois la fuite par timing ET
 * la fuite de longueur (timingSafeEqual exige des buffers de même taille).
 */
const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest();
const safeEqual = (a: string, b: string): boolean => timingSafeEqual(sha256(a), sha256(b));

/**
 * Protège la documentation (/docs et /openapi.json) par HTTP Basic Auth.
 *
 * Identifiants via `DOCS_USER` / `DOCS_PASSWORD`. Si l'un des deux n'est pas
 * défini, la doc reste ouverte (confort en dev) — à configurer en production.
 */
export function docsBasicAuth(req: Request, res: Response, next: NextFunction): void {
  if (!env.DOCS_USER || !env.DOCS_PASSWORD) {
    next();
    return;
  }

  const header = req.headers.authorization ?? '';
  const [scheme, encoded] = header.split(' ');

  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep !== -1) {
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      // Pas de court-circuit entre les deux vérifs (on évalue toujours les deux).
      const okUser = safeEqual(user, env.DOCS_USER);
      const okPass = safeEqual(pass, env.DOCS_PASSWORD);
      if (okUser && okPass) {
        next();
        return;
      }
    }
  }

  res
    .set('WWW-Authenticate', 'Basic realm="LogiChain Docs", charset="UTF-8"')
    .status(401)
    .json({
      error: { code: 'UNAUTHORIZED', message: 'Authentification requise pour la documentation' },
    });
}
