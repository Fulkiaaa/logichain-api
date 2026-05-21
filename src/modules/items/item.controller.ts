import type { Request, Response } from 'express';

import type { ItemService } from './item.service';

/**
 * Couche HTTP — aucune logique métier ici.
 *
 * Chaque méthode :
 *  1. Lit les inputs déjà validés par Zod (middleware validate)
 *  2. Appelle le service
 *  3. Renvoie la réponse HTTP appropriée selon Richardson niveau 2
 */
export class ItemController {
  constructor(private readonly service: ItemService) {}

  public list = async (req: Request, res: Response): Promise<void> => {
    const { page, limit, ...rest } = req.query as Record<string, string | undefined>;
    const result = await this.service.list(rest, {
      ...(page ? { page: Number(page) } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    });
    res.status(200).json({
      data: result.data.map((i) => i.toJSON()),
      count: result.count,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  };

  public getById = async (req: Request, res: Response): Promise<void> => {
    const item = await this.service.getById(req.params.id!);
    res.status(200).json(item.toJSON());
  };

  public getByQrCode = async (req: Request, res: Response): Promise<void> => {
    const item = await this.service.getByQrCode(req.params.qrCode!);
    res.status(200).json(item.toJSON());
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const item = await this.service.create(req.body);
    res.status(201).location(`/api/v1/items/${item.id}`).json(item.toJSON());
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const { label } = req.body as { label?: string };
    if (!label) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Aucun champ à mettre à jour' },
      });
      return;
    }
    const item = await this.service.rename(req.params.id!, label);
    res.status(200).json(item.toJSON());
  };

  public scan = async (req: Request, res: Response): Promise<void> => {
    const { location, note } = req.body as { location: { type: 'Point'; coordinates: [number, number] }; note?: string };
    const item = await this.service.scan(req.params.id!, req.user!.id, location, note);
    res.status(200).json(item.toJSON());
  };

  public allocate = async (req: Request, res: Response): Promise<void> => {
    const { eventId } = req.body as { eventId: string };
    const item = await this.service.allocate(req.params.id!, eventId, req.user!.id);
    res.status(200).json(item.toJSON());
  };

  public transit = async (req: Request, res: Response): Promise<void> => {
    const { location } = req.body as { location?: { type: 'Point'; coordinates: [number, number] } };
    const item = await this.service.startTransit(req.params.id!, req.user!.id, location);
    res.status(200).json(item.toJSON());
  };

  public deploy = async (req: Request, res: Response): Promise<void> => {
    const { location } = req.body as { location: { type: 'Point'; coordinates: [number, number] } };
    const item = await this.service.deploy(req.params.id!, req.user!.id, location);
    res.status(200).json(item.toJSON());
  };

  public anomaly = async (req: Request, res: Response): Promise<void> => {
    const { location, note } = req.body as { location: { type: 'Point'; coordinates: [number, number] }; note: string };
    const item = await this.service.reportAnomaly(req.params.id!, req.user!.id, location, note);
    res.status(200).json(item.toJSON());
  };

  public lost = async (req: Request, res: Response): Promise<void> => {
    const { note } = req.body as { note?: string };
    const item = await this.service.markLost(req.params.id!, req.user!.id, note);
    res.status(200).json(item.toJSON());
  };

  public returnToStock = async (req: Request, res: Response): Promise<void> => {
    const item = await this.service.returnToStock(req.params.id!, req.user!.id);
    res.status(200).json(item.toJSON());
  };

  public remove = async (req: Request, res: Response): Promise<void> => {
    await this.service.remove(req.params.id!);
    res.status(204).send();
  };
}
