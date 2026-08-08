import { Request, Response, NextFunction } from 'express';
import { requireClinicId } from '../../utils/clinic';
import { sendError } from '../../utils/http';
import { billingService } from './billing.service';
import {
  CreatePaymentBatchDto,
  CreatePaymentDto,
  CreatePlanDto,
  PlanStatus,
} from './billing.types';

export class BillingController {
  async listPlans(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const patientId = String(req.query.patientId ?? '');
      if (!patientId) {
        res.status(400).json({ message: 'patientId es requerido' });
        return;
      }
      const data = await billingService.listPlansByPatient(clinicId, patientId);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async getPlan(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await billingService.getPlan(clinicId, req.params.id);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async createPlan(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await billingService.createPlan(
        clinicId,
        req.body as CreatePlanDto,
        req.user?.sub,
      );
      res.status(201).json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async updatePlanStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const { status } = req.body as { status: PlanStatus };
      const data = await billingService.updatePlanStatus(
        clinicId,
        req.params.id,
        status,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async openPlan(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await billingService.getOpenPlanForPatient(
        clinicId,
        req.params.patientId,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async listPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const patientId = String(req.query.patientId ?? '');
      if (!patientId) {
        res.status(400).json({ message: 'patientId es requerido' });
        return;
      }
      const data = await billingService.listPayments(clinicId, patientId);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async registerPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const body = req.body as CreatePaymentDto & {
        splits?: CreatePaymentBatchDto['splits'];
      };
      if (body.splits?.length) {
        const data = await billingService.registerPaymentBatch(
          clinicId,
          {
            patientId: body.patientId,
            treatmentPlanId: body.treatmentPlanId,
            currencyPaid: body.currencyPaid,
            exchangeRate: body.exchangeRate,
            rateSource: body.rateSource,
            notes: body.notes,
            splits: body.splits,
          },
          req.user?.sub,
        );
        res.status(201).json({ data });
        return;
      }
      const data = await billingService.registerPayment(
        clinicId,
        body as CreatePaymentDto,
        req.user?.sub,
      );
      res.status(201).json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }
}

export const billingController = new BillingController();
