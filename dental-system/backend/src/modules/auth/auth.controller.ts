import { Request, Response, NextFunction } from 'express';
import { requireClinicId } from '../../utils/clinic';
import { sendError } from '../../utils/http';
import { authService } from './auth.service';
import {
  LoginDto,
  SelectClinicDto,
  ChangePasswordDto,
  UpdateProfileDto,
} from './auth.types';

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as LoginDto;
      const data = await authService.login(body);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async selectClinic(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        res.status(401).json({ message: 'No autenticado' });
        return;
      }
      const body = req.body as SelectClinicDto;
      const data = await authService.selectClinic(userId, body.clinicId);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async leaveClinic(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        res.status(401).json({ message: 'No autenticado' });
        return;
      }
      const data = await authService.leaveClinic(userId);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        res.status(401).json({ message: 'No autenticado' });
        return;
      }
      const body = req.body as ChangePasswordDto;
      const data = await authService.changePassword(
        userId,
        body.currentPassword,
        body.newPassword,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        res.status(401).json({ message: 'No autenticado' });
        return;
      }
      const data = await authService.me(userId, req.user?.clinicId);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        res.status(401).json({ message: 'No autenticado' });
        return;
      }
      const body = req.body as UpdateProfileDto;
      const data = await authService.updateProfile(
        userId,
        req.user?.clinicId,
        body,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async listMyClinics(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        res.status(401).json({ message: 'No autenticado' });
        return;
      }
      const data = await authService.listMyClinics(userId);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async listDentists(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await authService.listDentists(clinicId);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const email = String((req.body as { email?: string })?.email ?? '');
      const data = await authService.forgotPassword(email);
      res.json({
        data,
        message:
          'Si el email está registrado, te enviamos un enlace para restablecer la contraseña.',
      });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as { token?: string; newPassword?: string };
      const data = await authService.resetPassword(
        String(body.token ?? ''),
        String(body.newPassword ?? ''),
      );
      res.json({ data, message: 'Contraseña actualizada. Ya podés iniciar sesión.' });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }
}

export const authController = new AuthController();
