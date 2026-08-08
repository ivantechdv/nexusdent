import { Request, Response, NextFunction } from 'express';
import { sendError } from '../../utils/http';
import { exchangeRateService } from './exchange-rate.service';

export class ExchangeRateController {
  async today(req: Request, res: Response, next: NextFunction) {
    try {
      const force = String(req.query.refresh ?? '') === '1';
      const data = await exchangeRateService.getTodayRate(force);
      res.json({ data });
    } catch (err) {
      if (!sendError(res, err)) next(err);
    }
  }
}

export const exchangeRateController = new ExchangeRateController();
