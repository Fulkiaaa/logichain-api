/**
 * Classe abstraite racine de toutes les entités métier.
 *
 * Justification de l'héritage (exigence POO du sujet) :
 *  - Chaque entité possède un identifiant, une version (verrouillage optimiste
 *    pour la synchro offline), et des timestamps. Centraliser ces champs ici
 *    évite la duplication et garantit l'uniformité.
 *  - Sérialisation HTTP polymorphique via toJSON() : chaque sous-classe surcharge
 *    pour exposer ses propres champs publics, mais l'API d'appel reste identique.
 *  - Encapsulation : les champs sont protégés (props privées + getters), seules
 *    les méthodes métier de la sous-classe peuvent les muter.
 */
export abstract class BaseEntity {
  protected readonly _id: string;

  protected _version: number;

  protected readonly _createdAt: Date;

  protected _updatedAt: Date;

  protected constructor(props: BaseEntityProps) {
    this._id = props.id;
    this._version = props.version ?? 0;
    this._createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? this._createdAt;
  }

  public get id(): string {
    return this._id;
  }

  public get version(): number {
    return this._version;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Marque l'entité comme modifiée. Appelée par les méthodes métier des sous-classes
   * après chaque transition d'état.
   */
  protected touch(): void {
    this._updatedAt = new Date();
  }

  /**
   * Sérialisation polymorphique pour les réponses HTTP.
   * Les sous-classes DOIVENT surcharger et appeler super.toJSON() pour récupérer
   * les champs communs (id, version, dates).
   */
  public toJSON(): BaseEntityJSON {
    return {
      id: this._id,
      version: this._version,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}

export interface BaseEntityProps {
  id: string;
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BaseEntityJSON {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
