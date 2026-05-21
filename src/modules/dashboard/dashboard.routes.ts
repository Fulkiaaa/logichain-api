import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate.middleware';
import { eventRepository } from '@/modules/events/event.routes';
import { ITEM_CATEGORIES } from '@/modules/items/item.model';
import { itemRepository } from '@/modules/items/item.routes';
import { idParamSchema, objectIdSchema } from '@/modules/items/item.schemas';
import { routeRepository } from '@/modules/routes/route.routes';
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
