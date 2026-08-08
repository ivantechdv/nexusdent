import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RequirePermission } from '@/components/RequirePermission';
import { ToastHost } from '@/components/ToastHost';
import { LoginPage } from '@/features/auth/LoginPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { AppointmentsPage } from '@/features/appointments/AppointmentsPage';
import { AttentionPage } from '@/features/patients/AttentionPage';
import { PatientsPage } from '@/features/patients/PatientsPage';
import { PatientFilePage } from '@/features/patients/PatientFilePage';
import { TreatmentsPage } from '@/features/treatments/TreatmentsPage';
import { CategoriesPage } from '@/features/treatments/CategoriesPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { MorePage } from '@/features/more/MorePage';
import { MonitorPage } from '@/features/monitoring/MonitorPage';
import { PlatformPage } from '@/features/platform/PlatformPage';
import { ProfilePage } from '@/features/more/ProfilePage';
import { StaffPage } from '@/features/staff/StaffPage';
import { ClinicSettingsPage } from '@/features/clinic/ClinicSettingsPage';
import { PrintSettingsPage } from '@/features/print/PrintSettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <ToastHost />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route
              path="/platform"
              element={
                <RequirePermission permission="platform.manage">
                  <PlatformPage />
                </RequirePermission>
              }
            />
            <Route
              path="/staff"
              element={
                <RequirePermission permission="staff.manage">
                  <StaffPage />
                </RequirePermission>
              }
            />
            <Route
              path="/clinic"
              element={
                <RequirePermission permission="clinic.settings">
                  <ClinicSettingsPage />
                </RequirePermission>
              }
            />
            <Route
              path="/print-settings"
              element={
                <RequirePermission permission="print.manage">
                  <PrintSettingsPage />
                </RequirePermission>
              }
            />
            <Route
              path="/atencion"
              element={
                <RequirePermission permission="attention.use">
                  <AttentionPage />
                </RequirePermission>
              }
            />
            <Route
              path="/patients"
              element={
                <RequirePermission permission="patients.read">
                  <PatientsPage />
                </RequirePermission>
              }
            />
            <Route
              path="/patients/:id"
              element={
                <RequirePermission permission="patients.read">
                  <PatientFilePage />
                </RequirePermission>
              }
            />
            <Route
              path="/appointments"
              element={
                <RequirePermission permission="appointments.read">
                  <AppointmentsPage />
                </RequirePermission>
              }
            />
            <Route
              path="/treatments"
              element={
                <RequirePermission permission="treatments.read">
                  <TreatmentsPage />
                </RequirePermission>
              }
            />
            <Route
              path="/categories"
              element={
                <RequirePermission permission="catalog.manage">
                  <CategoriesPage />
                </RequirePermission>
              }
            />
            <Route
              path="/monitor"
              element={
                <RequirePermission permission="monitor.view">
                  <MonitorPage />
                </RequirePermission>
              }
            />
            <Route path="/more" element={<MorePage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
