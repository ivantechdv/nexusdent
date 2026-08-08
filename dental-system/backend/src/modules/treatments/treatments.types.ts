export interface Treatment {
  id: number;
  code: string;
  name: string;
  category: string;
  description: string | null;
  base_price: number | string;
  is_active: number;
  created_at: Date;
  updated_at: Date;
}

export interface TreatmentDto {
  id: number;
  code: string;
  name: string;
  category: string;
  description: string | null;
  basePrice: number;
  isActive: boolean;
}

export interface UpsertTreatmentDto {
  code: string;
  name: string;
  category?: string;
  description?: string | null;
  basePrice: number;
  isActive?: boolean;
}

