import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { can, type Permission } from '@/lib/permissions';

export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: React.ReactNode;
}) {
  const role = useAuthStore((s) => s.user?.role);
  const overrides = useAuthStore((s) => s.user?.permissions) as
    | Permission[]
    | undefined;
  if (!can(role, permission, overrides ?? null)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
