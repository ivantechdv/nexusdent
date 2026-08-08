import { Router } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { appointmentsController } from './appointments.controller';

const router = Router();

/** Enlaces del correo de recordatorio (sin auth) */
router.get('/public/:token/confirm', (req, res, next) =>
  appointmentsController.publicConfirm(req, res, next),
);
router.get('/public/:token/cancel', (req, res, next) =>
  appointmentsController.publicCancel(req, res, next),
);

router.use(AuthGuard, ClinicGuard);

const canRead = PermissionGuard('appointments.read');
const canWrite = PermissionGuard('appointments.write');

router.get('/', canRead, (req, res, next) =>
  appointmentsController.list(req, res, next),
);

router.get('/:id', canRead, (req, res, next) =>
  appointmentsController.getById(req, res, next),
);

router.post('/', canWrite, (req, res, next) =>
  appointmentsController.create(req, res, next),
);

router.patch('/:id', canWrite, (req, res, next) =>
  appointmentsController.update(req, res, next),
);

export default router;
