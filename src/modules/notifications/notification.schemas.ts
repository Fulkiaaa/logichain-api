import { z } from 'zod';

import { objectIdSchema } from '@/modules/items/item.schemas';

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  eventId: objectIdSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
