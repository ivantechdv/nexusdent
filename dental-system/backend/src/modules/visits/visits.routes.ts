import { Router } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { idempotency } from '../../middlewares/idempotency';
import { writeLimiter } from '../../middlewares/rate-limit';
import { visitsController } from './visits.controller';

const router = Router();

router.use(AuthGuard, ClinicGuard);

const canVisit = PermissionGuard('visits.write', 'attention.use');

router.post(
  '/',
  canVisit,
  writeLimiter,
  idempotency('POST /api/visits'),
  (req, res, next) => visitsController.complete(req, res, next),
);

router.put(
  '/:id',
  canVisit,
  writeLimiter,
  idempotency('PUT /api/visits/:id'),
  (req, res, next) => visitsController.update(req, res, next),
);

export default router;
