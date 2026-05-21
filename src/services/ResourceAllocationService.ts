import { BusinessRuleError, NotFoundError } from '@/core/errors';
import type { ItemCategory } from '@/modules/items/item.model';
import type { ItemRepository } from '@/modules/items/item.repository';
import type { EventRepository } from '@/modules/events/event.repository';

/**
 * ============================================================================
 *  ResourceAllocationService — adaptation logistique de l'algorithme du
 *  banquier (Dijkstra, 1965).
 * ============================================================================
 *
 *  Pour pouvoir l'expliquer à l'oral :
 *
 *  L'algorithme du banquier sert à éviter les interblocages (deadlocks) dans
 *  l'allocation de ressources partagées. Originellement conçu pour des
 *  processus OS et des banques (d'où le nom), on l'adapte ici à
 *  l'allocation d'équipements (items par catégorie) à des événements.
 *
 *  Mapping vocabulaire OS → LogiChain :
 *      processus           = événement (eventId)
 *      type de ressource   = catégorie d'item (lighting, sound, staging, …)
 *      max claim           = besoin maximal prévisionnel par catégorie
 *      allocation          = items actuellement alloués à l'événement
 *      need                = max - allocation
 *      available           = items in_stock disponibles dans le pool global
 *
 *  Définition d'un **état sûr (safe state)** :
 *      Il existe au moins une séquence d'événements telle que, pour chaque
 *      événement i de la séquence, on a : need(i) ≤ work, où work est mis à
 *      jour à work += allocation(i) après que l'événement i ait "terminé"
 *      (libéré son matériel). Si une telle séquence existe, chaque besoin
 *      pourra être satisfait à terme — pas de blocage.
 *
 *  Décision d'allocation :
 *      1. On simule l'allocation demandée.
 *      2. On exécute l'algorithme de sécurité (safety algorithm) sur l'état
 *         résultant.
 *      3. Si l'état est sûr → on accorde. Sinon → on refuse (HTTP 422).
 *
 *  Cet algorithme garantit l'absence de goulot d'étranglement structurel
 *  pendant les phases tendues (montage / démontage simultané sur plusieurs
 *  événements partageant le même pool d'équipements).
 * ============================================================================
 */

export interface ResourceVector {
  [category: string]: number;
}

export interface EventClaim {
  eventId: string;
  /** Besoin total prévisionnel par catégorie (max claim). */
  max: ResourceVector;
  /** Items déjà alloués à l'événement. */
  allocated: ResourceVector;
}

export interface AllocationDecision {
  granted: boolean;
  reason: string;
  safeSequence?: string[];
  resultingState?: {
    available: ResourceVector;
    needs: Record<string, ResourceVector>;
  };
}

/**
 * Représentation immutable de l'état d'allocation.
 *
 * Démonstration POO :
 *  - Encapsulation : `_available` et `_claims` sont privés, exposés via getters.
 *  - Méthodes pures (pas de side-effects) : `withAllocation()` retourne un
 *    nouvel objet, jamais de mutation.
 *  - `isSafe()` met en œuvre le safety algorithm classique.
 */
export class ResourceState {
  private readonly _available: ResourceVector;

  private readonly _claims: ReadonlyMap<string, EventClaim>;

  constructor(available: ResourceVector, claims: EventClaim[]) {
    this._available = { ...available };
    const map = new Map<string, EventClaim>();
    for (const c of claims) {
      map.set(c.eventId, {
        eventId: c.eventId,
        max: { ...c.max },
        allocated: { ...c.allocated },
      });
    }
    this._claims = map;
  }

  public get available(): ResourceVector {
    return { ...this._available };
  }

  public get claims(): EventClaim[] {
    return Array.from(this._claims.values()).map((c) => ({
      eventId: c.eventId,
      max: { ...c.max },
      allocated: { ...c.allocated },
    }));
  }

  public needFor(eventId: string): ResourceVector {
    const claim = this._claims.get(eventId);
    if (!claim) return {};
    return subtract(claim.max, claim.allocated);
  }

  /**
   * Retourne un nouvel état où `qty` unités de `category` sont allouées à
   * `eventId`. Ne mute pas l'état actuel.
   */
  public withAllocation(eventId: string, category: ItemCategory, qty: number): ResourceState {
    if (qty <= 0) {
      throw new BusinessRuleError('allocation.invalid_qty', 'La quantité doit être positive');
    }
    const claim = this._claims.get(eventId);
    if (!claim) {
      throw new BusinessRuleError(
        'allocation.unknown_event',
        `Aucune prévision enregistrée pour l'événement ${eventId}`,
      );
    }
    const remaining = (this._available[category] ?? 0) - qty;
    if (remaining < 0) {
      throw new BusinessRuleError(
        'allocation.insufficient_stock',
        `Stock insuffisant pour ${category} (demandé ${qty}, dispo ${this._available[category] ?? 0})`,
        { category, requested: qty, available: this._available[category] ?? 0 },
      );
    }
    const newAvailable = { ...this._available, [category]: remaining };
    const need = (claim.max[category] ?? 0) - (claim.allocated[category] ?? 0);
    if (qty > need) {
      throw new BusinessRuleError(
        'allocation.exceeds_max_claim',
        `Allocation ${qty} excède le besoin restant (${need}) pour ${category}`,
        { category, requested: qty, need },
      );
    }
    const newAllocated = {
      ...claim.allocated,
      [category]: (claim.allocated[category] ?? 0) + qty,
    };
    const newClaim: EventClaim = { eventId, max: { ...claim.max }, allocated: newAllocated };
    const nextClaims = Array.from(this._claims.values()).map((c) =>
      c.eventId === eventId ? newClaim : c,
    );
    return new ResourceState(newAvailable, nextClaims);
  }

  /**
   * Safety algorithm de Dijkstra.
   *
   * 1. work ← available
   * 2. finish[i] ← false pour tout événement i
   * 3. Tant qu'il existe un événement i tel que : finish[i] = false ET need(i) ≤ work
   *       work ← work + allocation(i)
   *       finish[i] ← true
   * 4. Si tous les finish[i] = true → état sûr, et la séquence d'événements
   *    consommés donne la safe sequence.
   */
  public isSafe(): { safe: boolean; sequence: string[] } {
    const work: ResourceVector = { ...this._available };
    const remaining = new Set(Array.from(this._claims.keys()));
    const sequence: string[] = [];

    while (remaining.size > 0) {
      let advanced = false;
      for (const eventId of remaining) {
        const claim = this._claims.get(eventId)!;
        const need = subtract(claim.max, claim.allocated);
        if (vectorLessOrEqual(need, work)) {
          addInPlace(work, claim.allocated);
          sequence.push(eventId);
          remaining.delete(eventId);
          advanced = true;
          break;
        }
      }
      if (!advanced) {
        return { safe: false, sequence };
      }
    }
    return { safe: true, sequence };
  }
}

export class ResourceAllocationService {
  constructor(
    private readonly itemRepo: ItemRepository,
    private readonly eventRepo: EventRepository,
  ) {}

  /**
   * Construit l'état courant à partir de la DB :
   *  - available = items in_stock groupés par catégorie
   *  - claims = pour chaque event actif, ses besoins prévisionnels et son
   *    allocation actuelle (items allocated/in_transit/deployed dont eventId
   *    pointe vers cet event).
   *
   * Les besoins prévisionnels (max) sont fournis par l'appelant — typiquement
   * lus depuis une configuration d'événement, ou estimés à partir de
   * `expectedAttendance`. Cette flexibilité évite de coupler le banquier
   * à une logique de prévision particulière.
   */
  public async buildCurrentState(forecasts: Record<string, ResourceVector>): Promise<ResourceState> {
    const available = await this.computeAvailableStock();
    const claims: EventClaim[] = [];
    for (const [eventId, max] of Object.entries(forecasts)) {
      const event = await this.eventRepo.findById(eventId);
      if (!event) {
        throw new NotFoundError('Event', eventId);
      }
      const allocated = await this.computeEventAllocation(eventId);
      claims.push({ eventId, max, allocated });
    }
    return new ResourceState(available, claims);
  }

  /**
   * Demande d'allocation de `qty` items de `category` à `eventId`.
   * Renvoie la décision avec, en cas de refus, la raison métier exacte.
   */
  public async requestAllocation(
    eventId: string,
    category: ItemCategory,
    qty: number,
    forecasts: Record<string, ResourceVector>,
  ): Promise<AllocationDecision> {
    const state = await this.buildCurrentState(forecasts);

    let candidate: ResourceState;
    try {
      candidate = state.withAllocation(eventId, category, qty);
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        return { granted: false, reason: err.message };
      }
      throw err;
    }

    const safety = candidate.isSafe();
    if (!safety.safe) {
      return {
        granted: false,
        reason:
          'Allocation refusée : l\'état résultant n\'est pas sûr (risque de goulot ' +
          'd\'étranglement sur d\'autres événements).',
      };
    }

    return {
      granted: true,
      reason: 'Allocation possible',
      safeSequence: safety.sequence,
      resultingState: {
        available: candidate.available,
        needs: Object.fromEntries(
          candidate.claims.map((c) => [c.eventId, candidate.needFor(c.eventId)]),
        ),
      },
    };
  }

  private async computeAvailableStock(): Promise<ResourceVector> {
    const available: ResourceVector = {};
    let page = 1;
    const limit = 200;
    while (true) {
      const res = await this.itemRepo.listWithFilters({ status: 'in_stock' }, { page, limit });
      for (const item of res.data) {
        available[item.category] = (available[item.category] ?? 0) + 1;
      }
      if (page >= res.totalPages) break;
      page += 1;
    }
    return available;
  }

  private async computeEventAllocation(eventId: string): Promise<ResourceVector> {
    const allocated: ResourceVector = {};
    let page = 1;
    const limit = 200;
    while (true) {
      const res = await this.itemRepo.listWithFilters({ eventId }, { page, limit });
      for (const item of res.data) {
        if (item.status === 'allocated' || item.status === 'in_transit' || item.status === 'deployed') {
          allocated[item.category] = (allocated[item.category] ?? 0) + 1;
        }
      }
      if (page >= res.totalPages) break;
      page += 1;
    }
    return allocated;
  }
}

// ------------------------ helpers (vecteurs de ressources) ------------------

function subtract(a: ResourceVector, b: ResourceVector): ResourceVector {
  const out: ResourceVector = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    out[k] = (a[k] ?? 0) - (b[k] ?? 0);
  }
  return out;
}

function vectorLessOrEqual(need: ResourceVector, work: ResourceVector): boolean {
  for (const [k, v] of Object.entries(need)) {
    if (v > (work[k] ?? 0)) return false;
  }
  return true;
}

function addInPlace(target: ResourceVector, addend: ResourceVector): void {
  for (const [k, v] of Object.entries(addend)) {
    target[k] = (target[k] ?? 0) + v;
  }
}
