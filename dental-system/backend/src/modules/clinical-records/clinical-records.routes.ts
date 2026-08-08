import { Router } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { clinicalRecordsController } from './clinical-records.controller';

const router = Router();

router.use(AuthGuard, ClinicGuard);

const canReadClinical = PermissionGuard(
  'clinical.write',
  'attention.use',
  'patients.read',
);
const canWriteClinical = PermissionGuard('clinical.write', 'attention.use');

router.get('/patient/:patientId', canReadClinical, (req, res, next) =>
  clinicalRecordsController.listByPatient(req, res, next),
);

router.get('/:id', canReadClinical, (req, res, next) =>
  clinicalRecordsController.getById(req, res, next),
);

router.post('/', canWriteClinical, (req, res, next) =>
  clinicalRecordsController.create(req, res, next),
);

router.patch('/:id', canWriteClinical, (req, res, next) =>
  clinicalRecordsController.update(req, res, next),
);

router.delete('/:id', canWriteClinical, (req, res, next) =>
  clinicalRecordsController.remove(req, res, next),
);

export default router;
