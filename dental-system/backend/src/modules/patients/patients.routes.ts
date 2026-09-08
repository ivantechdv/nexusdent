import { Router } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { patientGalleryController } from '../patient-gallery/patient-gallery.controller';
import { patientNotesController } from '../patient-notes/patient-notes.controller';
import { patientsController } from './patients.controller';

const router = Router();

router.use(AuthGuard, ClinicGuard);

const canRead = PermissionGuard('patients.read');
const canWrite = PermissionGuard('patients.write');

router.get('/', canRead, (req, res, next) =>
  patientsController.list(req, res, next),
);

router.get('/summary', canRead, (req, res, next) =>
  patientsController.summary(req, res, next),
);

router.get('/document/:documentId', canRead, (req, res, next) =>
  patientsController.getByDocument(req, res, next),
);

router.get('/:id/balance', canRead, (req, res, next) =>
  patientsController.getBalance(req, res, next),
);

router.get('/:id/gallery', canRead, (req, res, next) =>
  patientGalleryController.list(req, res, next),
);

router.post('/:id/gallery', canWrite, (req, res, next) =>
  patientGalleryController.create(req, res, next),
);

router.delete('/:id/gallery/:photoId', canWrite, (req, res, next) =>
  patientGalleryController.remove(req, res, next),
);

router.get('/:id/notes', canRead, (req, res, next) =>
  patientNotesController.list(req, res, next),
);

router.get('/:id/notes/events', canRead, (req, res, next) =>
  patientNotesController.listEvents(req, res, next),
);

router.post('/:id/notes', canWrite, (req, res, next) =>
  patientNotesController.create(req, res, next),
);

router.put('/:id/notes/:noteId', canWrite, (req, res, next) =>
  patientNotesController.update(req, res, next),
);

router.delete('/:id/notes/:noteId', canWrite, (req, res, next) =>
  patientNotesController.remove(req, res, next),
);

router.get('/:id', canRead, (req, res, next) =>
  patientsController.getById(req, res, next),
);

router.post('/', canWrite, (req, res, next) =>
  patientsController.create(req, res, next),
);

router.put('/:id', canWrite, (req, res, next) =>
  patientsController.update(req, res, next),
);

export default router;
