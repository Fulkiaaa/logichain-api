import type { ChangeStream } from 'mongodb';

import type { EntityChange, PaginatedResult, PaginationOptions } from '@/core/BaseRepository';
import { logger } from '@/core/logger';
import type { EventEntity } from '@/modules/events/event.entity';
import type { EventRepository } from '@/modules/events/event.repository';
import type { ItemEntity } from '@/modules/items/item.entity';
import type { ItemRepository } from '@/modules/items/item.repository';

import type { NotificationEntity, NotificationProps } from './notification.entity';
import type { NotificationHub } from './notification.hub';
import type { NotificationFilters, NotificationRepository } from './notification.repository';

type NotificationInput = Omit<NotificationProps, 'id' | 'version' | 'createdAt' | 'updatedAt'>;

/**
 * Orchestre les notifications temps réel.
 *
 * S'abonne aux Change Streams des collections `items` et `events` (via leurs
 * repositories — jamais Mongoose directement), traduit les changements
 * *critiques* en notifications, les persiste, puis les pousse aux clients SSE.
 *
 * Déduplication : on n'émet que si le champ pertinent a réellement changé lors
 * de cette opération (`updatedFields`), pour éviter de re-notifier sur une
 * modification annexe (ex. renommage d'un item déjà en anomalie).
 */
export class NotificationService {
  private streams: ChangeStream[] = [];

  constructor(
    private readonly repo: NotificationRepository,
    private readonly hub: NotificationHub,
    private readonly itemRepo: ItemRepository,
    private readonly eventRepo: EventRepository,
  ) {}

  /** Ouvre les Change Streams et démarre le heartbeat SSE. */
  public start(): void {
    const itemStream = this.itemRepo.watchEntities((change) => void this.onItemChange(change));
    itemStream.on('error', (err: unknown) => logger.error({ err }, 'Change stream items en erreur'));

    const eventStream = this.eventRepo.watchEntities((change) => void this.onEventChange(change));
    eventStream.on('error', (err: unknown) => logger.error({ err }, 'Change stream events en erreur'));

    this.streams.push(itemStream, eventStream);
    this.hub.startHeartbeat();
    logger.info('Notifications temps réel actives (Change Streams + SSE)');
  }

  /** Ferme les Change Streams et les connexions SSE. */
  public async stop(): Promise<void> {
    this.hub.stopHeartbeat();
    await Promise.all(this.streams.map((s) => s.close().catch(() => undefined)));
    this.streams = [];
  }

  public listRecent(
    filters: NotificationFilters,
    options: PaginationOptions,
  ): Promise<PaginatedResult<NotificationEntity>> {
    return this.repo.listFor(filters, options);
  }

  public async markRead(id: string): Promise<NotificationEntity> {
    const notif = await this.repo.findByIdOrFail(id, 'Notification');
    notif.markRead();
    return this.repo.save(notif);
  }

  /** Un champ (ou un de ses sous-chemins) fait-il partie des modifications ? */
  private changed(fields: string[] | undefined, path: string): boolean {
    if (!fields) return false;
    return fields.some((f) => f === path || f.startsWith(`${path}.`));
  }

  private async onItemChange(change: EntityChange<ItemEntity>): Promise<void> {
    if (!change.entity) return;
    const item = change.entity.toJSON();
    const isInsert = change.operationType === 'insert';
    const last = item.history[item.history.length - 1];

    let input: NotificationInput | null = null;

    if ((isInsert || this.changed(change.updatedFields, 'history')) && last?.type === 'anomaly') {
      input = {
        type: 'anomaly',
        severity: 'critical',
        title: `Anomalie — ${item.label}`,
        message: last.note ?? `Anomalie signalée sur l'équipement ${item.qrCode}`,
        eventId: item.eventId ?? null,
        itemId: item.id,
        audience: ['admin', 'logistics_manager', 'field_agent'],
      };
    } else if ((isInsert || this.changed(change.updatedFields, 'status')) && item.status === 'lost') {
      input = {
        type: 'item_lost',
        severity: 'warning',
        title: `Équipement perdu — ${item.label}`,
        message: `L'équipement ${item.qrCode} est marqué perdu`,
        eventId: item.eventId ?? null,
        itemId: item.id,
        audience: ['admin', 'logistics_manager'],
      };
    }

    if (input) await this.emit(input);
  }

  private async onEventChange(change: EntityChange<EventEntity>): Promise<void> {
    if (!change.entity) return;
    const ev = change.entity.toJSON();
    const isInsert = change.operationType === 'insert';

    if ((isInsert || this.changed(change.updatedFields, 'status')) && ev.status === 'cancelled') {
      await this.emit({
        type: 'event_cancelled',
        severity: 'critical',
        title: `Événement annulé — ${ev.name}`,
        message: `L'événement « ${ev.name} » a été annulé`,
        eventId: ev.id,
        itemId: null,
        audience: ['admin', 'logistics_manager', 'field_agent', 'transporter'],
      });
    }
  }

  /** Persiste puis diffuse. Best-effort : une erreur n'interrompt pas le flux. */
  private async emit(input: NotificationInput): Promise<void> {
    try {
      const notif = await this.repo.create(input);
      this.hub.broadcast(notif);
      logger.info(
        { type: notif.type, itemId: input.itemId, eventId: input.eventId, clients: this.hub.clientCount() },
        'Notification émise',
      );
    } catch (err) {
      logger.error({ err }, 'Échec émission notification');
    }
  }
}
