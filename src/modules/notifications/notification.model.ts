import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

import { USER_ROLES } from '@/modules/auth/user.model';

export const NOTIFICATION_TYPES = ['anomaly', 'item_lost', 'event_cancelled'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

/**
 * Notification critique persistée : trace des alertes poussées en temps réel
 * (via SSE). La persistance permet à un agent reconnecté de récupérer les
 * notifications manquées pendant une coupure réseau (offline-first).
 */
export const notificationSchema = new Schema(
  {
    type: { type: String, required: true, enum: NOTIFICATION_TYPES },
    severity: { type: String, required: true, enum: NOTIFICATION_SEVERITIES, default: 'info' },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', default: null },
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', default: null },
    // Rôles destinataires — le hub SSE ne pousse qu'aux clients concernés.
    audience: { type: [String], enum: USER_ROLES, default: [] },
    read: { type: Boolean, default: false },
  },
  {
    collection: 'notifications',
    timestamps: true,
    optimisticConcurrency: true,
  },
);

notificationSchema.index({ read: 1, createdAt: -1 });
notificationSchema.index({ eventId: 1, createdAt: -1 });

export type NotificationRaw = InferSchemaType<typeof notificationSchema>;
export type NotificationDoc = HydratedDocument<NotificationRaw>;
export const NotificationModel = model<NotificationRaw>('Notification', notificationSchema);
