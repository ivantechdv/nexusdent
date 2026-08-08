import { Router } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { dashboardController } from './dashboard.controller';

const router = Router();

router.use(AuthGuard, ClinicGuard);

router.get(
  '/stats',
  PermissionGuard(
    'patients.read',
    'appointments.read',
    'attention.use',
    'billing.read',
  ),
  (req, res, next) => dashboardController.stats(req, res, next),
);

export default router;
