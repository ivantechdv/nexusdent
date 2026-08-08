import { Router } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { treatmentsController } from './treatments.controller';

const router = Router();

router.use(AuthGuard, ClinicGuard);

const canRead = PermissionGuard('treatments.read');
const canWrite = PermissionGuard('treatments.write', 'catalog.manage');

router.get('/', canRead, (req, res, next) =>
  treatmentsController.list(req, res, next),
);

router.get('/:id', canRead, (req, res, next) =>
  treatmentsController.getById(req, res, next),
);

router.post('/', canWrite, (req, res, next) =>
  treatmentsController.create(req, res, next),
);

router.put('/:id', canWrite, (req, res, next) =>
  treatmentsController.update(req, res, next),
);

export default router;
