import { AppError, type AppErrorDetails } from './AppError';

export class RateLimitError extends AppError {
  constructor(
    message = 'Trop de requêtes, réessayez plus tard',
    details?: AppErrorDetails,
  ) {
    super('RATE_LIMIT_EXCEEDED', message, 429, details);
  }
}
