import mongoose, { type FilterQuery } from 'mongoose';

import { BaseRepository, type PaginatedResult, type PaginationOptions } from '@/core/BaseRepository';

import { ItemEntity, type ItemProps } from './item.entity';
import { ItemModel, type ItemDoc, type ItemRaw, type ItemStatus, type ItemCategory } from './item.model';

export interface ItemFilters {
  eventId?: string;
  status?: ItemStatus;
  category?: ItemCategory;
  qrCode?: string;
}

export class ItemRepository extends BaseRepository<ItemEntity, ItemRaw> {
  constructor() {
    super(ItemModel);
  }

  protected toEntity(doc: ItemDoc): ItemEntity {
    const raw = doc.toObject({ virtuals: false });
    const props: ItemProps = {
      id: String(raw._id),
      version: (raw as unknown as { __v: number }).__v ?? 0,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      qrCode: raw.qrCode,
      label: raw.label,
      category: raw.category as ItemCategory,
      status: raw.status as ItemStatus,
      ...(raw.eventId ? { eventId: String(raw.eventId) } : {}),
      ...(raw.location
        ? {
            location: {
              type: 'Point',
              coordinates: raw.location.coordinates as [number, number],
            },
          }
        : {}),
      weightKg: raw.weightKg,
      ...(raw.purchasePriceEur !== undefined && raw.purchasePriceEur !== null
        ? { purchasePriceEur: raw.purchasePriceEur }
        : {}),
      lifespanYears: raw.lifespanYears ?? 10,
      manufacturingCo2Kg: raw.manufacturingCo2Kg ?? 0,
      history: (raw.history ?? []).map((m) => ({
        at: m.at,
        type: m.type,
        ...(m.fromStatus ? { fromStatus: m.fromStatus as ItemStatus } : {}),
        toStatus: m.toStatus as ItemStatus,
        ...(m.location
          ? {
              location: {
                type: 'Point',
                coordinates: m.location.coordinates as [number, number],
              },
            }
          : {}),
        operatorId: m.operatorId,
        ...(m.note ? { note: m.note } : {}),
      })),
    };
    return new ItemEntity(props);
  }

  public async findByQrCode(qrCode: string): Promise<ItemEntity | null> {
    const doc = await this.model.findOne({ qrCode }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  public async listWithFilters(
    filters: ItemFilters,
    options: PaginationOptions,
  ): Promise<PaginatedResult<ItemEntity>> {
    const query: FilterQuery<ItemRaw> = {};
    if (filters.eventId) query.eventId = filters.eventId;
    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = filters.category;
    if (filters.qrCode) query.qrCode = filters.qrCode;
    return this.list(query, options);
  }

  public async create(input: Omit<ItemProps, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<ItemEntity> {
    const doc = await this.model.create({
      qrCode: input.qrCode,
      label: input.label,
      category: input.category,
      status: input.status,
      ...(input.eventId ? { eventId: input.eventId } : {}),
      ...(input.location ? { location: input.location } : {}),
      weightKg: input.weightKg,
      ...(input.purchasePriceEur !== undefined ? { purchasePriceEur: input.purchasePriceEur } : {}),
      lifespanYears: input.lifespanYears,
      manufacturingCo2Kg: input.manufacturingCo2Kg,
      history: input.history,
    });
    return this.toEntity(doc);
  }

  /**
   * Persiste l'état complet d'une entité Item avec contrôle de version.
   * Lance ConflictError si la version locale est obsolète (sync offline).
   */
  public async save(entity: ItemEntity): Promise<ItemEntity> {
    const json = entity.toJSON();
    const update = {
      $set: {
        label: json.label,
        status: json.status,
        eventId: json.eventId ?? null,
        location: json.location ?? null,
        history: json.history.map((h) => ({ ...h, at: new Date(h.at) })),
      },
    };
    const doc = await this.updateWithVersion(entity.id, entity.version, update);
    return this.toEntity(doc);
  }

  public async remove(id: string): Promise<boolean> {
    return this.deleteById(id);
  }

  /**
   * Agrégation utilisée par CarbonFootprintService et par la détection
   * de goulots d'étranglement. Pipeline isolé ici, comme exigé par le sujet.
   */
  public async aggregateByEvent(eventId: string): Promise<{
    total: number;
    byStatus: Record<ItemStatus, number>;
    byCategory: Record<ItemCategory, number>;
    totalWeightKg: number;
    totalManufacturingCo2Kg: number;
  }> {
    const [result] = await this.model
      .aggregate<{
        total: number;
        byStatus: Array<{ k: ItemStatus; v: number }>;
        byCategory: Array<{ k: ItemCategory; v: number }>;
        totalWeightKg: number;
        totalManufacturingCo2Kg: number;
      }>([
        { $match: { eventId: new mongoose.Types.ObjectId(eventId) } },
        {
          $facet: {
            counts: [{ $count: 'total' }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            byCategory: [{ $group: { _id: '$category', count: { $sum: 1 } } }],
            sums: [
              {
                $group: {
                  _id: null,
                  weight: { $sum: '$weightKg' },
                  co2: { $sum: '$manufacturingCo2Kg' },
                },
              },
            ],
          },
        },
        {
          $project: {
            total: { $ifNull: [{ $arrayElemAt: ['$counts.total', 0] }, 0] },
            byStatus: {
              $map: { input: '$byStatus', as: 'b', in: { k: '$$b._id', v: '$$b.count' } },
            },
            byCategory: {
              $map: { input: '$byCategory', as: 'b', in: { k: '$$b._id', v: '$$b.count' } },
            },
            totalWeightKg: { $ifNull: [{ $arrayElemAt: ['$sums.weight', 0] }, 0] },
            totalManufacturingCo2Kg: { $ifNull: [{ $arrayElemAt: ['$sums.co2', 0] }, 0] },
          },
        },
      ])
      .exec();

    const empty = { total: 0, byStatus: [], byCategory: [], totalWeightKg: 0, totalManufacturingCo2Kg: 0 };
    const r = result ?? empty;

    const byStatus = Object.fromEntries(r.byStatus.map((e) => [e.k, e.v])) as Record<
      ItemStatus,
      number
    >;
    const byCategory = Object.fromEntries(r.byCategory.map((e) => [e.k, e.v])) as Record<
      ItemCategory,
      number
    >;

    return {
      total: r.total,
      byStatus,
      byCategory,
      totalWeightKg: r.totalWeightKg,
      totalManufacturingCo2Kg: r.totalManufacturingCo2Kg,
    };
  }
}
