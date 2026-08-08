import { Request, Response, NextFunction } from 'express';
import { requireClinicId } from '../../utils/clinic';
import { sendError } from '../../utils/http';
import { treatmentsService } from './treatments.service';
import { UpsertTreatmentDto } from './treatments.types';

export class TreatmentsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const category =
        typeof req.query.category === 'string' ? req.query.category : undefined;
      const all = req.query.all === '1' || req.query.all === 'true';
      const data = await treatmentsService.list(clinicId, {
        q,
        category,
        activeOnly: !all,
      });
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await treatmentsService.getById(
        clinicId,
        Number(req.params.id),
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await treatmentsService.create(
        clinicId,
        req.body as UpsertTreatmentDto,
      );
      res.status(201).json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await treatmentsService.update(
        clinicId,
        Number(req.params.id),
        req.body as UpsertTreatmentDto,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }
}

export const treatmentsController = new TreatmentsController();
