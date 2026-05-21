import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const EVENT_STATUSES = ['planning', 'active', 'closed', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

const polygonSchema = new Schema(
  {
    type: { type: String, enum: ['Polygon'], required: true, default: 'Polygon' },
    coordinates: {
      type: [[[Number]]],
      required: true,
      validate: {
        validator: (rings: number[][][]): boolean => {
          if (!rings.length) return false;
          for (const ring of rings) {
            if (ring.length < 4) return false;
            const first = ring[0];
            const last = ring[ring.length - 1];
            if (!first || !last) return false;
            if (first[0] !== last[0] || first[1] !== last[1]) return false;
          }
          return true;
        },
        message: 'Polygone GeoJSON invalide (anneau non fermé ou trop court)',
      },
    },
  },
  { _id: false },
);

const zoneSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    category: {
      type: String,
      required: true,
      enum: ['stage', 'backstage', 'public', 'logistics', 'parking', 'restricted', 'other'],
    },
    capacity: { type: Number, required: false, min: 0 },
    area: { type: polygonSchema, required: true },
  },
  { _id: true },
);

export const eventSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    status: { type: String, required: true, enum: EVENT_STATUSES, default: 'planning' },
    startDate: { type: Date, required: true },
    endDate: {
      type: Date,
      required: true,
      validate: {
        validator: function (this: { startDate: Date }, v: Date): boolean {
          return v > this.startDate;
        },
        message: 'endDate doit être postérieure à startDate',
      },
    },
    expectedAttendance: { type: Number, min: 0 },
    zones: { type: [zoneSchema], default: [] },
    managerId: { type: String, required: true },
  },
  {
    collection: 'events',
    timestamps: true,
    optimisticConcurrency: true,
  },
);

eventSchema.index({ status: 1, startDate: 1 });
eventSchema.index({ 'zones.area': '2dsphere' });
eventSchema.index({ slug: 1 }, { unique: true });

export type EventRaw = InferSchemaType<typeof eventSchema>;
export type EventDoc = HydratedDocument<EventRaw>;
export const EventModel = model<EventRaw>('Event', eventSchema);
