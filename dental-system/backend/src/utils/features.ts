/** Feature flags por clínica (rollout progresivo en VPS). */

export type FeatureFlag = 'uiRedesign';

export type ClinicFeatures = Record<FeatureFlag, boolean>;

const ALL_OFF: ClinicFeatures = {
  uiRedesign: false,
};

function parseSlugList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * FEATURE_UI_REDESIGN_SLUGS=piloto,demo
 * Vacío = nadie. Superadmin sin clínica → off.
 */
export function featuresForClinicSlug(
  clinicSlug?: string | null,
): ClinicFeatures {
  const slug = clinicSlug?.trim().toLowerCase() || '';
  if (!slug) return { ...ALL_OFF };

  const uiSlugs = parseSlugList(process.env.FEATURE_UI_REDESIGN_SLUGS);
  return {
    uiRedesign: uiSlugs.has(slug),
  };
}

/** True si alguna de las sedes del listado tiene el flag (p. ej. preauth multi-clínica). */
export function featuresForAnyClinicSlug(
  slugs: Array<string | null | undefined>,
): ClinicFeatures {
  return {
    uiRedesign: slugs.some((s) => featuresForClinicSlug(s).uiRedesign),
  };
}
