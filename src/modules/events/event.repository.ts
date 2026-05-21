import type { FilterQuery } from 'mongoose';

import { BaseRepository, type PaginatedResult, type PaginationOptions } from '@/core/BaseRepository';

import { EventEntity, type EventProps, type EventZone, type PolygonGeometry } from './event.entity';
import { EventModel, type EventDoc, type EventRaw, type EventStatus } from './event.model';

export interface EventFilters {
  status?: EventStatus;
  managerId?: string;
  startsAfter?: Date;
  endsBefore?: Date;
}

export class EventRepository extends BaseRepository<EventEntity, EventRaw> {
  constructor() {
    super(EventModel);
  }

  protected toEntity(doc: EventDoc): EventEntity {
    const raw = doc.toObject({ virtuals: false });
    const props: EventProps = {
      id: String(raw._id),
      version: (raw as unknown as { __v: number }).__v ?? 0,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      name: raw.name,
      slug: raw.slug,
      status: raw.status as EventStatus,
      startDate: raw.startDate,
      endDate: raw.endDate,
      ...(raw.expectedAttendance !== undefined && raw.expectedAttendance !== null
        ? { expectedAttendance: raw.expectedAttendance }
        : {}),
      zones: (raw.zones ?? []).map(
        (z): EventZone => ({
          id: z._id ? String(z._id) : undefined,
          name: z.name,
          category: z.category as EventZone['category'],
          ...(z.capacity !== undefined && z.capacity !== null ? { capacity: z.capacity } : {}),
          area: {
            type: 'Polygon',
            coordinates: z.area.coordinates as unknown as PolygonGeometry['coordinates'],
          },
        }),
      ),
      managerId: raw.managerId,
    };
    return new EventEntity(props);
  }

  public async findBySlug(slug: string): Promise<EventEntity | null> {
    const doc = await this.model.findOne({ slug }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  public async listWithFilters(
    filters: EventFilters,
    options: PaginationOptions,
  ): Promise<PaginatedResult<EventEntity>> {
    const query: FilterQuery<EventRaw> = {};
    if (filters.status) query.status = filters.status;
    if (filters.managerId) query.managerId = filters.managerId;
    if (filters.startsAfter) query.startDate = { $gte: filters.startsAfter };
    if (filters.endsBefore) query.endDate = { $lte: filters.endsBefore };
    return this.list(query, options);
  }

  public async create(
    input: Omit<EventProps, 'id' | 'version' | 'createdAt' | 'updatedAt'>,
  ): Promise<EventEntity> {
    const doc = await this.model.create({
      name: input.name,
      slug: input.slug,
      status: input.status,
      startDate: input.startDate,
      endDate: input.endDate,
      ...(input.expectedAttendance !== undefined ? { expectedAttendance: input.expectedAttendance } : {}),
      zones: input.zones,
      managerId: input.managerId,
    });
    return this.toEntity(doc);
  }

  public async save(entity: EventEntity): Promise<EventEntity> {
    const json = entity.toJSON();
    const update = {
      $set: {
        name: json.name,
        status: json.status,
        startDate: new Date(json.startDate),
        endDate: new Date(json.endDate),
        expectedAttendance: json.expectedAttendance,
        zones: json.zones.map((z) => ({
          ...(z.id ? { _id: z.id } : {}),
          name: z.name,
          category: z.category,
          ...(z.capacity !== undefined ? { capacity: z.capacity } : {}),
          area: z.area,
        })),
      },
    };
    const doc = await this.updateWithVersion(entity.id, entity.version, update);
    return this.toEntity(doc);
  }

  public async remove(id: string): Promise<boolean> {
    return this.deleteById(id);
  }
}
