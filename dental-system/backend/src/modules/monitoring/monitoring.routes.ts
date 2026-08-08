import { Router } from 'express';
import { AuthGuard, RoleGuard } from '../../middlewares/auth.middleware';
import { monitoringController } from './monitoring.controller';

const router = Router();

/** Cualquier usuario autenticado puede reportar errores de UI */
router.post('/client-errors', AuthGuard, (req, res, next) =>
  monitoringController.reportClient(req, res, next),
);

router.use(AuthGuard, RoleGuard('SUPERADMIN'));

router.get('/summary', (req, res, next) =>
  monitoringController.summary(req, res, next),
);
router.get('/latency', (req, res, next) =>
  monitoringController.latency(req, res, next),
);
router.get('/errors/series', (req, res, next) =>
  monitoringController.errorSeries(req, res, next),
);
router.get('/slow-routes', (req, res, next) =>
  monitoringController.slowRoutes(req, res, next),
);
router.get('/errors', (req, res, next) =>
  monitoringController.errors(req, res, next),
);
router.get('/by-user', (req, res, next) =>
  monitoringController.byUser(req, res, next),
);

export default router;
