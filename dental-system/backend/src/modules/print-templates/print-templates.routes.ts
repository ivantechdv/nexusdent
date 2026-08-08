import { Router, Request, Response, NextFunction } from 'express';
import {
  AuthGuard,
  ClinicGuard,
  PermissionGuard,
} from '../../middlewares/auth.middleware';
import { requireClinicId } from '../../utils/clinic';
import { sendError } from '../../utils/http';
import { printTemplatesService } from './print-templates.service';
import {
  PrintDocType,
  UpsertPrintFooterDto,
  UpsertPrintFormatDto,
  UpsertPrintHeaderDto,
} from './print-templates.types';

const router = Router();
router.use(AuthGuard, ClinicGuard);

const manage = PermissionGuard('print.manage');

/** Bundle completo para la pantalla de configuración */
router.get('/bundle', async (req, res, next) => {
  try {
    const clinicId = requireClinicId(req);
    const data = await printTemplatesService.listBundle(clinicId);
    res.json({ data });
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

/** Formatos activos para el selector al imprimir */
router.get('/formats', async (req, res, next) => {
  try {
    const clinicId = requireClinicId(req);
    const docType = (String(req.query.docType ?? 'ATTENTION_LOG') ||
      'ATTENTION_LOG') as PrintDocType;
    const data = await printTemplatesService.listFormatsForPrint(
      clinicId,
      docType,
    );
    res.json({ data });
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

router.post('/headers', manage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinicId(req);
    const data = await printTemplatesService.createHeader(
      clinicId,
      req.body as UpsertPrintHeaderDto,
    );
    res.status(201).json({ data });
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

router.patch(
  '/headers/:id',
  manage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = requireClinicId(req);
      const data = await printTemplatesService.updateHeader(
        clinicId,
        req.params.id,
        req.body as UpsertPrintHeaderDto,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  },
);

router.delete(
  '/headers/:id',
  manage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = requireClinicId(req);
      await printTemplatesService.deleteHeader(clinicId, req.params.id);
      res.status(204).send();
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  },
);

router.post('/footers', manage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinicId(req);
    const data = await printTemplatesService.createFooter(
      clinicId,
      req.body as UpsertPrintFooterDto,
    );
    res.status(201).json({ data });
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

router.patch(
  '/footers/:id',
  manage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = requireClinicId(req);
      const data = await printTemplatesService.updateFooter(
        clinicId,
        req.params.id,
        req.body as UpsertPrintFooterDto,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  },
);

router.delete(
  '/footers/:id',
  manage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = requireClinicId(req);
      await printTemplatesService.deleteFooter(clinicId, req.params.id);
      res.status(204).send();
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  },
);

router.post('/formats', manage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinicId(req);
    const data = await printTemplatesService.createFormat(
      clinicId,
      req.body as UpsertPrintFormatDto,
    );
    res.status(201).json({ data });
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

router.patch(
  '/formats/:id',
  manage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = requireClinicId(req);
      const data = await printTemplatesService.updateFormat(
        clinicId,
        req.params.id,
        req.body as UpsertPrintFormatDto,
      );
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  },
);

router.delete(
  '/formats/:id',
  manage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = requireClinicId(req);
      await printTemplatesService.deleteFormat(clinicId, req.params.id);
      res.status(204).send();
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  },
);

export default router;
