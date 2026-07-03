import type { FilterQuery } from 'mongoose';

import { BaseRepository, type PaginatedResult, type PaginationOptions } from '@/core/BaseRepository';
import type { UserRole } from '@/modules/auth/user.model';

import { NotificationEntity, type NotificationProps } from './notification.entity';
import {
  NotificationModel,
  type NotificationDoc,
  type NotificationRaw,
} from './notification.model';

export interface NotificationFilters {
  read?: boolean;
  eventId?: string;
}

export class NotificationRepository extends BaseRepository<NotificationEntity, NotificationRaw> {
  constructor() {
    super(NotificationModel);
  }

  protected toEntity(doc: NotificationDoc): NotificationEntity {
    const raw = doc.toObject({ virtuals: false });
    return new NotificationEntity({
      id: String(raw._id),
      version: (raw as unknown as { __v: number }).__v ?? 0,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      type: raw.type,
      severity: raw.severity,
      title: raw.title,
      message: raw.message,
      eventId: raw.eventId ? String(raw.eventId) : null,
      itemId: raw.itemId ? String(raw.itemId) : null,
      audience: (raw.audience ?? []) as UserRole[],
      read: raw.read ?? false,
    });
  }

  public async create(
    input: Omit<NotificationProps, 'id' | 'version' | 'createdAt' | 'updatedAt'>,
  ): Promise<NotificationEntity> {
    const doc = await this.model.create({
      type: input.type,
      severity: input.severity,
      title: input.title,
      message: input.message,
      eventId: input.eventId ?? null,
      itemId: input.itemId ?? null,
      audience: input.audience,
      read: input.read ?? false,
    });
    return this.toEntity(doc);
  }

  public async listFor(
    filters: NotificationFilters,
    options: PaginationOptions,
  ): Promise<PaginatedResult<NotificationEntity>> {
    const query: FilterQuery<NotificationRaw> = {};
    if (filters.read !== undefined) query.read = filters.read;
    if (filters.eventId) query.eventId = filters.eventId;
    return this.list(query, options);
  }

  /** Persiste l'état `read` avec verrouillage optimiste. */
  public async save(entity: NotificationEntity): Promise<NotificationEntity> {
    const doc = await this.updateWithVersion(entity.id, entity.version, {
      $set: { read: entity.read },
    });
    return this.toEntity(doc);
  }
}
