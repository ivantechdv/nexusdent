import { Request, Response, NextFunction } from 'express';
import { requireClinicId } from '../../utils/clinic';
import { sendError } from '../../utils/http';
import { odontogramService } from './odontogram.service';
import {
  BulkUpsertOdontogramDto,
  ToothSurface,
  UpsertOdontogramDto,
} from './odontogram.types';

export class OdontogramController {
  async getByPatient(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await odontogramService.getByPatient(
        clinicId,
        req.params.patientId,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async getTooth(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await odontogramService.getTooth(
        clinicId,
        req.params.patientId,
        Number(req.params.toothNumber),
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async upsert(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const body = req.body as UpsertOdontogramDto;
      const dto: UpsertOdontogramDto = {
        ...body,
        recordedBy: req.user?.sub ?? body.recordedBy,
      };
      const data = await odontogramService.upsertState(clinicId, dto);
      res.status(200).json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async bulkUpsert(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const body = req.body as BulkUpsertOdontogramDto;
      const dto: BulkUpsertOdontogramDto = {
        ...body,
        recordedBy: req.user?.sub ?? body.recordedBy,
      };
      const data = await odontogramService.bulkUpsert(clinicId, dto);
      res.status(200).json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      await odontogramService.deleteState(clinicId, req.params.id);
      res.status(204).send();
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async applyQuickDiagnosis(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const { patientId, toothNumber, surface, colorCode } = req.body as {
        patientId: string;
        toothNumber: number;
        surface: ToothSurface;
        colorCode: 'RED' | 'BLUE' | 'BLACK' | 'GREEN';
      };

      const map = {
        RED: { condition: 'CARIES' as const, status: 'PRESENT' as const },
        BLUE: { condition: 'RESTORATION' as const, status: 'TREATED' as const },
        BLACK: { condition: 'MISSING' as const, status: 'ABSENT' as const },
        GREEN: { condition: 'CARIES' as const, status: 'IN_PROGRESS' as const },
      };

      const mapped = map[colorCode];
      if (!mapped) {
        res.status(400).json({ message: 'colorCode inválido' });
        return;
      }

      const data = await odontogramService.upsertState(clinicId, {
        patientId,
        toothNumber,
        surface,
        condition: mapped.condition,
        status: mapped.status,
        recordedBy: req.user?.sub,
      });

      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }
}

export const odontogramController = new OdontogramController();
