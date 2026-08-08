import { Request, Response, NextFunction } from 'express';
import { requireClinicId } from '../../utils/clinic';
import { sendError } from '../../utils/http';
import { clinicalRecordsService } from './clinical-records.service';
import {
  CreateClinicalRecordDto,
  UpdateClinicalRecordDto,
} from './clinical-records.types';

export class ClinicalRecordsController {
  async listByPatient(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await clinicalRecordsService.listByPatient(
        clinicId,
        req.params.patientId,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await clinicalRecordsService.getById(clinicId, req.params.id);
      if (!data) {
        res.status(404).json({ message: 'Evolución clínica no encontrada' });
        return;
      }
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const body = req.body as CreateClinicalRecordDto;
      const dto: CreateClinicalRecordDto = {
        ...body,
        dentistId: body.dentistId ?? req.user?.sub,
      };
      const data = await clinicalRecordsService.create(clinicId, dto);
      res.status(201).json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const dto = req.body as UpdateClinicalRecordDto;
      const data = await clinicalRecordsService.update(
        clinicId,
        req.params.id,
        dto,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      await clinicalRecordsService.remove(clinicId, req.params.id);
      res.status(204).send();
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }
}

export const clinicalRecordsController = new ClinicalRecordsController();
