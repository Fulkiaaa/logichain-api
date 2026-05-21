import { AppError } from './AppError';

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      'NOT_FOUND',
      id ? `${resource} ${id} introuvable` : `${resource} introuvable`,
      404,
      id ? { resource, id } : { resource },
    );
  }
}
