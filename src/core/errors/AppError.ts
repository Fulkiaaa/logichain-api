export interface AppErrorDetails {
  readonly [key: string]: unknown;
}

/**
 * Classe abstraite racine de la hiérarchie d'erreurs métier.
 *
 * Toutes les erreurs lancées par les couches Service et Repository doivent
 * hériter de AppError. Le middleware d'erreur les traduit en réponse HTTP
 * cohérente — voir middlewares/error-handler.middleware.ts.
 *
 * Démonstration POO : encapsulation (props readonly), héritage (sous-classes),
 * polymorphisme (toJSON() surchargeable).
 */
export abstract class AppError extends Error {
  public readonly code: string;

  public readonly httpStatus: number;

  public readonly details?: AppErrorDetails;

  protected constructor(
    code: string,
    message: string,
    httpStatus: number,
    details?: AppErrorDetails,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }

  public toJSON(): {
    code: string;
    message: string;
    details?: AppErrorDetails;
  } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}
