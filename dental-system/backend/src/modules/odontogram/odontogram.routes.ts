import { Router } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { odontogramController } from './odontogram.controller';

const router = Router();

router.use(AuthGuard, ClinicGuard);

const canRead = PermissionGuard(
  'odontogram.write',
  'attention.use',
  'patients.read',
);
const canWriteOdo = PermissionGuard('odontogram.write', 'attention.use');

router.get('/:patientId', canRead, (req, res, next) =>
  odontogramController.getByPatient(req, res, next),
);

router.get('/:patientId/tooth/:toothNumber', canRead, (req, res, next) =>
  odontogramController.getTooth(req, res, next),
);

router.put('/', canWriteOdo, (req, res, next) =>
  odontogramController.upsert(req, res, next),
);

router.put('/bulk', canWriteOdo, (req, res, next) =>
  odontogramController.bulkUpsert(req, res, next),
);

router.post('/quick-diagnosis', canWriteOdo, (req, res, next) =>
  odontogramController.applyQuickDiagnosis(req, res, next),
);

router.delete('/:id', canWriteOdo, (req, res, next) =>
  odontogramController.remove(req, res, next),
);

export default router;
