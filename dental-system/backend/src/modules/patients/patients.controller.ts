import { Request, Response, NextFunction } from 'express';
import { requireClinicId } from '../../utils/clinic';
import { sendError } from '../../utils/http';
import { patientsService } from './patients.service';
import { UpsertPatientDto } from './patients.types';

export class PatientsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const data = await patientsService.list(clinicId, q, limit);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async summary(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await patientsService.summary(clinicId);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await patientsService.getById(clinicId, req.params.id);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async getByDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await patientsService.getByDocument(
        clinicId,
        req.params.documentId,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async getBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await patientsService.getBalance(clinicId, req.params.id);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await patientsService.create(
        clinicId,
        req.body as UpsertPatientDto,
      );
      res.status(201).json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await patientsService.update(
        clinicId,
        req.params.id,
        req.body as UpsertPatientDto,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }
}

export const patientsController = new PatientsController();
