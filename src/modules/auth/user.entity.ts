import { BaseEntity, type BaseEntityJSON, type BaseEntityProps } from '@/core/BaseEntity';

import type { UserRole } from './user.model';

export interface UserProps extends BaseEntityProps {
  email: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
}

export interface UserJSON extends BaseEntityJSON {
  email: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
}

export class UserEntity extends BaseEntity {
  private readonly _email: string;

  private _fullName: string;

  private _role: UserRole;

  private _active: boolean;

  private _mustChangePassword: boolean;

  constructor(props: UserProps) {
    super(props);
    this._email = props.email;
    this._fullName = props.fullName;
    this._role = props.role;
    this._active = props.active;
    this._mustChangePassword = props.mustChangePassword;
  }

  public get email(): string {
    return this._email;
  }
  public get fullName(): string {
    return this._fullName;
  }
  public get role(): UserRole {
    return this._role;
  }
  public get active(): boolean {
    return this._active;
  }
  public get mustChangePassword(): boolean {
    return this._mustChangePassword;
  }

  public deactivate(): void {
    this._active = false;
    this.touch();
  }

  public activate(): void {
    this._active = true;
    this.touch();
  }

  /**
   * Le titulaire a remplacé lui-même le mot de passe temporaire : le compte
   * retrouve l'accès aux routes métier.
   */
  public markPasswordChanged(): void {
    this._mustChangePassword = false;
    this.touch();
  }

  public changeRole(role: UserRole): void {
    this._role = role;
    this.touch();
  }

  public rename(fullName: string): void {
    this._fullName = fullName.trim();
    this.touch();
  }

  public override toJSON(): UserJSON {
    return {
      ...super.toJSON(),
      email: this._email,
      fullName: this._fullName,
      role: this._role,
      active: this._active,
      mustChangePassword: this._mustChangePassword,
    };
  }
}
