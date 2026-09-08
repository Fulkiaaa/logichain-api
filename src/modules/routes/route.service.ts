import type { PaginatedResult, PaginationOptions } from '@/core/BaseRepository';
import { ConflictError } from '@/core/errors';

import type { RouteEntity } from './route.entity';
import type { RouteStatus } from './route.model';
import type { RouteFilters, RouteRepository } from './route.repository';
import type { CreateRouteInput } from './route.schemas';

export class RouteService {
  constructor(private readonly repo: RouteRepository) {}

  public async create(input: CreateRouteInput): Promise<RouteEntity> {
    const existing = await this.repo.findByReference(input.reference);
    if (existing) {
      throw new ConflictError(`La référence "${input.reference}" existe déjà`);
    }
    return this.repo.create({
      reference: input.reference,
      eventId: input.eventId,
      transporterId: input.transporterId,
      mode: input.mode,
      status: 'draft',
      plannedDistanceKm: input.plannedDistanceKm,
      totalWeightKg: input.totalWeightKg,
      stops: input.stops.map((s) => ({
        sequence: s.sequence,
        label: s.label,
        type: s.type,
        location: s.location,
        scheduledAt: s.scheduledAt,
        itemIds: s.itemIds,
        ...(s.note ? { note: s.note } : {}),
      })),
    });
  }

  public async getById(id: string): Promise<RouteEntity> {
    return this.repo.findByIdOrFail(id, 'Route');
  }

  public async list(
    filters: RouteFilters,
    options: PaginationOptions,
  ): Promise<PaginatedResult<RouteEntity>> {
    return this.repo.listWithFilters(filters, options);
  }

  public async transition(id: string, next: RouteStatus): Promise<RouteEntity> {
    const route = await this.getById(id);
    route.transitionTo(next);
    return this.repo.save(route);
  }

  public async completeStop(id: string, stopId: string, completedAt?: Date): Promise<RouteEntity> {
    const route = await this.getById(id);
    route.completeStop(stopId, completedAt);
    return this.repo.save(route);
  }

  public async recordActualDistance(id: string, km: number): Promise<RouteEntity> {
    const route = await this.getById(id);
    route.recordActualDistance(km);
    return this.repo.save(route);
  }

  public async addItemsToStop(id: string, stopId: string, itemIds: string[]): Promise<RouteEntity> {
    const route = await this.getById(id);
    route.addItemsToStop(stopId, itemIds);
    return this.repo.save(route);
  }

  public async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.repo.remove(id);
  }
}
