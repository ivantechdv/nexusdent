import { Router } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { categoriesController } from './categories.controller';

const router = Router();

router.use(AuthGuard, ClinicGuard);

const canRead = PermissionGuard(
  'treatments.read',
  'catalog.manage',
  'categories.write',
);
const canWrite = PermissionGuard('catalog.manage', 'categories.write');

router.get('/', canRead, (req, res, next) =>
  categoriesController.list(req, res, next),
);

router.post('/', canWrite, (req, res, next) =>
  categoriesController.create(req, res, next),
);

router.put('/:id', canWrite, (req, res, next) =>
  categoriesController.update(req, res, next),
);

router.delete('/:id', canWrite, (req, res, next) =>
  categoriesController.remove(req, res, next),
);

export default router;
