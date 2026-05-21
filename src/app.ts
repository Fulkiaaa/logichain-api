import 'express-async-errors';

import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from '@/config/env';
import { logger } from '@/core/logger';
import { errorHandler, notFoundHandler } from '@/middlewares/error-handler.middleware';
import { authRouter } from '@/modules/auth/auth.routes';
import { dashboardRouter } from '@/modules/dashboard/dashboard.routes';
import { eventRouter } from '@/modules/events/event.routes';
import { itemRouter } from '@/modules/items/item.routes';
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

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'logichain-api', timestamp: new Date().toISOString() });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/items', itemRouter);
  app.use('/api/v1/events', eventRouter);
  app.use('/api/v1/routes', routeRouter);
  app.use('/api/v1/dashboard', dashboardRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
