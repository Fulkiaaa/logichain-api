import { z } from 'zod';

import { idParamSchema, objectIdSchema } from '@/modules/items/item.schemas';

import { EVENT_STATUSES } from './event.model';

const polygonGeometrySchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z
    .array(z.array(z.tuple([z.number(), z.number()])))
    .min(1, 'Au moins un anneau requis'),
});

const zoneInputSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.enum(['stage', 'backstage', 'public', 'logistics', 'parking', 'restricted', 'other']),
  capacity: z.number().int().nonnegative().optional(),
  area: polygonGeometrySchema,
});

export const createEventSchema = z
  .object({
    name: z.string().min(1).max(200),
    slug: z
      .string()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9-]+$/, 'Slug invalide : lettres minuscules, chiffres et tirets'),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    expectedAttendance: z.number().int().nonnegative().optional(),
    zones: z.array(zoneInputSchema).default([]),
    managerId: z.string().min(1),
  })
  .refine((v) => v.endDate > v.startDate, {
    path: ['endDate'],
    message: 'endDate doit être postérieure à startDate',
  });

export const updateEventSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    expectedAttendance: z.number().int().nonnegative().nullable().optional(),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate > v.startDate,
    { message: 'endDate doit être postérieure à startDate', path: ['endDate'] },
  );

export const transitionEventSchema = z.object({
  status: z.enum(EVENT_STATUSES),
});

export const addZoneSchema = zoneInputSchema;

/** Allocation atomique d'un lot d'items à un événement (transaction ACID). */
export const allocateItemsSchema = z.object({
  itemIds: z.array(objectIdSchema).min(1, 'Au moins un item requis').max(200),
});

export const zoneIdParamSchema = idParamSchema.extend({ zoneId: objectIdSchema });

export const listEventsQuerySchema = z.object({
  status: z.enum(EVENT_STATUSES).optional(),
  managerId: z.string().optional(),
  startsAfter: z.coerce.date().optional(),
  endsBefore: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
