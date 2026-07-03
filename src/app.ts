import 'express-async-errors';

import { apiReference } from '@scalar/express-api-reference';
import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from '@/config/env';
import { logger } from '@/core/logger';
import { openApiDocument } from '@/docs/openapi';
import { docsBasicAuth } from '@/middlewares/docs-auth.middleware';
import { errorHandler, notFoundHandler } from '@/middlewares/error-handler.middleware';
import { requestMetrics } from '@/middlewares/metrics.middleware';
import { authRouter } from '@/modules/auth/auth.routes';
import { dashboardRouter } from '@/modules/dashboard/dashboard.routes';
import { eventRouter } from '@/modules/events/event.routes';
import { itemRouter } from '@/modules/items/item.routes';
import { notificationRouter } from '@/modules/notifications/notification.routes';
import { routeRouter } from '@/modules/routes/route.routes';

export function buildApp(): Application {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  // Monitoring des latences → collection Time Series (écriture bufferisée).
  app.use(requestMetrics);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'logichain-api', timestamp: new Date().toISOString() });
  });

  // Documentation interactive — OpenAPI généré depuis les schémas Zod.
  // Le spec brut est exposé en JSON ; Scalar le rend en UI sur /docs.
  app.get('/openapi.json', docsBasicAuth, (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(
    '/docs',
    docsBasicAuth,
    (_req, res, next) => {
      // Scalar charge son bundle via CDN + styles inline → on lève la CSP stricte ici.
      res.removeHeader('Content-Security-Policy');
      next();
    },
    apiReference({ content: openApiDocument }),
  );

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/items', itemRouter);
  app.use('/api/v1/events', eventRouter);
  app.use('/api/v1/routes', routeRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/notifications', notificationRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
