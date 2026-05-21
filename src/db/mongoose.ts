import mongoose from 'mongoose';

import { env } from '@/config/env';
import { logger } from '@/core/logger';

export async function connectMongo(): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => logger.info('Mongo connecté'));
  mongoose.connection.on('disconnected', () => logger.warn('Mongo déconnecté'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'Erreur Mongo'));

  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
  });

  return mongoose;
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
