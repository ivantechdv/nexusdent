import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import {
  getClinicSettingsApi,
  updateClinicSettingsApi,
  uploadClinicLogoApi,
  type ClinicSettings,
} from '@/services/clinic-settings.api';
import {
  applyClinicTheme,
  authenticatedMediaUrl,
} from '@/lib/clinicTheme';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/stores/toast.store';

const THEME_PRESETS = [
  { label: 'Azul clínico', value: '#1e3a8a' },
  { label: 'Verde', value: '#0f766e' },
  { label: 'Teal', value: '#0d9488' },
  { label: 'Slate', value: '#334155' },
  { label: 'Índigo', value: '#4338ca' },
  { label: 'Rojo vino', value: '#9f1239' },
];

const softLabel = 'text-sm font-medium text-clinic-ink';

type FormState = {
  name: string;
  email: string;
  whatsapp: string;
  facebookUrl: string;
  instagramUrl: string;
  address: string;
  themePrimary: string;
  logoUrl: string | null;
};

function toForm(c: ClinicSettings): FormState {
  return {
    name: c.name ?? '',
    email: c.email ?? '',
    whatsapp: c.whatsapp ?? '',
    facebookUrl: c.facebookUrl ?? '',
    instagramUrl: c.instagramUrl ?? '',
    address: c.address ?? '',
    themePrimary: c.themePrimary || '#1e3a8a',
    logoUrl: c.logoUrl ?? null,
  };
}

export function ClinicSettingsPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { user, token, setSession } = useAuthStore();
  const [form, setForm] = useState<FormState | null>(null);
  const [uploading, setUploading] = useState(false);

  const settingsQ = useQuery({
    queryKey: ['clinic-settings'],
    queryFn: getClinicSettingsApi,
    enabled: Boolean(user?.clinicId),
  });

  useEffect(() => {
    if (settingsQ.data) {
      setForm(toForm(settingsQ.data));
      applyClinicTheme(settingsQ.data.themePrimary);
    }
  }, [settingsQ.data]);

  const saveM = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('Sin formulario');
      return updateClinicSettingsApi({
        name: form.name.trim(),
        email: form.email.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        facebookUrl: form.facebookUrl.trim() || null,
        instagramUrl: form.instagramUrl.trim() || null,
        address: form.address.trim() || null,
        themePrimary: form.themePrimary,
        logoUrl: form.logoUrl,
      });
    },
    onSuccess: (data) => {
      applyClinicTheme(data.themePrimary);
      if (token && user) {
        setSession(token, {
          ...user,
          clinicName: data.name,
        });
      }
      void qc.invalidateQueries({ queryKey: ['clinic-settings'] });
      toast('Datos de la clínica guardados', 'success');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No se pudo guardar';
      toast(msg, 'error');
    },
  });

  async function onPickLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Solo imágenes (PNG, JPG, WebP…)', 'error');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast('El logo debe pesar menos de 4 MB', 'error');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadClinicLogoApi(file);
      if (!url) throw new Error('Sin URL');
      setForm((f) => (f ? { ...f, logoUrl: url } : f));
      toast('Logo cargado · guardá los cambios', 'info');
    } catch {
      toast('No se pudo subir el logo', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form?.name.trim()) {
      toast('El nombre es obligatorio', 'error');
      return;
    }
    saveM.mutate();
  }

  if (!user?.clinicId) {
    return (
      <div className="mx-auto max-w-xl p-6 text-sm text-clinic-slate">
        Entrá a una clínica para editar su información.
      </div>
    );
  }

  if (settingsQ.isLoading || !form) {
    return (
      <div className="p-6 text-sm text-clinic-slate">Cargando clínica…</div>
    );
  }

  const logoSrc = authenticatedMediaUrl(form.logoUrl);

  return (
    <div className="mx-auto max-w-xl space-y-5 p-3 sm:p-6">
      <Link
        to="/more"
        className="inline-flex items-center gap-1 text-sm font-medium text-clinic-slate md:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        Configuración
      </Link>

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-white"
              style={{ backgroundColor: form.themePrimary }}
            >
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Building2 className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-semibold text-clinic-ink sm:text-2xl">
                Mi clínica
              </h1>
              <p className="truncate text-sm text-clinic-slate">
                Branding, contacto y tema
              </p>
            </div>
          </div>
          <Button type="submit" disabled={saveM.isPending} className="shrink-0">
            {saveM.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>

        <div className="space-y-4 border-t border-slate-200/80 pt-5">
          <div>
            <p className="mb-2 text-sm font-medium text-clinic-ink">Logo</p>
            <div className="flex flex-wrap items-center gap-3">
              <div
                className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                style={{ backgroundColor: `${form.themePrimary}18` }}
              >
                {logoSrc ? (
                  <img
                    src={logoSrc}
                    alt="Logo"
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <ImagePlus className="h-7 w-7 text-slate-300" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => void onPickLogo(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? 'Subiendo…' : 'Subir logo'}
                </Button>
                {form.logoUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => (f ? { ...f, logoUrl: null } : f))
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Quitar logo
                  </button>
                )}
              </div>
            </div>
          </div>

          <Input
            id="clinic-name"
            label="Nombre de la clínica"
            labelClassName={softLabel}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            id="clinic-email"
            label="Correo de la clínica"
            labelClassName={softLabel}
            type="email"
            placeholder="contacto@clinica.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            id="clinic-wa"
            label="WhatsApp"
            labelClassName={softLabel}
            type="tel"
            placeholder="Ej. 04121234567"
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
          />
          <Input
            id="clinic-fb"
            label="Facebook"
            labelClassName={softLabel}
            placeholder="https://facebook.com/…"
            value={form.facebookUrl}
            onChange={(e) => setForm({ ...form, facebookUrl: e.target.value })}
          />
          <Input
            id="clinic-ig"
            label="Instagram"
            labelClassName={softLabel}
            placeholder="https://instagram.com/…"
            value={form.instagramUrl}
            onChange={(e) =>
              setForm({ ...form, instagramUrl: e.target.value })
            }
          />
          <Input
            id="clinic-address"
            label="Dirección"
            labelClassName={softLabel}
            placeholder="Calle, ciudad…"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>

        <div className="space-y-3 border-t border-slate-200/80 pt-5">
          <div>
            <p className="text-sm font-medium text-clinic-ink">Color del tema</p>
            <p className="text-xs text-clinic-slate">
              Se aplica al menú y acentos de la app para esta clínica.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {THEME_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                title={p.label}
                onClick={() => {
                  setForm({ ...form, themePrimary: p.value });
                  applyClinicTheme(p.value);
                }}
                className="h-9 w-9 rounded-full border-2 transition"
                style={{
                  backgroundColor: p.value,
                  borderColor:
                    form.themePrimary.toLowerCase() === p.value.toLowerCase()
                      ? '#0f172a'
                      : 'transparent',
                }}
              />
            ))}
            <label className="flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs text-clinic-slate">
              Otro
              <input
                type="color"
                value={form.themePrimary}
                onChange={(e) => {
                  setForm({ ...form, themePrimary: e.target.value });
                  applyClinicTheme(e.target.value);
                }}
                className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
          </div>
        </div>

        <div className="border-t border-slate-200/80 pt-4 md:hidden">
          <Button
            type="submit"
            disabled={saveM.isPending}
            className="w-full"
          >
            {saveM.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </div>
  );
}
