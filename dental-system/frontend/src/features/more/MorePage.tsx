import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  ChevronRight,
  FolderTree,
  LogOut,
  MessageCircle,
  Printer,
  Shield,
  Stethoscope,
  UserRound,
  Users,
} from 'lucide-react';
import { SUPPORT_WHATSAPP_URL } from '@/config/support';
import { useAuthStore } from '@/stores/auth.store';
import { can, type Permission } from '@/lib/permissions';
import { toast } from '@/stores/toast.store';
import { useQueryClient } from '@tanstack/react-query';

export function MorePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, logout } = useAuthStore();
  const role = user?.role;
  const perms = (user?.permissions ?? null) as Permission[] | null;

  function handleLogout() {
    logout();
    qc.clear();
    toast('Sesión cerrada', 'info');
    navigate('/login');
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-3 sm:p-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-clinic-ink sm:text-2xl">
          Configuración
        </h1>
        <p className="text-sm text-clinic-slate">Opciones de clínica y cuenta</p>
      </div>

      <div className="panel overflow-hidden">
        {can(role, 'platform.manage', perms) && (
          <MenuLink
            to="/platform"
            icon={Shield}
            title="Plataforma"
            subtitle="Clínicas y cuentas"
          />
        )}
        {can(role, 'monitor.view', perms) && (
          <MenuLink
            to="/monitor"
            icon={Shield}
            title="Monitoreo"
            subtitle="Errores y latencia de la app"
          />
        )}
        {can(role, 'clinic.settings', perms) && Boolean(user?.clinicId) && (
          <MenuLink
            to="/clinic"
            icon={Building2}
            title="Mi clínica"
            subtitle="Logo, contacto y tema"
          />
        )}
        {can(role, 'print.manage', perms) && Boolean(user?.clinicId) && (
          <MenuLink
            to="/print-settings"
            icon={Printer}
            title="Impresión"
            subtitle="Formatos, encabezados y pies"
          />
        )}
        {can(role, 'staff.manage', perms) && Boolean(user?.clinicId) && (
          <MenuLink
            to="/staff"
            icon={Users}
            title="Usuarios"
            subtitle={`Personal de ${user?.clinicName ?? 'esta clínica'}`}
          />
        )}
        {can(role, 'catalog.manage', perms) && (
          <MenuLink
            to="/categories"
            icon={FolderTree}
            title="Categorías"
            subtitle="Grupos de prestaciones"
          />
        )}
        {can(role, 'treatments.read', perms) && (
          <MenuLink
            to="/treatments"
            icon={Stethoscope}
            title="Catálogo"
            subtitle="Prestaciones y tarifas"
          />
        )}
        <MenuLink
          to="/profile"
          icon={UserRound}
          title="Mi perfil"
          subtitle={user?.fullName ?? 'Cuenta'}
        />
        <a
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3.5 text-left transition active:bg-slate-50 hover:bg-slate-50/80"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
            <MessageCircle className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-clinic-ink">
              WhatsApp soporte
            </span>
            <span className="block text-xs text-clinic-slate">
              Contactar al desarrollador
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-clinic-slate" />
        </a>
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className="panel flex w-full items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold text-red-600 active:bg-red-50 md:hidden"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </button>
    </div>
  );
}

function MenuLink({
  to,
  icon: Icon,
  title,
  subtitle,
}: {
  to: string;
  icon: typeof FolderTree;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 border-t border-slate-100 px-4 py-3.5 first:border-t-0 transition active:bg-slate-50 hover:bg-slate-50/80"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-clinic-deep/10 text-clinic-deep">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-clinic-ink">{title}</span>
        <span className="block truncate text-xs text-clinic-slate">{subtitle}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-clinic-slate" />
    </Link>
  );
}
