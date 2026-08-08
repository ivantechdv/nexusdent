import { Request, Response, NextFunction } from 'express';
import { requireClinicId } from '../../utils/clinic';
import { sendError } from '../../utils/http';
import { dashboardService } from './dashboard.service';

export class DashboardController {
  async stats(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await dashboardService.getStats(clinicId);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }
}

export const dashboardController = new DashboardController();
