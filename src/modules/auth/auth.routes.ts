import { Router } from 'express';

import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate.middleware';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { loginSchema, refreshSchema, registerSchema } from './auth.schemas';
import { UserRepository } from './user.repository';

const userRepo = new UserRepository();
const service = new AuthService(userRepo);
const controller = new AuthController(service);

export const authRouter = Router();

authRouter.post('/login', validate({ body: loginSchema }), controller.login);
authRouter.post('/refresh', validate({ body: refreshSchema }), controller.refresh);

authRouter.post(
  '/register',
  requireAuth,
  requireRole('admin'),
  validate({ body: registerSchema }),
  controller.register,
);

authRouter.get('/me', requireAuth, controller.me);

export { userRepo as userRepository, service as authService };
