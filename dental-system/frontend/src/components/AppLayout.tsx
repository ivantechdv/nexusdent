import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Building2,
  CalendarDays,
  ChevronDown,
  FolderTree,
  Home,
  LogOut,
  MessageCircle,
  Printer,
  Settings,
  Shield,
  Stethoscope,
  UserRound,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import { SUPPORT_WHATSAPP_URL } from '@/config/support';
import { useAuthStore } from '@/stores/auth.store';
import { can, NAV_PERMISSIONS, type Permission } from '@/lib/permissions';
import { useFeatureFlag } from '@/lib/features';
import { toast } from '@/stores/toast.store';
import { BcvRatePill } from '@/components/BcvRateCard';
import { getClinicSettingsApi } from '@/services/clinic-settings.api';
import {
  applyClinicTheme,
  authenticatedMediaUrl,
  resetClinicTheme,
} from '@/lib/clinicTheme';

type NavItem = {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
  permission?: Permission | null;
  needsClinic?: boolean;
};

const mainLinks: NavItem[] = [
  {
    to: '/platform',
    label: 'Plataforma',
    icon: Building2,
    permission: 'platform.manage',
  },
  {
    to: '/monitor',
    label: 'Monitoreo',
    icon: Shield,
    permission: 'monitor.view',
  },
  { to: '/', label: 'Inicio', icon: Home, end: true, needsClinic: true },
  {
    to: '/atencion',
    label: 'Atención',
    icon: Activity,
    permission: 'attention.use',
    needsClinic: true,
  },
  {
    to: '/patients',
    label: 'Pacientes',
    icon: Users,
    permission: 'patients.read',
    needsClinic: true,
  },
  {
    to: '/appointments',
    label: 'Citas',
    icon: CalendarDays,
    permission: 'appointments.read',
    needsClinic: true,
  },
];

const CONFIG_PATHS = [
  '/more',
  '/profile',
  '/categories',
  '/treatments',
  '/staff',
  '/clinic',
  '/print-settings',
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { user, logout } = useAuthStore();
  const uiRedesign = useFeatureFlag('uiRedesign');
  const role = user?.role;
  const perms = (user?.permissions ?? null) as Permission[] | null;
  const hasClinic = Boolean(user?.clinicId);
  const isPlatformAdmin = role === 'SUPERADMIN' && !hasClinic;
  const canAttention = can(role, 'attention.use', perms) && hasClinic;

  const clinicQ = useQuery({
    queryKey: ['clinic-settings', user?.clinicId],
    queryFn: getClinicSettingsApi,
    enabled: hasClinic,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (clinicQ.data?.themePrimary) {
      applyClinicTheme(clinicQ.data.themePrimary);
    } else if (!hasClinic) {
      resetClinicTheme();
    }
  }, [clinicQ.data?.themePrimary, hasClinic]);

  const configActive = CONFIG_PATHS.some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
  );
  const [configOpen, setConfigOpen] = useState(configActive);

  useEffect(() => {
    if (configActive) setConfigOpen(true);
  }, [configActive]);

  const visibleMain = useMemo(
    () =>
      mainLinks.filter((l) => {
        const perm = l.permission ?? NAV_PERMISSIONS[l.to];
        if (perm && !can(role, perm, perms)) return false;
        if (l.needsClinic && !hasClinic && role === 'SUPERADMIN') return false;
        if (isPlatformAdmin && l.needsClinic) return false;
        return true;
      }),
    [role, perms, hasClinic, isPlatformAdmin],
  );

  const configChildren = useMemo(() => {
    const items: Array<{
      to?: string;
      href?: string;
      label: string;
      icon: typeof Home;
      external?: boolean;
    }> = [];

    if (can(role, 'clinic.settings', perms) && hasClinic) {
      items.push({ to: '/clinic', label: 'Mi clínica', icon: Building2 });
    }
    if (can(role, 'print.manage', perms) && hasClinic) {
      items.push({ to: '/print-settings', label: 'Impresión', icon: Printer });
    }
    if (can(role, 'staff.manage', perms) && hasClinic) {
      items.push({ to: '/staff', label: 'Usuarios', icon: Users });
    }
    if (can(role, 'catalog.manage', perms) && hasClinic) {
      items.push({ to: '/categories', label: 'Categorías', icon: FolderTree });
    }
    if (can(role, 'treatments.read', perms) && hasClinic) {
      items.push({ to: '/treatments', label: 'Catálogo', icon: Stethoscope });
    }
    items.push({ to: '/profile', label: 'Mi perfil', icon: UserRound });
    items.push({
      href: SUPPORT_WHATSAPP_URL,
      label: 'WhatsApp soporte',
      icon: MessageCircle,
      external: true,
    });
    return items;
  }, [role, perms, hasClinic]);

  const attentionActive =
    location.pathname.startsWith('/atencion') ||
    location.pathname.startsWith('/evolucion');
  const logoSrc = authenticatedMediaUrl(clinicQ.data?.logoUrl);
  const clinicTitle =
    clinicQ.data?.name ?? user?.clinicName ?? 'Clínica odontológica';

  function handleLogout() {
    resetClinicTheme();
    logout();
    qc.clear();
    toast('Sesión cerrada', 'info');
    navigate('/login');
  }

  const shell = (
    <div className="min-h-[100dvh] w-full bg-clinic-surface md:flex">
      <aside
        className={clsx(
          'sticky top-0 z-40 hidden h-[100dvh] w-60 shrink-0 flex-col border-r md:flex',
          uiRedesign
            ? 'border-[#0d1e21] bg-[#0d1e21] text-white'
            : 'border-slate-200/80 bg-white',
        )}
      >
        <div
          className={clsx(
            'flex items-center gap-2.5 border-b px-5 py-5',
            uiRedesign ? 'border-white/10' : 'border-slate-100',
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#0f766e] text-sm font-bold text-white">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              'N'
            )}
          </div>
          <div className="min-w-0">
            <p
              className={clsx(
                'font-display text-base font-semibold leading-tight',
                uiRedesign ? 'text-white' : 'text-clinic-ink',
              )}
            >
              NexusDent
            </p>
            <p
              className={clsx(
                'truncate text-[11px]',
                uiRedesign ? 'text-slate-400' : 'text-clinic-slate',
              )}
            >
              {hasClinic
                ? clinicTitle
                : user?.role === 'SUPERADMIN'
                  ? 'Plataforma'
                  : 'Clínica odontológica'}
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {visibleMain.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'inline-flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  uiRedesign
                    ? isActive
                      ? 'bg-[#2b7a78] text-white shadow-sm'
                      : 'text-[#93a5a8] hover:bg-white/10 hover:text-white'
                    : isActive
                      ? 'bg-clinic-deep text-white shadow-sm'
                      : 'text-clinic-slate hover:bg-slate-100 hover:text-clinic-ink',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label === 'Inicio' && uiRedesign ? 'Dashboard' : label}
            </NavLink>
          ))}

          {!isPlatformAdmin && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setConfigOpen((o) => !o)}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  uiRedesign
                    ? configActive
                      ? 'bg-white/10 text-white'
                      : 'text-[#93a5a8] hover:bg-white/10 hover:text-white'
                    : configActive
                      ? 'bg-clinic-deep/10 text-clinic-deep'
                      : 'text-clinic-slate hover:bg-slate-100 hover:text-clinic-ink',
                )}
              >
                <Settings className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">Configuración</span>
                <ChevronDown
                  className={clsx(
                    'h-4 w-4 shrink-0 transition-transform',
                    configOpen && 'rotate-180',
                  )}
                />
              </button>

              {configOpen && (
                <div
                  className={clsx(
                    'ml-3 mt-1 space-y-0.5 border-l pl-2',
                    uiRedesign ? 'border-white/10' : 'border-slate-200',
                  )}
                >
                  {configChildren.map((child) =>
                    child.external && child.href ? (
                      <a
                        key={child.label}
                        href={child.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={clsx(
                          'inline-flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition',
                          uiRedesign
                            ? 'text-[#93a5a8] hover:bg-white/10 hover:text-white'
                            : 'text-clinic-slate hover:bg-slate-100 hover:text-clinic-ink',
                        )}
                      >
                        <child.icon className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        {child.label}
                      </a>
                    ) : (
                      <NavLink
                        key={child.to}
                        to={child.to!}
                        className={({ isActive }) =>
                          clsx(
                            'inline-flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition',
                            uiRedesign
                              ? isActive
                                ? 'bg-[#2b7a78] text-white'
                                : 'text-[#93a5a8] hover:bg-white/10 hover:text-white'
                              : isActive
                                ? 'bg-clinic-deep text-white'
                                : 'text-clinic-slate hover:bg-slate-100 hover:text-clinic-ink',
                          )
                        }
                      >
                        <child.icon className="h-3.5 w-3.5 shrink-0" />
                        {child.label}
                      </NavLink>
                    ),
                  )}
                </div>
              )}
            </div>
          )}
        </nav>

        <div
          className={clsx(
            'border-t p-4',
            uiRedesign ? 'border-white/10' : 'border-slate-100',
          )}
        >
          {hasClinic && !uiRedesign && (
            <div className="mb-3">
              <BcvRatePill className="w-full justify-between" />
            </div>
          )}
          <p
            className={clsx(
              'truncate text-sm font-medium',
              uiRedesign ? 'text-white' : 'text-clinic-ink',
            )}
          >
            {user?.fullName}
          </p>
          <p
            className={clsx(
              'text-xs',
              uiRedesign ? 'text-slate-400' : 'text-clinic-slate',
            )}
          >
            {user?.specialty || user?.role}
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className={clsx(
              'mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium',
              uiRedesign
                ? 'border-white/15 text-[#93a5a8] hover:bg-white/10 hover:text-white'
                : 'border-slate-200 text-clinic-slate hover:bg-slate-50',
            )}
          >
            <LogOut className="h-4 w-4" />
            Salir
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-200/80 bg-white/95 px-3 py-2.5 backdrop-blur md:hidden safe-top">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-clinic-deep text-sm font-bold text-white">
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                'N'
              )}
            </div>
            <span className="truncate font-display text-base font-semibold text-clinic-ink">
              {hasClinic ? clinicTitle : 'NexusDent'}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {hasClinic && <BcvRatePill />}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-2 text-clinic-slate hover:bg-slate-100"
              aria-label="Salir"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-0">
          <Outlet />
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/90 bg-white/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {isPlatformAdmin ? (
          <div className="grid h-16 grid-cols-3 items-end px-1">
            <TabLink to="/platform" label="Plataforma" icon={Building2} />
            <TabLink to="/monitor" label="Monitor" icon={Shield} />
            <TabLink
              to="/more"
              label="Config"
              icon={Settings}
              forceActive={configActive}
            />
          </div>
        ) : canAttention ? (
          <div className="relative grid h-16 grid-cols-5 items-end px-1">
            <TabLink to="/" label="Inicio" icon={Home} end />
            <TabLink to="/patients" label="Pacientes" icon={Users} />
            <div className="relative flex flex-col items-center justify-end pb-1">
              <NavLink
                to="/atencion"
                className={clsx(
                  'absolute -top-7 flex h-14 w-14 items-center justify-center rounded-full shadow-lg ring-4 ring-white transition active:scale-95',
                  attentionActive
                    ? 'bg-accent text-white'
                    : 'bg-clinic-deep text-white',
                )}
                aria-label="Atención"
              >
                <Activity className="h-6 w-6" strokeWidth={2.4} />
              </NavLink>
              <span
                className={clsx(
                  'mt-8 text-[10px] font-semibold',
                  attentionActive ? 'text-accent' : 'text-clinic-slate',
                )}
              >
                Atención
              </span>
            </div>
            <TabLink to="/appointments" label="Citas" icon={CalendarDays} />
            <TabLink
              to="/more"
              label="Config"
              icon={Settings}
              forceActive={configActive}
            />
          </div>
        ) : (
          <div className="grid h-16 grid-cols-4 items-end px-1">
            <TabLink to="/" label="Inicio" icon={Home} end />
            <TabLink to="/patients" label="Pacientes" icon={Users} />
            <TabLink to="/appointments" label="Citas" icon={CalendarDays} />
            <TabLink
              to="/more"
              label="Config"
              icon={Settings}
              forceActive={configActive}
            />
          </div>
        )}
      </nav>
    </div>
  );

  if (!uiRedesign) return shell;

  return (
    <div className="min-h-[100dvh] bg-slate-200/70">
      <div className="mx-auto w-full max-w-[2000px]">{shell}</div>
    </div>
  );
}

function TabLink({
  to,
  label,
  icon: Icon,
  end,
  forceActive,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
  forceActive?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className="flex flex-col items-center gap-0.5 px-1 pb-2 pt-1.5 text-[10px] font-semibold transition"
    >
      {({ isActive }) => {
        const active = forceActive ?? isActive;
        return (
          <>
            <span
              className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-xl transition',
                active
                  ? 'bg-clinic-deep/10 text-clinic-deep'
                  : 'text-clinic-slate',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
            </span>
            <span className={active ? 'text-clinic-deep' : 'text-clinic-slate'}>
              {label}
            </span>
          </>
        );
      }}
    </NavLink>
  );
}
