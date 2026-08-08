import { NextFunction, Request, Response } from 'express';
import { requireClinicId } from '../../utils/clinic';
import { getErrorStatus, sendError } from '../../utils/http';
import { categoriesService } from './categories.service';
import { UpsertCategoryDto } from './categories.types';

export class CategoriesController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const all = req.query.all === '1' || req.query.all === 'true';
      const data = await categoriesService.list(clinicId, all);
      res.json({ data });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const data = await categoriesService.create(
        clinicId,
        req.body as UpsertCategoryDto,
      );
      res.status(201).json({ data });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const id = Number(req.params.id);
      if (!id) {
        res.status(400).json({ message: 'id inválido' });
        return;
      }
      const data = await categoriesService.update(
        clinicId,
        id,
        req.body as UpsertCategoryDto,
      );
      res.json({ data });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const clinicId = requireClinicId(req);
      const id = Number(req.params.id);
      if (!id) {
        res.status(400).json({ message: 'id inválido' });
        return;
      }
      await categoriesService.remove(clinicId, id);
      res.status(204).send();
    } catch (err) {
      if (getErrorStatus(err) < 500 && sendError(res, err)) return;
      if (sendError(res, err)) return;
      next(err);
    }
  }
}

export const categoriesController = new CategoriesController();
