import { api } from './api';

export type RateSource = 'BCV' | 'MANUAL';

export interface ExchangeRate {
  rate: number;
  rateDate: string;
  source: RateSource;
  fetchedAt: string;
  editable: boolean;
}

export async function getTodayExchangeRateApi(refresh = false) {
  const { data } = await api.get<{ data: ExchangeRate }>(
    '/exchange-rate/today',
    { params: refresh ? { refresh: '1' } : undefined },
  );
  return data.data;
}
