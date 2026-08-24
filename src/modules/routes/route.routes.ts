import { Router } from 'express';

import {
  requireAuth,
  requirePasswordChanged,
  requireRole,
} from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate.middleware';
import { idParamSchema } from '@/modules/items/item.schemas';

import { RouteController } from './route.controller';
import { RouteRepository } from './route.repository';
import {
  addItemsToStopSchema,
  completeStopSchema,
  createRouteSchema,
  listRoutesQuerySchema,
  recordDistanceSchema,
  stopParamSchema,
  transitionRouteSchema,
} from './route.schemas';
import { RouteService } from './route.service';

const repo = new RouteRepository();
const service = new RouteService(repo);
const controller = new RouteController(service);

export const routeRouter = Router();

routeRouter.use(requireAuth);
routeRouter.use(requirePasswordChanged);

routeRouter.get('/', validate({ query: listRoutesQuerySchema }), controller.list);
routeRouter.post(
  '/',
  requireRole('admin', 'logistics_manager'),
  validate({ body: createRouteSchema }),
  controller.create,
);

routeRouter.get('/:id', validate({ params: idParamSchema }), controller.getById);
routeRouter.delete(
  '/:id',
  requireRole('admin', 'logistics_manager'),
  validate({ params: idParamSchema }),
  controller.remove,
);
routeRouter.post(
  '/:id/transition',
  requireRole('admin', 'logistics_manager'),
  validate({ params: idParamSchema, body: transitionRouteSchema }),
  controller.transition,
);
// Saisie du kilométrage : geste du transporteur, il alimente le calcul carbone.
routeRouter.post(
  '/:id/distance',
  requireRole('admin', 'logistics_manager', 'transporter'),
  validate({ params: idParamSchema, body: recordDistanceSchema }),
  controller.recordDistance,
);
// Clôture d'un arrêt : geste du transporteur sur sa propre feuille de route.
routeRouter.post(
  '/:id/stops/:stopId/complete',
  requireRole('admin', 'logistics_manager', 'transporter'),
  validate({ params: stopParamSchema, body: completeStopSchema }),
  controller.completeStop,
);
routeRouter.post(
  '/:id/stops/:stopId/items',
  requireRole('admin', 'logistics_manager'),
  validate({ params: stopParamSchema, body: addItemsToStopSchema }),
  controller.addItemsToStop,
);

export { repo as routeRepository, service as routeService };
