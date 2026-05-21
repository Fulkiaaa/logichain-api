import { BaseEntity, type BaseEntityJSON, type BaseEntityProps } from '@/core/BaseEntity';
import { BusinessRuleError } from '@/core/errors';

import type { EventStatus } from './event.model';

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface EventZone {
  id?: string;
  name: string;
  category: 'stage' | 'backstage' | 'public' | 'logistics' | 'parking' | 'restricted' | 'other';
  capacity?: number;
  area: PolygonGeometry;
}

export interface EventProps extends BaseEntityProps {
  name: string;
  slug: string;
  status: EventStatus;
  startDate: Date;
  endDate: Date;
  expectedAttendance?: number;
  zones: EventZone[];
  managerId: string;
}

export interface EventJSON extends BaseEntityJSON {
  name: string;
  slug: string;
  status: EventStatus;
  startDate: string;
  endDate: string;
  expectedAttendance: number | null;
  zones: EventZone[];
  managerId: string;
}

const STATUS_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  planning: ['active', 'cancelled'],
  active: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

export class EventEntity extends BaseEntity {
  private _name: string;

  private readonly _slug: string;

  private _status: EventStatus;

  private _startDate: Date;

  private _endDate: Date;

  private _expectedAttendance?: number;

  private _zones: EventZone[];

  private readonly _managerId: string;

  constructor(props: EventProps) {
    super(props);
    this._name = props.name;
    this._slug = props.slug;
    this._status = props.status;
    this._startDate = props.startDate;
    this._endDate = props.endDate;
    this._expectedAttendance = props.expectedAttendance;
    this._zones = [...props.zones];
    this._managerId = props.managerId;
  }

  public get name(): string {
    return this._name;
  }
  public get slug(): string {
    return this._slug;
  }
  public get status(): EventStatus {
    return this._status;
  }
  public get startDate(): Date {
    return this._startDate;
  }
  public get endDate(): Date {
    return this._endDate;
  }
  public get expectedAttendance(): number | undefined {
    return this._expectedAttendance;
  }
  public get zones(): readonly EventZone[] {
    return this._zones;
  }
  public get managerId(): string {
    return this._managerId;
  }

  public renameTo(name: string): void {
    if (!name.trim()) {
      throw new BusinessRuleError('event.name_required', 'Le nom est obligatoire');
    }
    this._name = name.trim();
    this.touch();
  }

  public reschedule(startDate: Date, endDate: Date): void {
    if (endDate <= startDate) {
      throw new BusinessRuleError(
        'event.invalid_period',
        'endDate doit être postérieure à startDate',
      );
    }
    if (this._status === 'closed' || this._status === 'cancelled') {
      throw new BusinessRuleError(
        'event.cannot_reschedule',
        `Un événement ${this._status} ne peut pas être replanifié`,
      );
    }
    this._startDate = startDate;
    this._endDate = endDate;
    this.touch();
  }

  public addZone(zone: EventZone): void {
    if (this._zones.some((z) => z.name === zone.name)) {
      throw new BusinessRuleError(
        'event.duplicate_zone_name',
        `Une zone "${zone.name}" existe déjà`,
      );
    }
    this._zones.push(zone);
    this.touch();
  }

  public removeZone(zoneId: string): void {
    const before = this._zones.length;
    this._zones = this._zones.filter((z) => z.id !== zoneId);
    if (this._zones.length === before) {
      throw new BusinessRuleError('event.zone_not_found', `Zone ${zoneId} introuvable`);
    }
    this.touch();
  }

  public transitionTo(next: EventStatus): void {
    const allowed = STATUS_TRANSITIONS[this._status];
    if (!allowed.includes(next)) {
      throw new BusinessRuleError(
        'event.invalid_transition',
        `Transition interdite : ${this._status} → ${next}`,
        { from: this._status, to: next, allowed },
      );
    }
    this._status = next;
    this.touch();
  }

  public override toJSON(): EventJSON {
    return {
      ...super.toJSON(),
      name: this._name,
      slug: this._slug,
      status: this._status,
      startDate: this._startDate.toISOString(),
      endDate: this._endDate.toISOString(),
      expectedAttendance: this._expectedAttendance ?? null,
      zones: this._zones,
      managerId: this._managerId,
    };
  }
}
