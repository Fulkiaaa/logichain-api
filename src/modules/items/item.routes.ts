import { Router } from 'express';

import {
  requireAuth,
  requirePasswordChanged,
  requireRole,
} from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate.middleware';

import { ItemController } from './item.controller';
import { ItemRepository } from './item.repository';
import {
  allocateSchema,
  anomalySchema,
  createItemSchema,
  deploySchema,
  idParamSchema,
  listItemsQuerySchema,
  lostSchema,
  scanSchema,
  transitSchema,
  updateItemSchema,
} from './item.schemas';
import { ItemService } from './item.service';

const repo = new ItemRepository();
const service = new ItemService(repo);
const controller = new ItemController(service);

export const itemRouter = Router();

itemRouter.use(requireAuth);
itemRouter.use(requirePasswordChanged);

itemRouter.get('/', validate({ query: listItemsQuerySchema }), controller.list);
// Gestion du parc : décision d'inventaire, pas un geste de terrain.
itemRouter.post(
  '/',
  requireRole('admin', 'logistics_manager'),
  validate({ body: createItemSchema }),
  controller.create,
);

itemRouter.get('/by-qr/:qrCode', controller.getByQrCode);

itemRouter.get('/:id', validate({ params: idParamSchema }), controller.getById);
itemRouter.patch(
  '/:id',
  requireRole('admin', 'logistics_manager'),
  validate({ params: idParamSchema, body: updateItemSchema }),
  controller.update,
);
// Suppression définitive : réservée à l'admin.
itemRouter.delete(
  '/:id',
  requireRole('admin'),
  validate({ params: idParamSchema }),
  controller.remove,
);

itemRouter.post(
  '/:id/scan',
  validate({ params: idParamSchema, body: scanSchema }),
  controller.scan,
);
// Affectation à un événement : décision de planification.
itemRouter.post(
  '/:id/allocate',
  requireRole('admin', 'logistics_manager'),
  validate({ params: idParamSchema, body: allocateSchema }),
  controller.allocate,
);
itemRouter.post(
  '/:id/transit',
  validate({ params: idParamSchema, body: transitSchema }),
  controller.transit,
);
// Installation sur site : le transporteur achemine, il n'installe pas.
itemRouter.post(
  '/:id/deploy',
  requireRole('admin', 'logistics_manager', 'field_agent'),
  validate({ params: idParamSchema, body: deploySchema }),
  controller.deploy,
);
itemRouter.post(
  '/:id/anomaly',
  validate({ params: idParamSchema, body: anomalySchema }),
  controller.anomaly,
);
itemRouter.post(
  '/:id/lost',
  validate({ params: idParamSchema, body: lostSchema }),
  controller.lost,
);
// Retour au stock depuis le terrain.
itemRouter.post(
  '/:id/return',
  requireRole('admin', 'logistics_manager', 'field_agent'),
  validate({ params: idParamSchema }),
  controller.returnToStock,
);

export { repo as itemRepository, service as itemService };
