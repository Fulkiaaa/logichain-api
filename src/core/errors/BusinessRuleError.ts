import { AppError } from './AppError';

/**
 * 422 — Une règle métier interdit l'opération demandée (input syntaxiquement valide).
 * Exemples : tenter d'allouer un item déjà alloué, transition d'état invalide.
 */
export class BusinessRuleError extends AppError {
  constructor(rule: string, message: string, details?: Record<string, unknown>) {
    super('BUSINESS_RULE_VIOLATION', message, 422, { rule, ...details });
  }
}
