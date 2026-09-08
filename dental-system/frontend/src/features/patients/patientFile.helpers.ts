import type { ActivePatient } from '@/stores/active-patient.store';
import type { Patient } from '@/services/patients.api';

export function formatDocument(doc: string) {
  const raw = doc.trim();
  if (!raw) return '—';
  if (/^[VEJGvejg]-/.test(raw)) return raw.toUpperCase();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  const withDots = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `V-${withDots}`;
}

export function ageYears(birthDate?: string) {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const birth = new Date(y, m - 1, d);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const md = now.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

export function formatBirthDate(birthDate?: string) {
  if (!birthDate) return '—';
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatGender(gender?: string | null) {
  switch ((gender ?? '').toUpperCase()) {
    case 'FEMALE':
    case 'F':
      return 'Femenino';
    case 'MALE':
    case 'M':
      return 'Masculino';
    case 'OTHER':
      return 'Otro';
    default:
      return '—';
  }
}

export function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '—', lastName: '—' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '—' };
  const mid = Math.ceil(parts.length / 2);
  return {
    firstName: parts.slice(0, mid).join(' '),
    lastName: parts.slice(mid).join(' ') || '—',
  };
}

export function parseAnamnesisNotes(notes?: string | null) {
  const result = {
    occupation: '—',
    insurer: '—',
    plan: '—',
    policyNumber: '—',
    expiry: '—',
    bloodType: '—',
    maritalStatus: '—',
    referredBy: '—',
  };
  if (!notes?.trim()) return result;

  // Anamnesis estructurada (JSON v1) — perfil opcional
  if (notes.trim().startsWith('{')) {
    try {
      const raw = JSON.parse(notes) as {
        v?: number;
        profile?: Partial<typeof result>;
      };
      if (raw.v === 1 && raw.profile) {
        return {
          occupation: raw.profile.occupation || '—',
          insurer: raw.profile.insurer || '—',
          plan: raw.profile.plan || '—',
          policyNumber: raw.profile.policyNumber || '—',
          expiry: raw.profile.expiry || '—',
          bloodType: raw.profile.bloodType || '—',
          maritalStatus: raw.profile.maritalStatus || '—',
          referredBy: raw.profile.referredBy || '—',
        };
      }
      return result;
    } catch {
      return result;
    }
  }

  for (const line of notes.split('\n')) {
    const t = line.trim();
    if (/^ocupaci[oó]n:/i.test(t)) {
      result.occupation = t.replace(/^ocupaci[oó]n:\s*/i, '').trim() || '—';
    }
    if (/^tipo de sangre:/i.test(t)) {
      result.bloodType = t.replace(/^tipo de sangre:\s*/i, '').trim() || '—';
    }
    if (/aseguradora:/i.test(t)) {
      const chunk = t.replace(/.*aseguradora:\s*/i, '');
      const parts = chunk.split('·').map((s) => s.trim());
      for (const p of parts) {
        if (/^p[oó]liza:/i.test(p)) {
          result.policyNumber = p.replace(/^p[oó]liza:\s*/i, '').trim() || '—';
        } else if (/^grupo:/i.test(p)) {
          result.plan = p.replace(/^grupo:\s*/i, '').trim() || '—';
        } else if (!/^titular:/i.test(p)) {
          result.insurer = p.trim() || result.insurer;
        }
      }
    }
  }
  return result;
}

export function parseEmergencyContact(contact?: string | null) {
  if (!contact?.trim()) {
    return { name: '—', relation: '—' };
  }
  const m = contact.trim().match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) {
    return { name: m[1].trim(), relation: m[2].trim() };
  }
  return { name: contact.trim(), relation: '—' };
}

export function parseAddress(address?: string | null) {
  if (!address?.trim()) {
    return { street: '—', city: '—', state: '—' };
  }
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return {
      street: parts.slice(0, -2).join(', ') || parts[0],
      city: parts[parts.length - 2] ?? '—',
      state: parts[parts.length - 1] ?? '—',
    };
  }
  if (parts.length === 2) {
    return { street: parts[0], city: parts[1], state: '—' };
  }
  return { street: address.trim(), city: '—', state: '—' };
}

export function patientAlertTags(patient: ActivePatient & Partial<Patient>) {
  const tags: Array<{ key: string; label: string; className: string }> = [];

  // Preferir datos estructurados de anamnesis JSON
  let structured: ReturnType<
    typeof import('./anamnesis.types').parseAnamnesisData
  > | null = null;
  if (patient.anamnesisNotes?.trim().startsWith('{')) {
    try {
      // lazy import avoided — inline parse
      const raw = JSON.parse(patient.anamnesisNotes) as {
        v?: number;
        pregnancy?: { active?: boolean; weeks?: number | null };
        allergies?: Array<{ name: string; severity?: string }>;
        diseases?: Record<string, boolean>;
      };
      if (raw.v === 1) {
        if (raw.pregnancy?.active) {
          const weeks = raw.pregnancy.weeks;
          tags.push({
            key: 'pregnant',
            label:
              weeks != null ? `Embarazo: ${weeks} sem` : 'Embarazo',
            className: 'border-orange-200 bg-orange-50 text-orange-700',
          });
        }
        for (const a of raw.allergies ?? []) {
          tags.push({
            key: `allergy-${a.name}`,
            label: `Alergia: ${a.name}`,
            className: 'border-red-200 bg-red-50 text-red-700',
          });
        }
        if (raw.diseases?.hypertension) {
          tags.push({
            key: 'htn',
            label: 'Hipertensa',
            className: 'border-red-200 bg-red-50 text-red-700',
          });
        }
        if (raw.diseases?.diabetes) {
          tags.push({
            key: 'dm',
            label: 'Diabetes',
            className: 'border-violet-200 bg-violet-50 text-violet-700',
          });
        }
        structured = raw as never;
      }
    } catch {
      structured = null;
    }
  }

  if (!structured) {
    if (patient.allergyPenicillin) {
      tags.push({
        key: 'penicillin',
        label: 'Alergia a Penicilina',
        className: 'border-red-200 bg-red-50 text-red-700',
      });
    }
    if (patient.allergyAnesthesia) {
      tags.push({
        key: 'anesthesia',
        label: 'Alergia a Anestesia',
        className: 'border-red-200 bg-red-50 text-red-700',
      });
    }
    if (patient.hasHypertension) {
      tags.push({
        key: 'htn',
        label: 'Hipertensión',
        className: 'border-orange-200 bg-orange-50 text-orange-700',
      });
    }
    if (patient.hasDiabetes) {
      tags.push({
        key: 'dm',
        label: 'Diabetes',
        className: 'border-violet-200 bg-violet-50 text-violet-700',
      });
    }
    if (patient.isPregnant) {
      tags.push({
        key: 'pregnant',
        label: 'Embarazo',
        className: 'border-pink-200 bg-pink-50 text-pink-700',
      });
    }
  }

  if (patient.coagulationIssues) {
    tags.push({
      key: 'coag',
      label: 'Trastorno de coagulación',
      className: 'border-amber-200 bg-amber-50 text-amber-800',
    });
  }

  // Evitar duplicar condiciones ya mostradas como badges
  if (!structured) {
    const extra = (patient.medicalConditions ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const label of extra) {
      tags.push({
        key: `cond-${label}`,
        label,
        className: 'border-slate-200 bg-slate-50 text-slate-700',
      });
    }
  }

  return tags;
}

export function patientInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}
