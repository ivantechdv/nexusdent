import { Router } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { patientsController } from './patients.controller';

const router = Router();

router.use(AuthGuard, ClinicGuard);

const canRead = PermissionGuard('patients.read');
const canWrite = PermissionGuard('patients.write');

router.get('/', canRead, (req, res, next) =>
  patientsController.list(req, res, next),
);

router.get('/document/:documentId', canRead, (req, res, next) =>
  patientsController.getByDocument(req, res, next),
);

router.get('/:id/balance', canRead, (req, res, next) =>
  patientsController.getBalance(req, res, next),
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
