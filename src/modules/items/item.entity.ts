import { BaseEntity, type BaseEntityJSON, type BaseEntityProps } from '@/core/BaseEntity';
import { BusinessRuleError } from '@/core/errors';

import type { ItemCategory, ItemStatus } from './item.model';

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface ItemMovement {
  at: Date;
  type: 'scan' | 'allocation' | 'transit' | 'deploy' | 'maintenance' | 'anomaly' | 'return';
  fromStatus?: ItemStatus;
  toStatus: ItemStatus;
  location?: GeoPoint;
  operatorId: string;
  note?: string;
}

export interface ItemProps extends BaseEntityProps {
  qrCode: string;
  label: string;
  category: ItemCategory;
  status: ItemStatus;
  eventId?: string;
  location?: GeoPoint;
  weightKg: number;
  purchasePriceEur?: number;
  lifespanYears: number;
  manufacturingCo2Kg: number;
  history: ItemMovement[];
}

export interface ItemJSON extends BaseEntityJSON {
  qrCode: string;
  label: string;
  category: ItemCategory;
  status: ItemStatus;
  eventId: string | null;
  location: GeoPoint | null;
  weightKg: number;
  purchasePriceEur: number | null;
  lifespanYears: number;
  manufacturingCo2Kg: number;
  history: Array<Omit<ItemMovement, 'at'> & { at: string }>;
}

/**
 * Transitions d'état autorisées pour un item.
 * Toute autre transition lève BusinessRuleError (HTTP 422).
 */
const ALLOWED_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  in_stock: ['allocated', 'in_maintenance', 'lost'],
  allocated: ['in_transit', 'in_stock', 'lost'],
  in_transit: ['deployed', 'lost', 'in_stock'],
  deployed: ['in_transit', 'in_maintenance', 'lost', 'in_stock'],
  in_maintenance: ['in_stock', 'lost'],
  lost: [],
};

/**
 * Entité métier Item.
 *
 * Démonstration POO :
 *  - Héritage : étend BaseEntity (id, version, dates, toJSON polymorphique).
 *  - Encapsulation : tous les champs sont privés, exposés via getters readonly.
 *    Les mutations passent obligatoirement par des méthodes métier qui valident
 *    les transitions d'état (machine à états).
 *  - Polymorphisme : toJSON() surchargé, retourne la forme publique de l'item.
 */
export class ItemEntity extends BaseEntity {
  private readonly _qrCode: string;

  private _label: string;

  private readonly _category: ItemCategory;

  private _status: ItemStatus;

  private _eventId?: string;

  private _location?: GeoPoint;

  private readonly _weightKg: number;

  private readonly _purchasePriceEur?: number;

  private readonly _lifespanYears: number;

  private readonly _manufacturingCo2Kg: number;

  private readonly _history: ItemMovement[];

  constructor(props: ItemProps) {
    super(props);
    this._qrCode = props.qrCode;
    this._label = props.label;
    this._category = props.category;
    this._status = props.status;
    this._eventId = props.eventId;
    this._location = props.location;
    this._weightKg = props.weightKg;
    this._purchasePriceEur = props.purchasePriceEur;
    this._lifespanYears = props.lifespanYears;
    this._manufacturingCo2Kg = props.manufacturingCo2Kg;
    this._history = [...props.history];
  }

  public get qrCode(): string {
    return this._qrCode;
  }
  public get label(): string {
    return this._label;
  }
  public get category(): ItemCategory {
    return this._category;
  }
  public get status(): ItemStatus {
    return this._status;
  }
  public get eventId(): string | undefined {
    return this._eventId;
  }
  public get location(): GeoPoint | undefined {
    return this._location;
  }
  public get weightKg(): number {
    return this._weightKg;
  }
  public get purchasePriceEur(): number | undefined {
    return this._purchasePriceEur;
  }
  public get lifespanYears(): number {
    return this._lifespanYears;
  }
  public get manufacturingCo2Kg(): number {
    return this._manufacturingCo2Kg;
  }
  public get history(): readonly ItemMovement[] {
    return this._history;
  }

  /** Renomme l'item (information non critique). */
  public rename(newLabel: string): void {
    if (!newLabel.trim()) {
      throw new BusinessRuleError('item.label_required', 'Le label ne peut pas être vide');
    }
    this._label = newLabel.trim();
    this.touch();
  }

  /**
   * Alloue l'item à un événement. Transition : in_stock → allocated.
   * Idempotente si déjà alloué au même event.
   */
  public allocateTo(eventId: string, operatorId: string): void {
    if (this._status === 'allocated' && this._eventId === eventId) {
      return;
    }
    this.assertTransition('allocated');
    const previous = this._status;
    this._eventId = eventId;
    this._status = 'allocated';
    this.appendMovement({
      at: new Date(),
      type: 'allocation',
      fromStatus: previous,
      toStatus: 'allocated',
      operatorId,
    });
    this.touch();
  }

  /**
   * Scan terrain : géolocalise et incrémente l'historique sans changer de statut.
   * C'est l'action principale des agents PWA.
   */
  public recordScan(operatorId: string, location: GeoPoint, note?: string): void {
    this._location = location;
    this.appendMovement({
      at: new Date(),
      type: 'scan',
      fromStatus: this._status,
      toStatus: this._status,
      location,
      operatorId,
      ...(note ? { note } : {}),
    });
    this.touch();
  }

  /** Démarre le transit (allocated → in_transit). */
  public startTransit(operatorId: string, location?: GeoPoint): void {
    this.assertTransition('in_transit');
    const previous = this._status;
    this._status = 'in_transit';
    if (location) this._location = location;
    this.appendMovement({
      at: new Date(),
      type: 'transit',
      fromStatus: previous,
      toStatus: 'in_transit',
      ...(location ? { location } : {}),
      operatorId,
    });
    this.touch();
  }

  /** Déployé sur site (in_transit → deployed). */
  public markDeployed(operatorId: string, location: GeoPoint): void {
    this.assertTransition('deployed');
    const previous = this._status;
    this._status = 'deployed';
    this._location = location;
    this.appendMovement({
      at: new Date(),
      type: 'deploy',
      fromStatus: previous,
      toStatus: 'deployed',
      location,
      operatorId,
    });
    this.touch();
  }

  /** Anomalie géolocalisée (n'altère pas le statut, ajoute à l'historique). */
  public reportAnomaly(operatorId: string, location: GeoPoint, note: string): void {
    if (!note.trim()) {
      throw new BusinessRuleError(
        'item.anomaly_note_required',
        'Une note décrivant l\'anomalie est obligatoire',
      );
    }
    this._location = location;
    this.appendMovement({
      at: new Date(),
      type: 'anomaly',
      fromStatus: this._status,
      toStatus: this._status,
      location,
      operatorId,
      note: note.trim(),
    });
    this.touch();
  }

  /** Marque l'item comme perdu (état terminal). */
  public markLost(operatorId: string, note?: string): void {
    this.assertTransition('lost');
    const previous = this._status;
    this._status = 'lost';
    this.appendMovement({
      at: new Date(),
      type: 'anomaly',
      fromStatus: previous,
      toStatus: 'lost',
      operatorId,
      ...(note ? { note } : {}),
    });
    this.touch();
  }

  /** Retour stock (deployed → in_transit → in_stock ou direct). */
  public returnToStock(operatorId: string): void {
    this.assertTransition('in_stock');
    const previous = this._status;
    this._status = 'in_stock';
    this._eventId = undefined;
    this.appendMovement({
      at: new Date(),
      type: 'return',
      fromStatus: previous,
      toStatus: 'in_stock',
      operatorId,
    });
    this.touch();
  }

  private assertTransition(target: ItemStatus): void {
    const allowed = ALLOWED_TRANSITIONS[this._status];
    if (!allowed.includes(target)) {
      throw new BusinessRuleError(
        'item.invalid_transition',
        `Transition interdite : ${this._status} → ${target}`,
        { from: this._status, to: target, allowed },
      );
    }
  }

  private appendMovement(m: ItemMovement): void {
    this._history.push(m);
  }

  public override toJSON(): ItemJSON {
    return {
      ...super.toJSON(),
      qrCode: this._qrCode,
      label: this._label,
      category: this._category,
      status: this._status,
      eventId: this._eventId ?? null,
      location: this._location ?? null,
      weightKg: this._weightKg,
      purchasePriceEur: this._purchasePriceEur ?? null,
      lifespanYears: this._lifespanYears,
      manufacturingCo2Kg: this._manufacturingCo2Kg,
      history: this._history.map((m) => ({ ...m, at: m.at.toISOString() })),
    };
  }
}
