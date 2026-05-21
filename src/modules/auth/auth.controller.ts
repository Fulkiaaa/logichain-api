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

  public me = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(req.user);
  };
}
