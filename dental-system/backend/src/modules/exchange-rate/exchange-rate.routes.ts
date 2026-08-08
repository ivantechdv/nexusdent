import { Router } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { exchangeRateController } from './exchange-rate.controller';

const router = Router();

router.use(AuthGuard, ClinicGuard);

router.get(
  '/today',
  PermissionGuard(
    'billing.read',
    'billing.payments.write',
    'attention.use',
    'patients.read',
  ),
  (req, res, next) => exchangeRateController.today(req, res, next),
);

export default router;
