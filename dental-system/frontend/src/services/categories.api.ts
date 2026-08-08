import { api } from './api';

export interface Category {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  treatmentCount: number;
}

export type UpsertCategory = {
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
};

export async function listCategoriesApi(all = true) {
  const { data } = await api.get<{ data: Category[] }>('/categories', {
    params: all ? { all: '1' } : undefined,
  });
  return data.data;
}

export async function createCategoryApi(payload: UpsertCategory) {
  const { data } = await api.post<{ data: Category }>('/categories', payload);
  return data.data;
}

export async function updateCategoryApi(id: number, payload: UpsertCategory) {
  const { data } = await api.put<{ data: Category }>(
    `/categories/${id}`,
    payload,
  );
  return data.data;
}

export async function deleteCategoryApi(id: number) {
  await api.delete(`/categories/${id}`);
}
