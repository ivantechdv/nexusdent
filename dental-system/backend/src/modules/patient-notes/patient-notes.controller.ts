import { Request, Response, NextFunction } from 'express';
import { requireClinicId } from '../../utils/clinic';
import { sendError } from '../../utils/http';
import { patientNotesService } from './patient-notes.service';
import { UpsertClinicalNoteDto } from './patient-notes.types';

export class PatientNotesController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await patientNotesService.list(clinicId, req.params.id);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async listEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await patientNotesService.listEvents(
        clinicId,
        req.params.id,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const actorId = req.user?.sub;
      if (!actorId) {
        res.status(401).json({ message: 'No autenticado' });
        return;
      }
      const data = await patientNotesService.create(
        clinicId,
        req.params.id,
        req.body as UpsertClinicalNoteDto,
        actorId,
      );
      res.status(201).json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const actorId = req.user?.sub;
      if (!actorId) {
        res.status(401).json({ message: 'No autenticado' });
        return;
      }
      const data = await patientNotesService.update(
        clinicId,
        req.params.id,
        req.params.noteId,
        req.body as UpsertClinicalNoteDto,
        actorId,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const actorId = req.user?.sub;
      if (!actorId) {
        res.status(401).json({ message: 'No autenticado' });
        return;
      }
      await patientNotesService.remove(
        clinicId,
        req.params.id,
        req.params.noteId,
        actorId,
      );
      res.status(204).send();
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }
}

export const patientNotesController = new PatientNotesController();
