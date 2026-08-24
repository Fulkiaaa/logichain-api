import { Router } from 'express';

import {
  requireAuth,
  requirePasswordChanged,
  requireRole,
} from '@/middlewares/auth.middleware';
import { loginLimiter } from '@/middlewares/rate-limit.middleware';
import { validate } from '@/middlewares/validate.middleware';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from './auth.schemas';
import { UserRepository } from './user.repository';

const userRepo = new UserRepository();
const service = new AuthService(userRepo);
const controller = new AuthController(service);

export const authRouter = Router();

authRouter.post('/login', loginLimiter, validate({ body: loginSchema }), controller.login);
authRouter.post('/refresh', validate({ body: refreshSchema }), controller.refresh);

authRouter.post(
  '/register',
  requireAuth,
  requirePasswordChanged,
  requireRole('admin'),
  validate({ body: registerSchema }),
  controller.register,
);

/**
 * Sortie de secours : volontairement SANS requirePasswordChanged, sinon un
 * compte sur mot de passe temporaire n'aurait aucun moyen d'en sortir.
 */
authRouter.patch(
  '/password',
  requireAuth,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);

// Sans requirePasswordChanged non plus : le client mobile interroge /me au
// démarrage pour savoir s'il doit afficher l'écran de changement.
authRouter.get('/me', requireAuth, controller.me);

export { userRepo as userRepository, service as authService };
