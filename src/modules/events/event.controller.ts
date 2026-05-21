import type { Request, Response } from 'express';

import { itemService } from '@/modules/items/item.routes';

import type { EventService } from './event.service';

export class EventController {
  constructor(private readonly service: EventService) {}

  public list = async (req: Request, res: Response): Promise<void> => {
    const { page, limit, startsAfter, endsBefore, ...rest } = req.query as Record<string, string | undefined>;
    const filters = {
      ...rest,
      ...(startsAfter ? { startsAfter: new Date(startsAfter) } : {}),
      ...(endsBefore ? { endsBefore: new Date(endsBefore) } : {}),
    } as Parameters<EventService['list']>[0];
    const result = await this.service.list(filters, {
      ...(page ? { page: Number(page) } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    });
    res.status(200).json({
      data: result.data.map((e) => e.toJSON()),
      count: result.count,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  };

  public getById = async (req: Request, res: Response): Promise<void> => {
    const event = await this.service.getById(req.params.id!);
    res.status(200).json(event.toJSON());
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const event = await this.service.create(req.body);
    res.status(201).location(`/api/v1/events/${event.id}`).json(event.toJSON());
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const event = await this.service.update(req.params.id!, req.body);
    res.status(200).json(event.toJSON());
  };

  public transition = async (req: Request, res: Response): Promise<void> => {
    const { status } = req.body as { status: import('./event.model').EventStatus };
    const event = await this.service.transition(req.params.id!, status);
    res.status(200).json(event.toJSON());
  };

  public addZone = async (req: Request, res: Response): Promise<void> => {
    const event = await this.service.addZone(req.params.id!, req.body);
    res.status(201).json(event.toJSON());
  };

  public removeZone = async (req: Request, res: Response): Promise<void> => {
    const event = await this.service.removeZone(req.params.id!, req.params.zoneId!);
    res.status(200).json(event.toJSON());
  };

  public remove = async (req: Request, res: Response): Promise<void> => {
    await this.service.remove(req.params.id!);
    res.status(204).send();
  };

  /** Sous-ressource : items d'un événement. Délègue au ItemService. */
  public listItems = async (req: Request, res: Response): Promise<void> => {
    const { page, limit } = req.query as Record<string, string | undefined>;
    const result = await itemService.list(
      { eventId: req.params.id! },
      {
        ...(page ? { page: Number(page) } : {}),
        ...(limit ? { limit: Number(limit) } : {}),
      },
    );
    res.status(200).json({
      data: result.data.map((i) => i.toJSON()),
      count: result.count,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  };
}
