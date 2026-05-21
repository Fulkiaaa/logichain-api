import { NotFoundError } from '@/core/errors';
import type { EventEntity } from '@/modules/events/event.entity';
import type { EventRepository } from '@/modules/events/event.repository';
import type { ItemEntity } from '@/modules/items/item.entity';
import type { ItemCategory } from '@/modules/items/item.model';
import type { ItemRepository } from '@/modules/items/item.repository';
import type { RouteEntity } from '@/modules/routes/route.entity';
import type { TransportMode } from '@/modules/routes/route.model';
import type { RouteRepository } from '@/modules/routes/route.repository';

import { AdemeFactorService, ademeFactorService } from './AdemeFactorService';

/**
 * ============================================================================
 *  CarbonFootprintService — calcul d'empreinte carbone selon la méthodologie
 *  ADEME Base Carbone®.
 * ============================================================================
 *
 *  Pour pouvoir l'expliquer à l'oral :
 *
 *  1. **Empreinte fabrication amortie (kgCO2e par usage)**
 *     Chaque équipement a un coût carbone de fabrication (manufacturingCo2Kg),
 *     amorti sur sa durée de vie (lifespanYears). On répartit la part qui
 *     "appartient" à l'événement au prorata de sa durée :
 *
 *         co2_manufacturing_per_event = (manufacturingCo2Kg / lifespanYears)
 *                                       × (eventDurationDays / 365)
 *
 *     Justification : un projecteur de 50 kg avec 500 kgCO2e de fabrication
 *     amorti sur 10 ans contribue 50 kgCO2e/an. S'il est utilisé pendant
 *     un festival de 4 jours → 50 × 4/365 ≈ 0,55 kgCO2e pour ce festival.
 *
 *  2. **Empreinte transport (kgCO2e par route)**
 *     Formule canonique ADEME : facteur d'émission × tonnes × kilomètres
 *
 *         co2_transport = (totalWeightKg / 1000) × distanceKm × factor[mode]
 *
 *     Les facteurs (kgCO2e par tonne.km) sont issus de la Base Carbone®
 *     ADEME (base-empreinte.ademe.fr) — version consultée en mai 2026 :
 *
 *         truck (PL 7,5 t < PTAC < 26 t) = 0,772
 *         electric_truck                  = 0,020   (mix élec. amont inclus)
 *         van (VUL diesel)                = 1,000   (ordre de grandeur VUL)
 *         rail (fret ferroviaire)         = 0,004
 *         bike_cargo                      = 0       (négligeable)
 *
 *     Note méthodologique : ces facteurs incluent les émissions amont
 *     (extraction + raffinage du carburant ou production d'électricité)
 *     en plus de la combustion. Le camion électrique n'est pas à zéro :
 *     l'essentiel de ses émissions est déplacé vers la production
 *     d'électricité et la fabrication du véhicule.
 *
 *     On privilégie distance réelle (actualDistanceKm) si disponible,
 *     sinon distance planifiée.
 *
 *  3. **Agrégation par événement**
 *     - Somme des empreintes fabrication des items alloués à l'événement
 *     - Somme des empreintes transport des routes de l'événement
 *     - Breakdown par catégorie d'équipement pour le dashboard KPI
 * ============================================================================
 */

/**
 * @deprecated Les facteurs d'émission sont désormais gérés par
 * `AdemeFactorService` (cache live de l'API ADEME + fallback hardcodé).
 * Cet export reste pour compatibilité ; utilisez `service.getEmissionFactor()`.
 */
export { TRANSPORT_EMISSION_FACTORS } from './AdemeFactorService';

export interface ItemFootprint {
  itemId: string;
  category: ItemCategory;
  manufacturingCo2Kg: number;
  amortizedCo2Kg: number;
}

export interface RouteFootprint {
  routeId: string;
  mode: TransportMode;
  distanceKm: number;
  weightTonnes: number;
  emissionFactor: number;
  co2Kg: number;
}

export interface EventCarbonReport {
  eventId: string;
  eventName: string;
  eventDurationDays: number;
  totalCo2Kg: number;
  manufacturingCo2Kg: number;
  transportCo2Kg: number;
  byCategory: Record<string, number>;
  byTransportMode: Record<string, number>;
  itemCount: number;
  routeCount: number;
}

export class CarbonFootprintService {
  constructor(
    private readonly itemRepo: ItemRepository,
    private readonly eventRepo: EventRepository,
    private readonly routeRepo: RouteRepository,
    private readonly factorService: AdemeFactorService = ademeFactorService,
  ) {}

  /** Renvoie le facteur courant — issu de l'API ADEME ou du fallback. */
  public getEmissionFactor(mode: TransportMode): number {
    return this.factorService.getFactor(mode);
  }

  /**
   * Empreinte fabrication amortie d'un item pour la durée d'un événement.
   * Renvoie 0 si l'item n'a pas de coût carbone fabrication renseigné.
   */
  public computeItemFootprint(item: ItemEntity, eventDurationDays: number): ItemFootprint {
    const annual = item.manufacturingCo2Kg / Math.max(item.lifespanYears, 0.1);
    const amortized = annual * (Math.max(eventDurationDays, 0) / 365);
    return {
      itemId: item.id,
      category: item.category,
      manufacturingCo2Kg: item.manufacturingCo2Kg,
      amortizedCo2Kg: this.round(amortized),
    };
  }

  /** Empreinte transport d'une route (distance × tonnes × facteur ADEME). */
  public computeRouteFootprint(route: RouteEntity): RouteFootprint {
    const distanceKm = route.distanceUsedForCarbonKm;
    const weightTonnes = route.totalWeightKg / 1000;
    const factor = this.factorService.getFactor(route.mode);
    const co2 = distanceKm * weightTonnes * factor;
    return {
      routeId: route.id,
      mode: route.mode,
      distanceKm,
      weightTonnes,
      emissionFactor: factor,
      co2Kg: this.round(co2),
    };
  }

  public computeEventDurationDays(event: EventEntity): number {
    const ms = event.endDate.getTime() - event.startDate.getTime();
    return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }

  /** Rapport d'empreinte agrégé pour un événement (utilisé par le dashboard KPI). */
  public async computeEventReport(eventId: string): Promise<EventCarbonReport> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event', eventId);
    }

    const durationDays = this.computeEventDurationDays(event);
    const items = await this.fetchAllEventItems(eventId);
    const routes = await this.fetchAllEventRoutes(eventId);

    const byCategory: Record<string, number> = {};
    const byTransportMode: Record<string, number> = {};
    let manufacturingTotal = 0;
    let transportTotal = 0;

    for (const item of items) {
      const fp = this.computeItemFootprint(item, durationDays);
      manufacturingTotal += fp.amortizedCo2Kg;
      byCategory[item.category] = this.round((byCategory[item.category] ?? 0) + fp.amortizedCo2Kg);
    }

    for (const route of routes) {
      const fp = this.computeRouteFootprint(route);
      transportTotal += fp.co2Kg;
      byTransportMode[route.mode] = this.round((byTransportMode[route.mode] ?? 0) + fp.co2Kg);
    }

    return {
      eventId,
      eventName: event.name,
      eventDurationDays: durationDays,
      totalCo2Kg: this.round(manufacturingTotal + transportTotal),
      manufacturingCo2Kg: this.round(manufacturingTotal),
      transportCo2Kg: this.round(transportTotal),
      byCategory,
      byTransportMode,
      itemCount: items.length,
      routeCount: routes.length,
    };
  }

  private async fetchAllEventItems(eventId: string): Promise<ItemEntity[]> {
    const all: ItemEntity[] = [];
    let page = 1;
    const limit = 100;
    while (true) {
      const res = await this.itemRepo.listWithFilters({ eventId }, { page, limit });
      all.push(...res.data);
      if (page >= res.totalPages) break;
      page += 1;
    }
    return all;
  }

  private async fetchAllEventRoutes(eventId: string): Promise<RouteEntity[]> {
    const all: RouteEntity[] = [];
    let page = 1;
    const limit = 100;
    while (true) {
      const res = await this.routeRepo.listWithFilters({ eventId }, { page, limit });
      all.push(...res.data);
      if (page >= res.totalPages) break;
      page += 1;
    }
    return all;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
