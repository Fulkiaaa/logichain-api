import type { Request, Response } from 'express';

import type { NotificationHub } from './notification.hub';
import type { ListNotificationsQuery } from './notification.schemas';
import type { NotificationService } from './notification.service';

export class NotificationController {
  constructor(
    private readonly service: NotificationService,
    private readonly hub: NotificationHub,
  ) {}

  /**
   * Ouvre un flux Server-Sent Events. On écrit les en-têtes SSE, on émet un
   * event `connected`, puis on garde la connexion ouverte : le hub y poussera
   * les notifications. On se désabonne à la fermeture du client.
   */
  public stream = (req: Request, res: Response): void => {
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Désactive le buffering côté proxy (nginx/Traefik) pour un vrai temps réel.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const clientId = this.hub.register(res, { id: req.user!.id, role: req.user!.role });
    req.on('close', () => this.hub.unregister(clientId));
  };

  public list = async (req: Request, res: Response): Promise<void> => {
    const q = req.query as unknown as ListNotificationsQuery;
    const result = await this.service.listRecent(
      {
        ...(q.unreadOnly ? { read: false } : {}),
        ...(q.eventId ? { eventId: q.eventId } : {}),
      },
      { ...(q.page ? { page: q.page } : {}), ...(q.limit ? { limit: q.limit } : {}) },
    );
    res.status(200).json({
      data: result.data.map((n) => n.toJSON()),
      count: result.count,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  };

  public markRead = async (req: Request, res: Response): Promise<void> => {
    const notif = await this.service.markRead(req.params.id!);
    res.status(200).json(notif.toJSON());
  };
}
