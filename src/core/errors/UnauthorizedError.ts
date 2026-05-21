import { AppError } from './AppError';

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentification requise') {
    super('UNAUTHORIZED', message, 401);
  }
}
