import { z } from 'zod';

import { USER_ROLES } from './user.model';

/**
 * Exigences de robustesse d'un mot de passe : 8 caractères minimum, avec au
 * moins une minuscule, une majuscule, un chiffre et un caractère spécial.
 *
 * Appliqué aussi bien au mot de passe temporaire posé par l'admin
 * (`registerSchema`) qu'au mot de passe définitif choisi par l'utilisateur
 * (`changePasswordSchema`) : le premier circule hors de l'application et reste
 * valable jusqu'à la première connexion, il n'a aucune raison d'être plus faible.
 *
 * Le message est unique et volontairement exhaustif — énumérer un manquement à
 * la fois obligerait l'utilisateur à autant d'allers-retours que de critères.
 */
export const strongPasswordSchema = z
  .string()
  .min(8, 'Au moins 8 caractères')
  .max(128, 'Au plus 128 caractères')
  .regex(/[a-z]/, 'Il manque une minuscule')
  .regex(/[A-Z]/, 'Il manque une majuscule')
  .regex(/[0-9]/, 'Il manque un chiffre')
  .regex(/[^A-Za-z0-9]/, 'Il manque un caractère spécial');

export const registerSchema = z.object({
  email: z.string().email(),
  password: strongPasswordSchema,
  fullName: z.string().min(1).max(120),
  role: z.enum(USER_ROLES).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: strongPasswordSchema,
});

export type RegisterPayload = z.infer<typeof registerSchema>;
export type ChangePasswordPayload = z.infer<typeof changePasswordSchema>;
export type LoginPayload = z.infer<typeof loginSchema>;
