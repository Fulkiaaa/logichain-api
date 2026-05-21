import { BaseEntity, type BaseEntityJSON, type BaseEntityProps } from '@/core/BaseEntity';

import type { UserRole } from './user.model';

export interface UserProps extends BaseEntityProps {
  email: string;
  fullName: string;
  role: UserRole;
  active: boolean;
}

export interface UserJSON extends BaseEntityJSON {
  email: string;
  fullName: string;
  role: UserRole;
  active: boolean;
}

export class UserEntity extends BaseEntity {
  private readonly _email: string;

  private _fullName: string;

  private _role: UserRole;

  private _active: boolean;

  constructor(props: UserProps) {
    super(props);
    this._email = props.email;
    this._fullName = props.fullName;
    this._role = props.role;
    this._active = props.active;
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

  public deactivate(): void {
    this._active = false;
    this.touch();
  }

  public activate(): void {
    this._active = true;
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
    };
  }
}
