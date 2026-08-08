import { useQuery } from '@tanstack/react-query';
import { getTodayExchangeRateApi } from '@/services/exchange-rate.api';

export function useExchangeRate() {
  const q = useQuery({
    queryKey: ['exchange-rate', 'today'],
    queryFn: () => getTodayExchangeRateApi(false),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return {
    rate: q.data?.rate ?? null,
    rateDate: q.data?.rateDate ?? null,
    source: q.data?.source ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => q.refetch(),
  };
}
