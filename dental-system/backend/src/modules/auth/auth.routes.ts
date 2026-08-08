import { Router } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { loginLimiter } from '../../middlewares/rate-limit';
import { authController } from './auth.controller';

const router = Router();

router.post('/login', loginLimiter, (req, res, next) =>
  authController.login(req, res, next),
);

router.post('/forgot-password', loginLimiter, (req, res, next) =>
  authController.forgotPassword(req, res, next),
);

router.post('/reset-password', loginLimiter, (req, res, next) =>
  authController.resetPassword(req, res, next),
);

router.post('/select-clinic', AuthGuard, (req, res, next) =>
  authController.selectClinic(req, res, next),
);

router.post('/change-password', AuthGuard, (req, res, next) =>
  authController.changePassword(req, res, next),
);

router.post('/leave-clinic', AuthGuard, (req, res, next) =>
  authController.leaveClinic(req, res, next),
);

router.get('/me', AuthGuard, (req, res, next) =>
  authController.me(req, res, next),
);

router.patch('/profile', AuthGuard, (req, res, next) =>
  authController.updateProfile(req, res, next),
);

router.get('/clinics', AuthGuard, (req, res, next) =>
  authController.listMyClinics(req, res, next),
);

router.get(
  '/dentists',
  AuthGuard,
  ClinicGuard,
  PermissionGuard(
    'appointments.read',
    'appointments.write',
    'attention.use',
    'patients.read',
  ),
  (req, res, next) => authController.listDentists(req, res, next),
);

export default router;
