import { BusinessRuleError, ConflictError, NotFoundError } from '@/core/errors';

import type { GeoPoint, ItemEntity } from './item.entity';
import type { ItemRepository, ItemFilters } from './item.repository';
import type { PaginatedResult, PaginationOptions } from '@/core/BaseRepository';
import type { CreateItemInput } from './item.schemas';

/**
 * Couche métier Item.
 *
 * Aucune connaissance d'HTTP (pas de req/res). Orchestre le repository et
 * applique les règles transverses (unicité QR, etc.). Les transitions d'état
 * sont déléguées à ItemEntity (machine à états encapsulée).
 */
export class ItemService {
  constructor(private readonly repo: ItemRepository) {}

  public async create(input: CreateItemInput): Promise<ItemEntity> {
    const existing = await this.repo.findByQrCode(input.qrCode);
    if (existing) {
      throw new ConflictError(`Le code QR ${input.qrCode} existe déjà`);
    }
    return this.repo.create({
      qrCode: input.qrCode,
      label: input.label,
      category: input.category,
      status: input.status ?? 'in_stock',
      ...(input.eventId ? { eventId: input.eventId } : {}),
      ...(input.location ? { location: input.location } : {}),
      weightKg: input.weightKg,
      ...(input.purchasePriceEur !== undefined ? { purchasePriceEur: input.purchasePriceEur } : {}),
      lifespanYears: input.lifespanYears ?? 10,
      manufacturingCo2Kg: input.manufacturingCo2Kg ?? 0,
      history: [],
    });
  }

  public async getById(id: string): Promise<ItemEntity> {
    return this.repo.findByIdOrFail(id, 'Item');
  }

  public async getByQrCode(qrCode: string): Promise<ItemEntity> {
    const item = await this.repo.findByQrCode(qrCode);
    if (!item) {
      throw new NotFoundError('Item', qrCode);
    }
    return item;
  }

  public async list(
    filters: ItemFilters,
    options: PaginationOptions,
  ): Promise<PaginatedResult<ItemEntity>> {
    return this.repo.listWithFilters(filters, options);
  }

  public async rename(id: string, label: string): Promise<ItemEntity> {
    const item = await this.getById(id);
    item.rename(label);
    return this.repo.save(item);
  }

  public async scan(id: string, operatorId: string, location: GeoPoint, note?: string): Promise<ItemEntity> {
    const item = await this.getById(id);
    item.recordScan(operatorId, location, note);
    return this.repo.save(item);
  }

  public async scanByQrCode(
    qrCode: string,
    operatorId: string,
    location: GeoPoint,
    note?: string,
  ): Promise<ItemEntity> {
    const item = await this.getByQrCode(qrCode);
    item.recordScan(operatorId, location, note);
    return this.repo.save(item);
  }

  public async allocate(id: string, eventId: string, operatorId: string): Promise<ItemEntity> {
    const item = await this.getById(id);
    item.allocateTo(eventId, operatorId);
    return this.repo.save(item);
  }

  /**
   * Alloue atomiquement un lot d'items à un événement (transaction ACID).
   *
   * Tout-ou-rien : si un seul item est introuvable (404), dans un état non
   * allouable (422) ou en conflit de version (409), la transaction est annulée
   * et AUCUN item du lot n'est alloué. Indispensable lors des phases de montage
   * où l'on réserve d'un coup tout le matériel d'un secteur.
   *
   * La couche métier décide du périmètre atomique ; la mécanique de session est
   * encapsulée dans le repository. `session` est traitée comme un jeton opaque.
   */
  public async allocateBatch(
    eventId: string,
    itemIds: string[],
    operatorId: string,
  ): Promise<ItemEntity[]> {
    const uniqueIds = [...new Set(itemIds)];
    if (uniqueIds.length === 0) {
      throw new BusinessRuleError(
        'item.empty_allocation',
        'La liste d\'items à allouer ne peut pas être vide',
      );
    }

    return this.repo.withTransaction(async (session) => {
      const allocated: ItemEntity[] = [];
      for (const id of uniqueIds) {
        const item = await this.repo.findByIdInSession(id, session);
        if (!item) {
          throw new NotFoundError('Item', id);
        }
        item.allocateTo(eventId, operatorId);
        allocated.push(await this.repo.saveInSession(item, session));
      }
      return allocated;
    });
  }

  public async startTransit(
    id: string,
    operatorId: string,
    location?: GeoPoint,
  ): Promise<ItemEntity> {
    const item = await this.getById(id);
    item.startTransit(operatorId, location);
    return this.repo.save(item);
  }

  public async deploy(id: string, operatorId: string, location: GeoPoint): Promise<ItemEntity> {
    const item = await this.getById(id);
    item.markDeployed(operatorId, location);
    return this.repo.save(item);
  }

  public async reportAnomaly(
    id: string,
    operatorId: string,
    location: GeoPoint,
    note: string,
  ): Promise<ItemEntity> {
    const item = await this.getById(id);
    item.reportAnomaly(operatorId, location, note);
    return this.repo.save(item);
  }

  public async markLost(id: string, operatorId: string, note?: string): Promise<ItemEntity> {
    const item = await this.getById(id);
    item.markLost(operatorId, note);
    return this.repo.save(item);
  }

  public async sendToMaintenance(
    id: string,
    operatorId: string,
    note?: string,
  ): Promise<ItemEntity> {
    const item = await this.getById(id);
    item.sendToMaintenance(operatorId, note);
    return this.repo.save(item);
  }

  public async returnToStock(id: string, operatorId: string): Promise<ItemEntity> {
    const item = await this.getById(id);
    item.returnToStock(operatorId);
    return this.repo.save(item);
  }

  public async remove(id: string): Promise<void> {
    const item = await this.getById(id);
    if (item.status === 'allocated' || item.status === 'in_transit' || item.status === 'deployed') {
      throw new BusinessRuleError(
        'item.cannot_delete_in_use',
        'Impossible de supprimer un item en cours d\'utilisation',
        { currentStatus: item.status },
      );
    }
    const ok = await this.repo.remove(item.id);
    if (!ok) {
      throw new NotFoundError('Item', item.id);
    }
  }
}
