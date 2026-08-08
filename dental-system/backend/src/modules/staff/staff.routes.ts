import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { PERMISSION_MODULES } from '../../middlewares/permissions';
import { requireClinicId } from '../../utils/clinic';
import { sendError } from '../../utils/http';
import { clinicsService } from '../clinics/clinics.service';
import {
  CreateClinicUserDto,
  UpdateClinicUserDto,
} from '../clinics/clinics.types';

const router = Router();

router.use(AuthGuard, ClinicGuard);

const staffManage = PermissionGuard('staff.manage');

/** Catálogo de módulos para UI de permisos */
router.get(
  '/permission-modules',
  staffManage,
  (_req: Request, res: Response) => {
    res.json({ data: PERMISSION_MODULES });
  },
);

/** Staff de la clínica activa */
router.get(
  '/',
  staffManage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = requireClinicId(req);
      const data = await clinicsService.listUsers(clinicId);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  },
);

router.post(
  '/',
  staffManage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = requireClinicId(req);
      const data = await clinicsService.createUser(
        clinicId,
        req.body as CreateClinicUserDto,
      );
      res.status(201).json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  },
);

router.patch(
  '/:userId',
  staffManage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = requireClinicId(req);
      const data = await clinicsService.updateUser(
        clinicId,
        req.params.userId,
        req.body as UpdateClinicUserDto,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  },
);

export default router;
