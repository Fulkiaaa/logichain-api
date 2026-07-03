import { Router } from 'express';

import { requireAuth, requireAuthFlexible } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate.middleware';
import { eventRepository } from '@/modules/events/event.routes';
import { itemRepository } from '@/modules/items/item.routes';
import { idParamSchema } from '@/modules/items/item.schemas';

import { NotificationController } from './notification.controller';
import { notificationHub } from './notification.hub';
import { NotificationRepository } from './notification.repository';
import { listNotificationsQuerySchema } from './notification.schemas';
import { NotificationService } from './notification.service';

const repo = new NotificationRepository();
const service = new NotificationService(repo, notificationHub, itemRepository, eventRepository);
const controller = new NotificationController(service, notificationHub);

export const notificationRouter = Router();

// Flux SSE : auth flexible (Bearer OU ?token=). Déclaré AVANT le requireAuth
// global pour ne pas exiger le header sur EventSource.
notificationRouter.get('/stream', requireAuthFlexible, controller.stream);

notificationRouter.use(requireAuth);
notificationRouter.get('/', validate({ query: listNotificationsQuerySchema }), controller.list);
notificationRouter.post('/:id/read', validate({ params: idParamSchema }), controller.markRead);

export { repo as notificationRepository, service as notificationService };
