import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  MONGO_URI: z.string().url().or(z.string().startsWith('mongodb')),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit faire au moins 32 caractères'),
  JWT_EXPIRES_IN: z.string().default('2h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGIN: z.string().default('*'),

  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  // Rate limiting. Limiteur global sur /api/v1 + limiteur strict sur le login
  // (anti brute-force). Fenêtres en millisecondes, max = requêtes par fenêtre.
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  // Protège /docs et /openapi.json par Basic Auth. Vide ou absent = doc ouverte
  // (pratique en dev) — à définir impérativement en prod. On accepte la chaîne
  // vide car docker-compose injecte `${DOCS_USER:-}` (vide) quand non défini.
  DOCS_USER: z.string().optional(),
  DOCS_PASSWORD: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variables d\'environnement invalides :', parsed.error.flatten().fieldErrors);
  throw new Error('Configuration invalide — vérifie ton .env');
}

export const env: AppEnv = parsed.data;
