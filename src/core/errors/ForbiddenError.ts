import { AppError } from './AppError';

export class ForbiddenError extends AppError {
  constructor(message = 'Accès refusé') {
    super('FORBIDDEN', message, 403);
  }
}
