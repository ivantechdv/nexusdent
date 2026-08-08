import { Router, Request, Response, NextFunction } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { requireClinicId } from '../../utils/clinic';
import { sendError } from '../../utils/http';
import { clinicsService } from '../clinics/clinics.service';
import { UpdateClinicSettingsDto } from '../clinics/clinics.types';

const router = Router();

router.use(AuthGuard, ClinicGuard);

/** Datos de la clínica activa — visible para el staff de la clínica */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinicId(req);
    const data = await clinicsService.getById(clinicId);
    res.json({ data });
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

/** Editar branding / contacto — ADMIN o SUPERADMIN */
router.patch(
  '/',
  PermissionGuard('clinic.settings'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = requireClinicId(req);
      const data = await clinicsService.updateSettings(
        clinicId,
        req.body as UpdateClinicSettingsDto,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  },
);

export default router;
