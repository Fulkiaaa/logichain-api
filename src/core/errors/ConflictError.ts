import { AppError } from './AppError';

/**
 * 409 — Conflit de version (verrouillage optimiste) ou contrainte unique violée.
 * Utilisé notamment quand un client offline tente d'écraser une version plus récente.
 */
export class ConflictError extends AppError {
  constructor(message: string, expectedVersion?: number, actualVersion?: number) {
    super('CONFLICT', message, 409, {
      ...(expectedVersion !== undefined ? { expectedVersion } : {}),
      ...(actualVersion !== undefined ? { actualVersion } : {}),
    });
  }
}
