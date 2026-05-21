import type { Request, Response } from 'express';

import type { RouteService } from './route.service';

export class RouteController {
  constructor(private readonly service: RouteService) {}

  public list = async (req: Request, res: Response): Promise<void> => {
    const { page, limit, ...rest } = req.query as Record<string, string | undefined>;
    const result = await this.service.list(rest as Parameters<RouteService['list']>[0], {
      ...(page ? { page: Number(page) } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    });
    res.status(200).json({
      data: result.data.map((r) => r.toJSON()),
      count: result.count,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  };

  public getById = async (req: Request, res: Response): Promise<void> => {
    const route = await this.service.getById(req.params.id!);
    res.status(200).json(route.toJSON());
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const route = await this.service.create(req.body);
    res.status(201).location(`/api/v1/routes/${route.id}`).json(route.toJSON());
  };

  public transition = async (req: Request, res: Response): Promise<void> => {
    const { status } = req.body as { status: import('./route.model').RouteStatus };
    const route = await this.service.transition(req.params.id!, status);
    res.status(200).json(route.toJSON());
  };

  public completeStop = async (req: Request, res: Response): Promise<void> => {
    const { completedAt } = req.body as { completedAt?: string };
    const route = await this.service.completeStop(
      req.params.id!,
      req.params.stopId!,
      completedAt ? new Date(completedAt) : undefined,
    );
    res.status(200).json(route.toJSON());
  };

  public recordDistance = async (req: Request, res: Response): Promise<void> => {
    const { actualDistanceKm } = req.body as { actualDistanceKm: number };
    const route = await this.service.recordActualDistance(req.params.id!, actualDistanceKm);
    res.status(200).json(route.toJSON());
  };

  public addItemsToStop = async (req: Request, res: Response): Promise<void> => {
    const { itemIds } = req.body as { itemIds: string[] };
    const route = await this.service.addItemsToStop(req.params.id!, req.params.stopId!, itemIds);
    res.status(200).json(route.toJSON());
  };

  public remove = async (req: Request, res: Response): Promise<void> => {
    await this.service.remove(req.params.id!);
    res.status(204).send();
  };
}
