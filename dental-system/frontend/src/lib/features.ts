import { useAuthStore } from '@/stores/auth.store';

export type FeatureFlag = 'uiRedesign';

export type ClinicFeatures = Record<FeatureFlag, boolean>;

const ALL_OFF: ClinicFeatures = {
  uiRedesign: false,
};

export function featuresFromUser(
  features?: Partial<ClinicFeatures> | null,
): ClinicFeatures {
  return {
    uiRedesign: Boolean(features?.uiRedesign),
  };
}

/** Hook: ¿esta clínica tiene el flag activo? */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  const features = useAuthStore((s) => s.user?.features);
  return Boolean(features?.[flag]);
}

export function useClinicFeatures(): ClinicFeatures {
  const features = useAuthStore((s) => s.user?.features);
  return features ? featuresFromUser(features) : ALL_OFF;
}
