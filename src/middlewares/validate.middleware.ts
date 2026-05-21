import type { RequestHandler } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';

/**
 * Middleware de validation Zod générique.
 * Valide body, params et/ou query avant d'appeler le controller.
 * En cas d'échec, ZodError est levé et capturé par le error-handler.
 */
export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: AnyZodObject;
  query?: AnyZodObject;
}

export const validate =
  (schemas: ValidationSchemas): RequestHandler =>
  (req, _res, next) => {
    if (schemas.params) {
      req.params = schemas.params.parse(req.params) as typeof req.params;
    }
    if (schemas.query) {
      req.query = schemas.query.parse(req.query) as typeof req.query;
    }
    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }
    next();
  };
