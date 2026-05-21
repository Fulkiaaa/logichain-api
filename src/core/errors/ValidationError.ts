import type { ZodIssue } from 'zod';

import { AppError } from './AppError';

export class ValidationError extends AppError {
  constructor(message: string, issues?: ZodIssue[]) {
    super(
      'VALIDATION_ERROR',
      message,
      400,
      issues
        ? {
            issues: issues.map((i) => ({
              path: i.path.join('.'),
              code: i.code,
              message: i.message,
            })),
          }
        : undefined,
    );
  }
}
