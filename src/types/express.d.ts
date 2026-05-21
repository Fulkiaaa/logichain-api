import type { AuthenticatedUser } from '@/middlewares/auth.middleware';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
