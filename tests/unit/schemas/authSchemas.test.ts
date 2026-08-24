import { changePasswordSchema, registerSchema } from '@/modules/auth/auth.schemas';

const register = (password: string) =>
  registerSchema.safeParse({ email: 'a@b.fr', password, fullName: 'Test' });
const change = (newPassword: string) =>
  changePasswordSchema.safeParse({ currentPassword: 'Temporaire2026!', newPassword });

/**
 * Robustesse du mot de passe : 8 caractères minimum, avec au moins une
 * minuscule, une majuscule, un chiffre et un caractère spécial.
 *
 * La règle vaut AUSSI pour le mot de passe temporaire posé par l'admin : il
 * circule hors de l'application et reste actif jusqu'à la première connexion.
 */
describe('robustesse du mot de passe', () => {
  const valide = 'MonVraiMotDePasse1!';

  it.each([
    ['un mot de passe complet', valide, true],
    ['trop court', 'Ab1!', false],
    ['sans majuscule', 'monmotdepasse1!', false],
    ['sans minuscule', 'MONMOTDEPASSE1!', false],
    ['sans chiffre', 'MonMotDePasse!', false],
    ['sans caractère spécial', 'MonMotDePasse1', false],
  ])('%s → %s', (_libelle, password, attendu) => {
    expect(change(password).success).toBe(attendu);
  });

  it('applique la même règle au mot de passe temporaire de /auth/register', () => {
    expect(register('motdepasse').success).toBe(false);
    expect(register(valide).success).toBe(true);
  });

  it('accepte le mot de passe des comptes de démonstration du seed', () => {
    // Garde-fou : si cette règle devenait plus stricte, le seed cesserait de
    // pouvoir créer ses comptes et la démo tomberait sans prévenir.
    expect(register('LogiChain2026!').success).toBe(true);
  });
});
