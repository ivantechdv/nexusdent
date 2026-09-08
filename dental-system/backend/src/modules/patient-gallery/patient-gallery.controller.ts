import { Request, Response, NextFunction } from 'express';
import { requireClinicId } from '../../utils/clinic';
import { sendError } from '../../utils/http';
import { patientGalleryService } from './patient-gallery.service';
import { CreateGalleryPhotoDto } from './patient-gallery.types';

export class PatientGalleryController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const kindParam = String(req.query.kind ?? '').toUpperCase();
      const kind =
        kindParam === 'RADIOGRAPH' || kindParam === 'GALLERY'
          ? kindParam
          : undefined;
      const data = await patientGalleryService.listByPatient(
        clinicId,
        req.params.id,
        kind,
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
      const body = req.body as CreateGalleryPhotoDto;
      const data = await patientGalleryService.create(
        clinicId,
        req.params.id,
        body,
        actorId,
      );
      res.status(201).json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      await patientGalleryService.remove(
        clinicId,
        req.params.id,
        req.params.photoId,
      );
      res.status(204).send();
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }
}

export const patientGalleryController = new PatientGalleryController();
