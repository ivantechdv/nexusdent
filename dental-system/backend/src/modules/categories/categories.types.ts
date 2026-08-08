export interface Category {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  is_active: number;
  created_at: Date;
  updated_at: Date;
}

export interface CategoryDto {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  treatmentCount: number;
}

export interface UpsertCategoryDto {
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
}
