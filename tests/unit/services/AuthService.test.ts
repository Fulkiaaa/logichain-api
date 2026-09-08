import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { env } from '@/config/env';
import { BusinessRuleError, UnauthorizedError } from '@/core/errors';
import type { JwtPayload } from '@/middlewares/auth.middleware';
import { AuthService } from '@/modules/auth/auth.service';
import { UserEntity } from '@/modules/auth/user.entity';
import type { UserRepository } from '@/modules/auth/user.repository';

const USER_ID = '507f1f77bcf86cd799439011';

const buildUser = (mustChangePassword: boolean): UserEntity =>
  new UserEntity({
    id: USER_ID,
    email: 'sofia@logichain.fr',
    fullName: 'Sofia Martin',
    role: 'field_agent',
    active: true,
    mustChangePassword,
  });

const decode = (token: string): JwtPayload => jwt.verify(token, env.JWT_SECRET) as JwtPayload;

/**
 * Cycle de vie du mot de passe temporaire.
 *
 * Règle métier : un mot de passe posé par un tiers (l'admin, à la création du
 * compte) est temporaire. Le compte reste marqué tant que son titulaire ne l'a
 * pas remplacé lui-même.
 */
describe('AuthService — mot de passe temporaire', () => {
  let repo: jest.Mocked<UserRepository>;
  let service: AuthService;

  beforeEach(() => {
    repo = {
      existsByEmail: jest.fn(async () => false),
      create: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findRawByEmailWithHash: jest.fn(),
      findRawByIdWithHash: jest.fn(),
      updatePassword: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;
    service = new AuthService(repo);
  });

  it('marque le compte créé par un admin comme devant changer de mot de passe', async () => {
    repo.create.mockImplementation(async () => buildUser(true));

    await service.register({
      email: 'nouvelle-recrue@logichain.fr',
      password: 'Temporaire2026!',
      fullName: 'Nouvelle Recrue',
      role: 'field_agent',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ mustChangePassword: true }),
    );
  });

  it('propage le drapeau dans le JWT à la connexion', async () => {
    const hash = await bcrypt.hash('Temporaire2026!', 4);
    repo.findRawByEmailWithHash.mockResolvedValue({
      id: USER_ID,
      passwordHash: hash,
      role: 'field_agent',
      active: true,
      mustChangePassword: true,
    });
    repo.findByEmail.mockResolvedValue(buildUser(true));

    const result = await service.login('sofia@logichain.fr', 'Temporaire2026!');

    expect(decode(result.token).mustChangePassword).toBe(true);
  });

  it('lève le drapeau et renvoie des jetons neufs après le changement', async () => {
    const hash = await bcrypt.hash('Temporaire2026!', 4);
    repo.findRawByIdWithHash.mockResolvedValue({
      id: USER_ID,
      passwordHash: hash,
      role: 'field_agent',
      active: true,
      mustChangePassword: true,
    });
    repo.updatePassword.mockResolvedValue(buildUser(false));

    const result = await service.changePassword(USER_ID, 'Temporaire2026!', 'MonVraiMotDePasse1!');

    // Le drapeau doit être retombé DANS LE NOUVEAU JETON : sans ça l'utilisateur
    // reste bloqué par le middleware jusqu'à expiration de son ancien jeton.
    expect(decode(result.token).mustChangePassword).toBe(false);
    expect(repo.updatePassword).toHaveBeenCalledWith(USER_ID, expect.any(String));
  });

  it('enregistre bien le hash du NOUVEAU mot de passe, pas de l\'ancien', async () => {
    const hash = await bcrypt.hash('Temporaire2026!', 4);
    repo.findRawByIdWithHash.mockResolvedValue({
      id: USER_ID,
      passwordHash: hash,
      role: 'field_agent',
      active: true,
      mustChangePassword: true,
    });
    repo.updatePassword.mockResolvedValue(buildUser(false));

    await service.changePassword(USER_ID, 'Temporaire2026!', 'MonVraiMotDePasse1!');

    const [, savedHash] = repo.updatePassword.mock.calls[0]!;
    expect(await bcrypt.compare('MonVraiMotDePasse1!', savedHash as string)).toBe(true);
  });

  it('refuse le changement si le mot de passe actuel est faux', async () => {
    const hash = await bcrypt.hash('Temporaire2026!', 4);
    repo.findRawByIdWithHash.mockResolvedValue({
      id: USER_ID,
      passwordHash: hash,
      role: 'field_agent',
      active: true,
      mustChangePassword: true,
    });

    await expect(
      service.changePassword(USER_ID, 'MauvaisMotDePasse!', 'MonVraiMotDePasse1!'),
    ).rejects.toThrow(UnauthorizedError);
    expect(repo.updatePassword).not.toHaveBeenCalled();
  });

  it('refuse un nouveau mot de passe identique à l\'actuel', async () => {
    const hash = await bcrypt.hash('Temporaire2026!', 4);
    repo.findRawByIdWithHash.mockResolvedValue({
      id: USER_ID,
      passwordHash: hash,
      role: 'field_agent',
      active: true,
      mustChangePassword: true,
    });

    await expect(
      service.changePassword(USER_ID, 'Temporaire2026!', 'Temporaire2026!'),
    ).rejects.toThrow(BusinessRuleError);
    expect(repo.updatePassword).not.toHaveBeenCalled();
  });
});
