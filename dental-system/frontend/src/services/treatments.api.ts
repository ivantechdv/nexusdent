import { api } from './api';

export interface Treatment {
  id: number;
  code: string;
  name: string;
  category: string;
  description: string | null;
  basePrice: number;
  isActive: boolean;
}

export type UpsertTreatment = {
  code: string;
  name: string;
  category?: string;
  description?: string | null;
  basePrice: number;
  isActive?: boolean;
};

export async function listTreatmentsApi(params?: {
  q?: string;
  category?: string;
  all?: boolean;
}) {
  const { data } = await api.get<{ data: Treatment[] }>('/treatments', {
    params: {
      q: params?.q,
      category: params?.category,
      all: params?.all ? '1' : undefined,
    },
  });
  return data.data;
}

export async function createTreatmentApi(payload: UpsertTreatment) {
  const { data } = await api.post<{ data: Treatment }>('/treatments', payload);
  return data.data;
}

export async function updateTreatmentApi(id: number, payload: UpsertTreatment) {
  const { data } = await api.put<{ data: Treatment }>(`/treatments/${id}`, payload);
  return data.data;
}
