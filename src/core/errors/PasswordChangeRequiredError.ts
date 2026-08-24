import { AppError } from './AppError';

/**
 * 403 — Le compte utilise encore le mot de passe temporaire posé par l'admin
 * à sa création. Toutes les routes métier sont fermées jusqu'à ce que son
 * titulaire l'ait remplacé via PATCH /auth/password.
 *
 * Code distinct de FORBIDDEN : le client mobile doit pouvoir différencier
 * « tu n'as pas le droit » de « change ton mot de passe d'abord », qui appelle
 * une redirection vers un écran dédié et non un message d'erreur.
 */
export class PasswordChangeRequiredError extends AppError {
  constructor(message = 'Mot de passe temporaire : changement obligatoire avant toute action') {
    super('PASSWORD_CHANGE_REQUIRED', message, 403);
  }
}
