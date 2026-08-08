import { useEffect, useState } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { meApi } from '@/services/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { can, type Permission } from '@/lib/permissions';

interface Props {
  permission?: Permission;
}

export function ProtectedRoute({ permission }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const logout = useAuthStore((s) => s.logout);
  const [ready, setReady] = useState(!token);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!token) {
        setReady(true);
        return;
      }
      try {
        const me = await meApi();
        if (cancelled) return;
        setSession(token, {
          id: me.id,
          email: me.email,
          fullName: me.fullName,
          role: me.role,
          phone: me.phone ?? null,
          specialty: me.specialty ?? null,
          clinicId: me.clinicId ?? null,
          clinicName: me.clinicName ?? null,
          clinicSlug: me.clinicSlug ?? null,
          permissions: me.permissions,
          hasCustomPermissions: me.hasCustomPermissions,
        });
        setReady(true);
      } catch {
        if (cancelled) return;
        logout();
        qc.clear();
        navigate('/login', { replace: true });
        setReady(true);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [token, setSession, logout, navigate, qc]);

  if (!token) return <Navigate to="/login" replace />;
  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-sm text-clinic-slate">
        Validando sesión…
      </div>
    );
  }
  const overrides = (user?.permissions ?? null) as Permission[] | null;
  if (permission && !can(user?.role, permission, overrides)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
