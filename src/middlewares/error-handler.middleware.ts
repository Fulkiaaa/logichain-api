import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

import { AppError, ConflictError, ValidationError } from '@/core/errors';
import { logger } from '@/core/logger';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({ error: err.toJSON() });
    return;
  }

  if (err instanceof ZodError) {
    const wrapped = new ValidationError('Validation échouée', err.issues);
    res.status(wrapped.httpStatus).json({ error: wrapped.toJSON() });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: { fields: Object.keys(err.errors) },
      },
    });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      error: { code: 'INVALID_ID', message: `Identifiant invalide : ${err.value}` },
    });
    return;
  }

  if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
    const wrapped = new ConflictError('Clé unique déjà utilisée');
    res.status(wrapped.httpStatus).json({ error: wrapped.toJSON() });
    return;
  }

  logger.error({ err }, 'Erreur non gérée');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' },
  });
};

export const notFoundHandler: import('express').RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'ROUTE_NOT_FOUND', message: `Route inconnue : ${req.method} ${req.path}` },
  });
};
