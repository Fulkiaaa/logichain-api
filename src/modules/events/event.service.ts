import type { PaginatedResult, PaginationOptions } from '@/core/BaseRepository';
import { ConflictError } from '@/core/errors';

import type { EventEntity, EventZone } from './event.entity';
import type { EventStatus } from './event.model';
import type { EventFilters, EventRepository } from './event.repository';
import type { CreateEventInput, UpdateEventInput } from './event.schemas';

export class EventService {
  constructor(private readonly repo: EventRepository) {}

  public async create(input: CreateEventInput): Promise<EventEntity> {
    const existing = await this.repo.findBySlug(input.slug);
    if (existing) {
      throw new ConflictError(`Le slug "${input.slug}" est déjà utilisé`);
    }
    return this.repo.create({
      name: input.name,
      slug: input.slug,
      status: 'planning',
      startDate: input.startDate,
      endDate: input.endDate,
      ...(input.expectedAttendance !== undefined ? { expectedAttendance: input.expectedAttendance } : {}),
      zones: input.zones.map((z) => ({
        name: z.name,
        category: z.category,
        ...(z.capacity !== undefined ? { capacity: z.capacity } : {}),
        area: {
          type: 'Polygon',
          coordinates: z.area.coordinates,
        },
      })),
      managerId: input.managerId,
    });
  }

  public async getById(id: string): Promise<EventEntity> {
    return this.repo.findByIdOrFail(id, 'Event');
  }

  public async list(
    filters: EventFilters,
    options: PaginationOptions,
  ): Promise<PaginatedResult<EventEntity>> {
    return this.repo.listWithFilters(filters, options);
  }

  public async update(id: string, input: UpdateEventInput): Promise<EventEntity> {
    const event = await this.getById(id);
    if (input.name) {
      event.renameTo(input.name);
    }
    if (input.startDate || input.endDate) {
      event.reschedule(input.startDate ?? event.startDate, input.endDate ?? event.endDate);
    }
    return this.repo.save(event);
  }

  public async transition(id: string, next: EventStatus): Promise<EventEntity> {
    const event = await this.getById(id);
    event.transitionTo(next);
    return this.repo.save(event);
  }

  public async addZone(id: string, zone: EventZone): Promise<EventEntity> {
    const event = await this.getById(id);
    event.addZone(zone);
    return this.repo.save(event);
  }

  public async removeZone(id: string, zoneId: string): Promise<EventEntity> {
    const event = await this.getById(id);
    event.removeZone(zoneId);
    return this.repo.save(event);
  }

  public async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.repo.remove(id);
  }
}
