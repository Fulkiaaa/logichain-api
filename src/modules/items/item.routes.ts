import { Router } from 'express';

import { requireAuth, requirePasswordChanged } from '@/middlewares/auth.middleware';
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
itemRouter.post('/', validate({ body: createItemSchema }), controller.create);

itemRouter.get('/by-qr/:qrCode', controller.getByQrCode);

itemRouter.get('/:id', validate({ params: idParamSchema }), controller.getById);
itemRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateItemSchema }),
  controller.update,
);
itemRouter.delete('/:id', validate({ params: idParamSchema }), controller.remove);

itemRouter.post(
  '/:id/scan',
  validate({ params: idParamSchema, body: scanSchema }),
  controller.scan,
);
itemRouter.post(
  '/:id/allocate',
  validate({ params: idParamSchema, body: allocateSchema }),
  controller.allocate,
);
itemRouter.post(
  '/:id/transit',
  validate({ params: idParamSchema, body: transitSchema }),
  controller.transit,
);
itemRouter.post(
  '/:id/deploy',
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
itemRouter.post(
  '/:id/return',
  validate({ params: idParamSchema }),
  controller.returnToStock,
);

export { repo as itemRepository, service as itemService };
