import { buildApp } from '@/app';
import { env } from '@/config/env';
import { logger } from '@/core/logger';
import { connectMongo, disconnectMongo } from '@/db/mongoose';
import { ademeFactorService } from '@/services/AdemeFactorService';

async function bootstrap(): Promise<void> {
  await connectMongo();

  // Pré-chauffe le cache des facteurs ADEME en arrière-plan.
  // Si l'API ADEME est down, les valeurs fallback restent actives.
  ademeFactorService.warmup();

  const app = buildApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'LogiChain API démarrée');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Arrêt en cours…');
    server.close(() => logger.info('HTTP fermé'));
    await disconnectMongo();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Échec démarrage');
  process.exit(1);
});
