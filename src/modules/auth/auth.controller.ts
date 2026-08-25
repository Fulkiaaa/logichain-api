import type { Request, Response } from 'express';

import type { AuthService } from './auth.service';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  public register = async (req: Request, res: Response): Promise<void> => {
    const user = await this.service.register(req.body);
    res.status(201).json(user.toJSON());
  };

  public login = async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body as { email: string; password: string };
    const result = await this.service.login(email, password);
    res.status(200).json(result);
  };

  public refresh = async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body as { refreshToken: string };
    const result = await this.service.refresh(refreshToken);
    res.status(200).json(result);
  };

  /**
   * Le titulaire remplace son mot de passe temporaire. L'identité vient du JWT
   * (req.user), jamais du corps de la requête : sinon n'importe quel compte
   * connecté pourrait changer le mot de passe d'un autre.
   */
  public changePassword = async (req: Request, res: Response): Promise<void> => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };
    const result = await this.service.changePassword(
      req.user!.id,
      currentPassword,
      newPassword,
    );
    res.status(200).json(result);
  };

  /**
   * Profil courant. On relit l'utilisateur en base plutôt que de renvoyer
   * `req.user` (issu du JWT) : le jeton ne porte ni `fullName` ni `active`, or
   * le contrat OpenAPI de cette route annonce un utilisateur complet.
   */
  public me = async (req: Request, res: Response): Promise<void> => {
    const user = await this.service.me(req.user!.id);
    res.status(200).json(user.toJSON());
  };
}
