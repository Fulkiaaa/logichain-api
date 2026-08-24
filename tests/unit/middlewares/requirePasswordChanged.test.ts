import type { Request, Response } from 'express';

import { PasswordChangeRequiredError } from '@/core/errors';
import { requirePasswordChanged } from '@/middlewares/auth.middleware';

const run = (user: Request['user']): (() => void) => {
  const req = { user } as Request;
  const next = jest.fn();
  return () => requirePasswordChanged(req, {} as Response, next);
};

/**
 * Verrou d'accès : tant que le mot de passe temporaire n'a pas été remplacé,
 * le compte ne peut atteindre aucune route métier.
 */
describe('requirePasswordChanged', () => {
  it('bloque un compte dont le mot de passe est encore temporaire', () => {
    expect(run({
      id: '507f1f77bcf86cd799439011',
      email: 'sofia@logichain.fr',
      role: 'field_agent',
      mustChangePassword: true,
    })).toThrow(PasswordChangeRequiredError);
  });

  it('laisse passer un compte dont le mot de passe a été changé', () => {
    const req = {
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'sofia@logichain.fr',
        role: 'field_agent',
        mustChangePassword: false,
      },
    } as Request;
    const next = jest.fn();

    requirePasswordChanged(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
