import type { NextFunction, Request, Response } from 'express';

import { metricRepository } from '@/modules/monitoring/metric.repository';

/**
 * Mesure la latence de chaque requête HTTP et l'enregistre dans la collection
 * Time Series (via le repository — jamais Mongoose directement ici).
 *
 * Le coût par requête est négligeable : la mesure est poussée en mémoire
 * (`record`) et l'écriture réelle se fait par lots en tâche de fond. On
 * s'abonne à `finish` pour capturer le statut final et la durée totale.
 */
export function requestMetrics(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    // Les connexions longue durée (flux SSE) fausseraient les latences :
    // leur `finish` ne survient qu'à la déconnexion. On les exclut.
    if (String(res.getHeader('Content-Type')).startsWith('text/event-stream')) return;

    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    // On enregistre le *pattern* de route (ex. `/api/v1/items/:id`) plutôt que
    // l'URL réelle, pour garder un metaField à faible cardinalité côté Time Series.
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;

    metricRepository.record({
      ts: new Date(),
      method: req.method,
      route,
      status: res.statusCode,
      durationMs,
    });
  });

  next();
}
