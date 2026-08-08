import { Request, Response, NextFunction } from 'express';
import { requireClinicId } from '../../utils/clinic';
import { sendError } from '../../utils/http';
import { visitsService } from './visits.service';
import { CompleteVisitDto, UpdateVisitDto } from './visits.types';

export class VisitsController {
  async complete(req: Request, res: Response, next: NextFunction) {
    try {
      const actorId = req.user?.sub;
      if (!actorId) {
        res.status(401).json({ message: 'No autenticado' });
        return;
      }
      const clinicId = requireClinicId(req);
      const data = await visitsService.completeVisit(
        clinicId,
        req.body as CompleteVisitDto,
        actorId,
      );
      res.status(201).json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const actorId = req.user?.sub;
      if (!actorId) {
        res.status(401).json({ message: 'No autenticado' });
        return;
      }
      const clinicId = requireClinicId(req);
      const data = await visitsService.updateVisit(
        clinicId,
        req.params.id,
        req.body as UpdateVisitDto,
        actorId,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }
}

export const visitsController = new VisitsController();
