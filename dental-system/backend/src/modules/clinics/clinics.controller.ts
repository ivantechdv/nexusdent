import { Request, Response, NextFunction } from 'express';
import { sendError } from '../../utils/http';
import { clinicsService } from './clinics.service';
import {
  CreateClinicDto,
  CreateClinicUserDto,
  UpdateClinicDto,
} from './clinics.types';

export class ClinicsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await clinicsService.list();
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await clinicsService.getById(req.params.id);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await clinicsService.create(req.body as CreateClinicDto, {
        actorEmail: req.user?.email ?? null,
      });
      res.status(201).json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await clinicsService.update(
        req.params.id,
        req.body as UpdateClinicDto,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await clinicsService.remove(req.params.id);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async restore(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await clinicsService.restore(req.params.id);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async purge(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await clinicsService.purge(req.params.id);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await clinicsService.listUsers(req.params.id);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as CreateClinicUserDto;
      const inviteCopyTo =
        body.copyInviteToSuperAdmin && req.user?.email
          ? req.user.email.trim().toLowerCase()
          : body.inviteCopyTo ?? null;
      const data = await clinicsService.createUser(req.params.id, {
        ...body,
        inviteCopyTo,
      });
      res.status(201).json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async ensureCatalog(req: Request, res: Response, next: NextFunction) {
    try {
      const preferred =
        typeof req.body?.copyCatalogFromClinicId === 'string'
          ? req.body.copyCatalogFromClinicId
          : null;
      const data = await clinicsService.ensureClinicCatalog(
        req.params.id,
        preferred,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }
}

export const clinicsController = new ClinicsController();
