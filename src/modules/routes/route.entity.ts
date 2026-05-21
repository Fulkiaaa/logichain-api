import { BaseEntity, type BaseEntityJSON, type BaseEntityProps } from '@/core/BaseEntity';
import { BusinessRuleError } from '@/core/errors';

import type { RouteStatus, TransportMode } from './route.model';

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export type StopType = 'pickup' | 'dropoff' | 'transit';

export interface RouteStop {
  id?: string;
  sequence: number;
  label: string;
  type: StopType;
  location: GeoPoint;
  scheduledAt: Date;
  completedAt?: Date;
  itemIds: string[];
  note?: string;
}

export interface RouteProps extends BaseEntityProps {
  reference: string;
  eventId: string;
  transporterId: string;
  mode: TransportMode;
  status: RouteStatus;
  plannedDistanceKm: number;
  actualDistanceKm?: number;
  totalWeightKg: number;
  stops: RouteStop[];
}

export interface RouteJSON extends BaseEntityJSON {
  reference: string;
  eventId: string;
  transporterId: string;
  mode: TransportMode;
  status: RouteStatus;
  plannedDistanceKm: number;
  actualDistanceKm: number | null;
  totalWeightKg: number;
  stops: Array<Omit<RouteStop, 'scheduledAt' | 'completedAt'> & {
    scheduledAt: string;
    completedAt: string | null;
  }>;
}

const STATUS_TRANSITIONS: Record<RouteStatus, RouteStatus[]> = {
  draft: ['planned', 'cancelled'],
  planned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export class RouteEntity extends BaseEntity {
  private readonly _reference: string;

  private readonly _eventId: string;

  private readonly _transporterId: string;

  private readonly _mode: TransportMode;

  private _status: RouteStatus;

  private _plannedDistanceKm: number;

  private _actualDistanceKm?: number;

  private _totalWeightKg: number;

  private _stops: RouteStop[];

  constructor(props: RouteProps) {
    super(props);
    this._reference = props.reference;
    this._eventId = props.eventId;
    this._transporterId = props.transporterId;
    this._mode = props.mode;
    this._status = props.status;
    this._plannedDistanceKm = props.plannedDistanceKm;
    this._actualDistanceKm = props.actualDistanceKm;
    this._totalWeightKg = props.totalWeightKg;
    this._stops = [...props.stops].sort((a, b) => a.sequence - b.sequence);
  }

  public get reference(): string {
    return this._reference;
  }
  public get eventId(): string {
    return this._eventId;
  }
  public get transporterId(): string {
    return this._transporterId;
  }
  public get mode(): TransportMode {
    return this._mode;
  }
  public get status(): RouteStatus {
    return this._status;
  }
  public get plannedDistanceKm(): number {
    return this._plannedDistanceKm;
  }
  public get actualDistanceKm(): number | undefined {
    return this._actualDistanceKm;
  }
  public get totalWeightKg(): number {
    return this._totalWeightKg;
  }
  public get stops(): readonly RouteStop[] {
    return this._stops;
  }

  public transitionTo(next: RouteStatus): void {
    const allowed = STATUS_TRANSITIONS[this._status];
    if (!allowed.includes(next)) {
      throw new BusinessRuleError(
        'route.invalid_transition',
        `Transition interdite : ${this._status} → ${next}`,
        { from: this._status, to: next, allowed },
      );
    }
    this._status = next;
    this.touch();
  }

  public completeStop(stopId: string, completedAt: Date = new Date()): void {
    if (this._status !== 'in_progress') {
      throw new BusinessRuleError(
        'route.not_in_progress',
        `Impossible de valider une étape : route au statut ${this._status}`,
      );
    }
    const stop = this._stops.find((s) => s.id === stopId);
    if (!stop) {
      throw new BusinessRuleError('route.stop_not_found', `Étape ${stopId} introuvable`);
    }
    if (stop.completedAt) {
      throw new BusinessRuleError('route.stop_already_completed', 'Étape déjà validée');
    }
    stop.completedAt = completedAt;
    this.touch();
  }

  public recordActualDistance(km: number): void {
    if (km < 0) {
      throw new BusinessRuleError('route.negative_distance', 'La distance doit être positive');
    }
    this._actualDistanceKm = km;
    this.touch();
  }

  public addItemsToStop(stopId: string, itemIds: string[]): void {
    if (this._status === 'completed' || this._status === 'cancelled') {
      throw new BusinessRuleError(
        'route.cannot_modify',
        `Route ${this._status}, modification impossible`,
      );
    }
    const stop = this._stops.find((s) => s.id === stopId);
    if (!stop) {
      throw new BusinessRuleError('route.stop_not_found', `Étape ${stopId} introuvable`);
    }
    const merged = new Set([...stop.itemIds, ...itemIds]);
    stop.itemIds = Array.from(merged);
    this.touch();
  }

  public setTotalWeight(kg: number): void {
    if (kg < 0) {
      throw new BusinessRuleError('route.negative_weight', 'Le poids doit être positif');
    }
    this._totalWeightKg = kg;
    this.touch();
  }

  public get distanceUsedForCarbonKm(): number {
    return this._actualDistanceKm ?? this._plannedDistanceKm;
  }

  public override toJSON(): RouteJSON {
    return {
      ...super.toJSON(),
      reference: this._reference,
      eventId: this._eventId,
      transporterId: this._transporterId,
      mode: this._mode,
      status: this._status,
      plannedDistanceKm: this._plannedDistanceKm,
      actualDistanceKm: this._actualDistanceKm ?? null,
      totalWeightKg: this._totalWeightKg,
      stops: this._stops.map((s) => ({
        ...(s.id ? { id: s.id } : {}),
        sequence: s.sequence,
        label: s.label,
        type: s.type,
        location: s.location,
        scheduledAt: s.scheduledAt.toISOString(),
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
        itemIds: s.itemIds,
        ...(s.note ? { note: s.note } : {}),
      })),
    };
  }
}
