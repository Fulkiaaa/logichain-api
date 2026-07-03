import { BaseEntity, type BaseEntityJSON, type BaseEntityProps } from '@/core/BaseEntity';
import type { UserRole } from '@/modules/auth/user.model';

import type { NotificationSeverity, NotificationType } from './notification.model';

export interface NotificationProps extends BaseEntityProps {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  eventId?: string | null;
  itemId?: string | null;
  audience: UserRole[];
  read?: boolean;
}

export interface NotificationJSON extends BaseEntityJSON {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  eventId: string | null;
  itemId: string | null;
  audience: UserRole[];
  read: boolean;
}

/**
 * Entité métier d'une notification. Encapsule l'état `read` : seule la méthode
 * `markRead()` peut le muter (règle de transition), comme les autres entités.
 */
export class NotificationEntity extends BaseEntity {
  private readonly _type: NotificationType;
  private readonly _severity: NotificationSeverity;
  private readonly _title: string;
  private readonly _message: string;
  private readonly _eventId: string | null;
  private readonly _itemId: string | null;
  private readonly _audience: UserRole[];
  private _read: boolean;

  constructor(props: NotificationProps) {
    super(props);
    this._type = props.type;
    this._severity = props.severity;
    this._title = props.title;
    this._message = props.message;
    this._eventId = props.eventId ?? null;
    this._itemId = props.itemId ?? null;
    this._audience = props.audience;
    this._read = props.read ?? false;
  }

  public get type(): NotificationType {
    return this._type;
  }

  public get audience(): UserRole[] {
    return this._audience;
  }

  public get read(): boolean {
    return this._read;
  }

  /** Marque la notification comme lue (idempotent). */
  public markRead(): void {
    if (!this._read) {
      this._read = true;
      this.touch();
    }
  }

  public override toJSON(): NotificationJSON {
    return {
      ...super.toJSON(),
      type: this._type,
      severity: this._severity,
      title: this._title,
      message: this._message,
      eventId: this._eventId,
      itemId: this._itemId,
      audience: this._audience,
      read: this._read,
    };
  }
}
