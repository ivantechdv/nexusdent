import { Router } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { idempotency } from '../../middlewares/idempotency';
import { writeLimiter } from '../../middlewares/rate-limit';
import { billingController } from './billing.controller';

const router = Router();

router.use(AuthGuard, ClinicGuard);

const canRead = PermissionGuard('billing.read');
const canPay = PermissionGuard('billing.payments.write');
const canPlans = PermissionGuard('billing.plans.write');

router.get('/plans', canRead, (req, res, next) =>
  billingController.listPlans(req, res, next),
);

router.get('/plans/open/:patientId', canRead, (req, res, next) =>
  billingController.openPlan(req, res, next),
);

router.get('/plans/:id', canRead, (req, res, next) =>
  billingController.getPlan(req, res, next),
);

router.post(
  '/plans',
  canPlans,
  writeLimiter,
  idempotency('POST /api/billing/plans'),
  (req, res, next) => billingController.createPlan(req, res, next),
);

router.put('/plans/:id', canPlans, (req, res, next) =>
  billingController.updatePlan(req, res, next),
);

router.post('/plans/:id/duplicate', canPlans, (req, res, next) =>
  billingController.duplicatePlan(req, res, next),
);

router.patch(
  '/plans/:id/status',
  PermissionGuard('billing.plans.write', 'billing.payments.write'),
  (req, res, next) => billingController.updatePlanStatus(req, res, next),
);

router.get('/payments', canRead, (req, res, next) =>
  billingController.listPayments(req, res, next),
);

router.post(
  '/payments',
  canPay,
  writeLimiter,
  idempotency('POST /api/billing/payments'),
  (req, res, next) => billingController.registerPayment(req, res, next),
);

export default router;
