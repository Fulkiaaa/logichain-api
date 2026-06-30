import { Router } from 'express';

import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate.middleware';
import { idParamSchema } from '@/modules/items/item.schemas';

import { EventController } from './event.controller';
import { EventRepository } from './event.repository';
import {
  addZoneSchema,
  allocateItemsSchema,
  createEventSchema,
  listEventsQuerySchema,
  transitionEventSchema,
  updateEventSchema,
  zoneIdParamSchema,
} from './event.schemas';
import { EventService } from './event.service';

const repo = new EventRepository();
const service = new EventService(repo);
const controller = new EventController(service);

export const eventRouter = Router();

eventRouter.use(requireAuth);

eventRouter.get('/', validate({ query: listEventsQuerySchema }), controller.list);
eventRouter.post(
  '/',
  requireRole('admin', 'logistics_manager'),
  validate({ body: createEventSchema }),
  controller.create,
);

eventRouter.get('/:id', validate({ params: idParamSchema }), controller.getById);
eventRouter.patch(
  '/:id',
  requireRole('admin', 'logistics_manager'),
  validate({ params: idParamSchema, body: updateEventSchema }),
  controller.update,
);
eventRouter.delete(
  '/:id',
  requireRole('admin'),
  validate({ params: idParamSchema }),
  controller.remove,
);
eventRouter.post(
  '/:id/transition',
  requireRole('admin', 'logistics_manager'),
  validate({ params: idParamSchema, body: transitionEventSchema }),
  controller.transition,
);

eventRouter.post(
  '/:id/zones',
  requireRole('admin', 'logistics_manager'),
  validate({ params: idParamSchema, body: addZoneSchema }),
  controller.addZone,
);
eventRouter.delete(
  '/:id/zones/:zoneId',
  requireRole('admin', 'logistics_manager'),
  validate({ params: zoneIdParamSchema }),
  controller.removeZone,
);

eventRouter.get('/:id/items', validate({ params: idParamSchema }), controller.listItems);

// Allocation atomique d'un lot d'items à l'événement (transaction ACID, tout-ou-rien).
eventRouter.post(
  '/:id/allocate',
  requireRole('admin', 'logistics_manager'),
  validate({ params: idParamSchema, body: allocateItemsSchema }),
  controller.allocateItems,
);

export { repo as eventRepository, service as eventService };
