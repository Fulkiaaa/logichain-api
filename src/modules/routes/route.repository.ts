import type { FilterQuery } from 'mongoose';

import { BaseRepository, type PaginatedResult, type PaginationOptions } from '@/core/BaseRepository';

import { RouteEntity, type RouteProps, type RouteStop } from './route.entity';
import {
  RouteModel,
  type RouteDoc,
  type RouteRaw,
  type RouteStatus,
  type TransportMode,
} from './route.model';

export interface RouteFilters {
  eventId?: string;
  transporterId?: string;
  status?: RouteStatus;
  mode?: TransportMode;
}

export class RouteRepository extends BaseRepository<RouteEntity, RouteRaw> {
  constructor() {
    super(RouteModel);
  }

  protected toEntity(doc: RouteDoc): RouteEntity {
    const raw = doc.toObject({ virtuals: false });
    const props: RouteProps = {
      id: String(raw._id),
      version: (raw as unknown as { __v: number }).__v ?? 0,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      reference: raw.reference,
      eventId: String(raw.eventId),
      transporterId: raw.transporterId,
      mode: raw.mode as TransportMode,
      status: raw.status as RouteStatus,
      plannedDistanceKm: raw.plannedDistanceKm,
      ...(raw.actualDistanceKm !== undefined && raw.actualDistanceKm !== null
        ? { actualDistanceKm: raw.actualDistanceKm }
        : {}),
      totalWeightKg: raw.totalWeightKg ?? 0,
      stops: (raw.stops ?? []).map(
        (s): RouteStop => ({
          id: s._id ? String(s._id) : undefined,
          sequence: s.sequence,
          label: s.label,
          type: s.type as RouteStop['type'],
          location: {
            type: 'Point',
            coordinates: s.location.coordinates as [number, number],
          },
          scheduledAt: s.scheduledAt,
          ...(s.completedAt ? { completedAt: s.completedAt } : {}),
          itemIds: (s.itemIds ?? []).map((id) => String(id)),
          ...(s.note ? { note: s.note } : {}),
        }),
      ),
    };
    return new RouteEntity(props);
  }

  public async findByReference(reference: string): Promise<RouteEntity | null> {
    const doc = await this.model.findOne({ reference }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  public async listWithFilters(
    filters: RouteFilters,
    options: PaginationOptions,
  ): Promise<PaginatedResult<RouteEntity>> {
    const query: FilterQuery<RouteRaw> = {};
    if (filters.eventId) query.eventId = filters.eventId;
    if (filters.transporterId) query.transporterId = filters.transporterId;
    if (filters.status) query.status = filters.status;
    if (filters.mode) query.mode = filters.mode;
    return this.list(query, options);
  }

  public async create(
    input: Omit<RouteProps, 'id' | 'version' | 'createdAt' | 'updatedAt'>,
  ): Promise<RouteEntity> {
    const doc = await this.model.create({
      reference: input.reference,
      eventId: input.eventId,
      transporterId: input.transporterId,
      mode: input.mode,
      status: input.status,
      plannedDistanceKm: input.plannedDistanceKm,
      ...(input.actualDistanceKm !== undefined ? { actualDistanceKm: input.actualDistanceKm } : {}),
      totalWeightKg: input.totalWeightKg,
      stops: input.stops,
    });
    return this.toEntity(doc);
  }

  public async save(entity: RouteEntity): Promise<RouteEntity> {
    const json = entity.toJSON();
    const update = {
      $set: {
        status: json.status,
        plannedDistanceKm: json.plannedDistanceKm,
        actualDistanceKm: json.actualDistanceKm,
        totalWeightKg: json.totalWeightKg,
        stops: json.stops.map((s) => ({
          ...(s.id ? { _id: s.id } : {}),
          sequence: s.sequence,
          label: s.label,
          type: s.type,
          location: s.location,
          scheduledAt: new Date(s.scheduledAt),
          ...(s.completedAt ? { completedAt: new Date(s.completedAt) } : {}),
          itemIds: s.itemIds,
          ...(s.note ? { note: s.note } : {}),
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
