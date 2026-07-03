import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate.middleware';
import { eventRepository } from '@/modules/events/event.routes';
import { ITEM_CATEGORIES } from '@/modules/items/item.model';
import { itemRepository } from '@/modules/items/item.routes';
import { idParamSchema, objectIdSchema } from '@/modules/items/item.schemas';
import { metricRepository } from '@/modules/monitoring/metric.repository';
import { routeRepository } from '@/modules/routes/route.routes';
import { ademeFactorService } from '@/services/AdemeFactorService';
import { CarbonFootprintService } from '@/services/CarbonFootprintService';
import { ResourceAllocationService } from '@/services/ResourceAllocationService';

const carbonService = new CarbonFootprintService(itemRepository, eventRepository, routeRepository);
const allocationService = new ResourceAllocationService(itemRepository, eventRepository);

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get(
  '/events/:id/carbon-footprint',
  validate({ params: idParamSchema }),
  async (req, res) => {
    const report = await carbonService.computeEventReport(req.params.id!);
    res.status(200).json(report);
  },
);

/**
 * Latences agrégées par route sur la dernière heure, lues depuis la collection
 * Time Series de monitoring (count / moyenne / p95 / max). Réservé aux admins :
 * c'est une métrique d'exploitation, pas une donnée métier.
 */
dashboardRouter.get('/metrics', requireRole('admin'), async (_req, res) => {
  const routes = await metricRepository.summary(60);
  res.status(200).json({ windowMinutes: 60, routes });
});

/**
 * Expose l'état courant du cache des facteurs ADEME — pour debug, audit
 * et présentation. Indique pour chaque mode si la valeur vient de l'API
 * live, du cache, ou du fallback hardcodé.
 */
dashboardRouter.get('/emission-factors', (_req, res) => {
  res.status(200).json({
    source: 'https://data.ademe.fr/data-fair/api/v1/datasets/base-carboner',
    factors: ademeFactorService.snapshot(),
  });
});

/**
 * Force un refresh immédiat du cache ADEME (admin uniquement).
 * Utile en démo orale pour montrer que la valeur vient bien de l'API.
 */
dashboardRouter.post(
  '/emission-factors/refresh',
  requireRole('admin'),
  async (_req, res) => {
    await ademeFactorService.refresh();
    res.status(200).json({
      status: 'refreshed',
      factors: ademeFactorService.snapshot(),
    });
  },
);

const allocationRequestSchema = z.object({
  eventId: objectIdSchema,
  category: z.enum(ITEM_CATEGORIES),
  quantity: z.number().int().positive(),
  forecasts: z.record(z.string(), z.record(z.string(), z.number().nonnegative())),
});

dashboardRouter.post(
  '/allocations/check',
  requireRole('admin', 'logistics_manager'),
  validate({ body: allocationRequestSchema }),
  async (req, res) => {
    const { eventId, category, quantity, forecasts } = req.body as z.infer<
      typeof allocationRequestSchema
    >;
    const decision = await allocationService.requestAllocation(
      eventId,
      category,
      quantity,
      forecasts,
    );
    res.status(decision.granted ? 200 : 422).json(decision);
  },
);

export { carbonService, allocationService };
