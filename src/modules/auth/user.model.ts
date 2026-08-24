import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const USER_ROLES = ['admin', 'logistics_manager', 'field_agent', 'transporter'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email invalide'],
    },
    passwordHash: { type: String, required: true, select: false },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, required: true, enum: USER_ROLES, default: 'field_agent' },
    active: { type: Boolean, default: true },
    /**
     * Vrai tant que le compte utilise le mot de passe temporaire posé par
     * l'admin à sa création. Remis à faux par PATCH /auth/password.
     */
    mustChangePassword: { type: Boolean, default: false },
  },
  {
    collection: 'users',
    timestamps: true,
    optimisticConcurrency: true,
  },
);

userSchema.index({ role: 1, active: 1 });

export type UserRaw = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserRaw>;
export const UserModel = model<UserRaw>('User', userSchema);
