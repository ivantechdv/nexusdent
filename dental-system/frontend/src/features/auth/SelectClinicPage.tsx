import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  MapPin,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import clsx from 'clsx';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ClinicOption } from '@/services/auth.api';

const NAV_LINKS = ['Find Care', 'Services', 'Doctors', 'Portal'] as const;
const LAST_ACCESS_KEY = 'nexusdent:lastClinicAccess';

type LastAccess = {
  userId: string;
  clinicId: string;
  clinicName: string;
  at: string;
};

type ClinicPin = ClinicOption & {
  lat: number;
  lng: number;
  miles: number;
  openNow: boolean;
};

type SelectClinicPageProps = {
  clinics: ClinicOption[];
  userName: string;
  userId?: string;
  loading?: boolean;
  error?: string;
  onSelect: (clinicId: string) => void;
  onBack: () => void;
};

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function coordsForClinic(clinic: ClinicOption, index: number): [number, number] {
  const seed = hashSeed(clinic.id || clinic.slug || String(index));
  const lat = 10.4806 + ((seed % 180) - 90) / 1200 + index * 0.018;
  const lng = -66.9036 + (((seed >> 9) % 180) - 90) / 1000 + index * 0.014;
  return [lat, lng];
}

function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function greetName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return 'doctor';
  if (/^(dr\.?|dra\.?)\b/i.test(trimmed)) return trimmed;
  return `Dr. ${trimmed.split(/\s+/)[0]}`;
}

function readLastAccess(userId?: string): LastAccess | null {
  try {
    const raw = localStorage.getItem(LAST_ACCESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastAccess;
    if (userId && parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function rememberClinicAccess(
  userId: string,
  clinic: Pick<ClinicOption, 'id' | 'name'>,
) {
  const payload: LastAccess = {
    userId,
    clinicId: clinic.id,
    clinicName: clinic.name,
    at: new Date().toISOString(),
  };
  localStorage.setItem(LAST_ACCESS_KEY, JSON.stringify(payload));
}

function formatLastAccess(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function continueLabel(name: string) {
  const first = name.trim().split(/\s+/)[0] || 'Downtown';
  return `Continue with ${first}`;
}

function createPinIcon(selected: boolean, label: string) {
  const bg = selected ? '#2b7a78' : '#ffffff';
  const color = selected ? '#ffffff' : '#0f172a';
  const border = selected ? '#2b7a78' : '#e2e8f0';
  const safe = label.replace(/[<>&"']/g, '');
  return L.divIcon({
    className: '',
    iconSize: [120, 36],
    iconAnchor: [60, 40],
    html: `<div style="
      display:inline-flex;align-items:center;gap:6px;
      padding:8px 12px;border-radius:999px;
      background:${bg};color:${color};border:1px solid ${border};
      box-shadow:0 10px 24px rgba(15,23,42,.16);
      font:600 12px Outfit,DM Sans,system-ui,sans-serif;
      white-space:nowrap;max-width:140px;
    "><span style="width:8px;height:8px;border-radius:999px;background:${selected ? '#fff' : '#2b7a78'}"></span><span style="overflow:hidden;text-overflow:ellipsis">${safe}</span></div>`,
  });
}

export function SelectClinicPage({
  clinics,
  userName,
  userId,
  loading,
  error,
  onSelect,
  onBack,
}: SelectClinicPageProps) {
  const [query, setQuery] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(clinics[0]?.id ?? '');
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const lastAccess = useMemo(() => readLastAccess(userId), [userId]);

  const pins: ClinicPin[] = useMemo(() => {
    return clinics.map((c, index) => {
      const [lat, lng] = coordsForClinic(c, index);
      const miles = userPos
        ? haversineMiles(userPos, { lat, lng })
        : 0.8 + index * 1.6 + (hashSeed(c.id) % 10) / 10;
      return {
        ...c,
        lat,
        lng,
        miles,
        openNow: !c.isDemo,
      };
    });
  }, [clinics, userPos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pins.filter((p) => {
      if (openOnly && !p.openNow) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.address ?? '').toLowerCase().includes(q) ||
        (p.phone ?? '').toLowerCase().includes(q)
      );
    });
  }, [pins, query, openOnly]);

  const selected =
    filtered.find((p) => p.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 6000 },
    );
  }, []);

  useEffect(() => {
    if (!selectedId && clinics[0]) setSelectedId(clinics[0].id);
  }, [clinics, selectedId]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([10.4806, -66.9036], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;
    requestAnimationFrame(() => map.invalidateSize());
    return () => {
      map.remove();
      mapInstance.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    const group = markersRef.current;
    if (!map || !group) return;
    group.clearLayers();
    if (filtered.length === 0) return;

    const bounds: L.LatLngExpression[] = [];
    filtered.forEach((pin) => {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: createPinIcon(pin.id === selected?.id, pin.name),
        title: pin.name,
      });
      marker.on('click', () => setSelectedId(pin.id));
      group.addLayer(marker);
      bounds.push([pin.lat, pin.lng]);
    });

    if (userPos) {
      const you = L.circleMarker([userPos.lat, userPos.lng], {
        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: '#ff6b00',
        fillOpacity: 1,
      });
      group.addLayer(you);
      bounds.push([userPos.lat, userPos.lng]);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 14, { animate: true });
    } else {
      map.fitBounds(L.latLngBounds(bounds), { padding: [48, 48], maxZoom: 14 });
    }
    requestAnimationFrame(() => map.invalidateSize());
  }, [filtered, selected?.id, userPos]);

  function directionsUrl(clinic: ClinicPin) {
    const q = encodeURIComponent(
      clinic.address?.trim() || `${clinic.name} ${clinic.lat},${clinic.lng}`,
    );
    return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  }

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    const ro =
      typeof ResizeObserver !== 'undefined' && mapRef.current
        ? new ResizeObserver(onResize)
        : null;
    if (ro && mapRef.current) ro.observe(mapRef.current);
    requestAnimationFrame(onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, []);

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-[#f4f7fa] text-[#0f172a]">
      <header className="flex h-[76px] shrink-0 items-center border-b border-[#e2e8f0] bg-white px-6 xl:px-16">
        <div className="flex w-full items-center justify-between gap-6">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2.5"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0f766e] text-white">
              <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} />
            </span>
            <span className="font-display text-xl font-bold tracking-tight text-[#0f172a]">
              NexusDent
            </span>
          </button>

          <nav className="hidden items-center gap-8 text-sm lg:flex">
            {NAV_LINKS.map((label) => (
              <span
                key={label}
                className={clsx(
                  label === 'Find Care'
                    ? 'font-semibold text-[#2b7a78]'
                    : 'font-medium text-[#475569]',
                )}
              >
                {label}
              </span>
            ))}
          </nav>

          <p className="hidden text-[13px] text-[#475569] sm:block">
            Emergency Hotlines:{' '}
            <span className="text-sm font-bold text-[#2b7a78]">24/7 Support</span>
          </p>
        </div>
      </header>

      <main className="flex w-full flex-1 flex-col gap-6 px-6 py-6 lg:flex-row lg:items-start lg:gap-12 lg:px-16 lg:py-10">
        <section className="flex w-full min-w-0 flex-1 flex-col gap-7">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold text-[#2b7a78]">Seleccionar Sede</p>
            <h1 className="font-display text-[32px] font-bold leading-none tracking-tight text-[#0f172a] lg:text-[36px]">
              Seleccionar Sede
            </h1>
            <p className="text-[15px] text-[#475569]">
              Bienvenido, {greetName(userName)} — Selecciona tu sede de trabajo
            </p>
          </div>

          <div className="flex h-[50px] shrink-0 items-center gap-3 rounded-xl border border-[#e2e8f0] bg-white px-4">
            <Search className="h-[18px] w-[18px] shrink-0 text-[#94a3b8]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar sede o dirección..."
              className="min-w-0 flex-1 bg-transparent text-sm text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
            />
            <button
              type="button"
              onClick={() => setOpenOnly((v) => !v)}
              className={clsx(
                'inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold transition',
                openOnly ? 'text-[#0f766e]' : 'text-[#2b7a78]',
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {filtered.map((clinic) => {
              const active = clinic.id === selected?.id;
              return (
                <button
                  key={clinic.id}
                  type="button"
                  onClick={() => setSelectedId(clinic.id)}
                  className={clsx(
                    'flex w-full items-center gap-5 rounded-2xl bg-white p-6 text-left transition',
                    active
                      ? 'border-2 border-[#2b7a78] shadow-[0_12px_30px_rgba(43,122,120,0.12)]'
                      : 'border border-[#e2e8f0] hover:border-[#cbd5e1]',
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 text-sm font-medium">
                        <span
                          className={clsx(
                            'h-2 w-2 rounded-full',
                            clinic.openNow ? 'bg-[#10b981]' : 'bg-[#94a3b8]',
                          )}
                        />
                        <span
                          className={
                            clinic.openNow ? 'text-[#10b981]' : 'text-[#94a3b8]'
                          }
                        >
                          {clinic.openNow ? 'Open Now' : 'Offline'}
                        </span>
                      </span>
                      <span className="rounded-full bg-[#f8fafc] px-3 py-1 text-xs text-[#475569]">
                        {clinic.miles.toFixed(1)} miles away
                      </span>
                    </div>

                    <div className="space-y-1">
                      <p className="font-display text-xl font-bold leading-tight text-[#0f172a]">
                        {clinic.name}
                      </p>
                      <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-[#2b7a78]">
                        {clinic.name}
                      </p>
                    </div>

                    <div className="space-y-1.5 text-sm text-[#475569]">
                      <p className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#94a3b8]" />
                        <span>
                          {clinic.address?.trim() || `Slug · ${clinic.slug}`}
                        </span>
                      </p>
                      {clinic.phone?.trim() ? (
                        <p className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 shrink-0 text-[#94a3b8]" />
                          <span>{clinic.phone}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <span
                    className={clsx(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      active
                        ? 'bg-[#2b7a78] text-white'
                        : 'bg-[#f8fafc] text-[#94a3b8]',
                    )}
                  >
                    <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.4} />
                  </span>
                </button>
              );
            })}

            {filtered.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#e2e8f0] bg-white px-6 py-12 text-center text-sm text-[#475569]">
                No hay sedes que coincidan con la búsqueda.
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={onBack}
            className="w-fit text-sm text-[#94a3b8] underline underline-offset-2 hover:text-[#475569]"
          >
            Volver al login
          </button>
        </section>

        <section className="flex h-[min(420px,50dvh)] w-full shrink-0 flex-col overflow-hidden rounded-3xl border border-[#e2e8f0] bg-white lg:sticky lg:top-[116px] lg:h-[calc(100dvh-192px)] lg:w-auto lg:aspect-square lg:max-w-[calc(100dvh-192px)]">
          <div className="relative min-h-0 flex-1">
            <div ref={mapRef} className="absolute inset-0 h-full w-full" />
          </div>

          {selected && (
            <div className="flex h-[86px] shrink-0 items-center justify-between gap-4 border-t border-[#e2e8f0] bg-white px-6">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#94a3b8]">
                  Selected Medical Point
                </p>
                <p className="truncate font-display text-base font-semibold text-[#0f172a]">
                  {selected.name}
                </p>
              </div>
              <div className="flex shrink-0 gap-3">
                <a
                  href={directionsUrl(selected)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-[37px] items-center justify-center rounded-lg border border-[#e2e8f0] px-4 text-[13px] font-semibold text-[#475569] transition hover:bg-[#f8fafc]"
                >
                  Get Directions
                </a>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onSelect(selected.id)}
                  className="inline-flex h-[37px] items-center justify-center rounded-lg bg-[#ff6b00] px-4 text-[13px] font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
                >
                  {loading ? 'Entrando…' : continueLabel(selected.name)}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="mt-auto flex h-16 shrink-0 items-center justify-between gap-4 border-t border-[#e2e8f0] bg-white px-6 text-xs text-[#94a3b8] xl:px-16">
        <p className="truncate">
          {lastAccess
            ? `Último acceso: ${lastAccess.clinicName} — ${formatLastAccess(lastAccess.at)}`
            : 'Primera selección de sede en este dispositivo'}
        </p>
        <p className="hidden shrink-0 sm:block">
          Terms of Service • Privacy Policy • HIPAA Compliance
        </p>
      </footer>
    </div>
  );
}
