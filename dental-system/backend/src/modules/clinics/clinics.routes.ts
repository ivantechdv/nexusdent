import { Router } from 'express';
import { AuthGuard, RoleGuard } from '../../middlewares/auth.middleware';
import { clinicsController } from './clinics.controller';

const router = Router();

router.use(AuthGuard, RoleGuard('SUPERADMIN'));

router.get('/', (req, res, next) => clinicsController.list(req, res, next));
router.post('/', (req, res, next) => clinicsController.create(req, res, next));
router.get('/:id', (req, res, next) => clinicsController.getById(req, res, next));
router.patch('/:id', (req, res, next) =>
  clinicsController.update(req, res, next),
);
router.delete('/:id', (req, res, next) =>
  clinicsController.remove(req, res, next),
);
router.post('/:id/restore', (req, res, next) =>
  clinicsController.restore(req, res, next),
);
router.delete('/:id/purge', (req, res, next) =>
  clinicsController.purge(req, res, next),
);
router.get('/:id/users', (req, res, next) =>
  clinicsController.listUsers(req, res, next),
);
router.post('/:id/users', (req, res, next) =>
  clinicsController.createUser(req, res, next),
);
router.post('/:id/ensure-catalog', (req, res, next) =>
  clinicsController.ensureCatalog(req, res, next),
);

export default router;
