// src/App.tsx

import { useEffect } from "react";
import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import DashboardShell from "./components/DashboardShell";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Events from "./pages/Events";
import EventRegistrants from "./pages/EventRegistrants";
import Announcements from "./pages/Announcements";
import Analytics from "./pages/Analytics";
import HeatmapAnalytics from "./pages/HeatmapAnalytics";
import Appointments from "./pages/Appointments";
import Consultations from "./pages/Consultations";
import ConsultationDetails from "./pages/ConsultationDetails";
import Prescriptions from "./pages/Prescriptions";
import Telemedicine from "./pages/Telemedicine";
import TelemedicineRoom from "./pages/TelemedicineRoom";
import Followups from "./pages/Followups";
import Inventory from "./pages/Inventory";
import Queue from "./pages/Queue";
import Feedback from "./pages/Feedback";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import RegistrationApprovals from "./pages/RegistrationApprovals";
import SmsModule from "./pages/SmsModule";
import Notifications from "./pages/Notifications";
import DeleteHistory from "./pages/DeleteHistory";
import StaffRegister from "./pages/StaffRegister";
import AdminProfile from "./pages/AdminProfile";
import TeamChat from "./pages/TeamChat";
import PatientProfile from "./pages/PatientProfile";
import PatientRegistry from "./pages/PatientRegistry";

import { useAuthStore } from "./store/authStore";
import { ToastProvider } from "./contexts/ToastContext";

const STAFF_PAGE_ROLES = [
  "admin",
  "staff",
  "rhu_admin",
  "super_admin",
  "superadmin",
  "mho",
  "doctor",
  "nurse",
  "midwife",
];

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        color: "#6B7280",
        background: "#F9FAFB",
      }}
    >
      Loading...
    </div>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const hydrated = useAuthStore((state) => state.hydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated) return <LoadingScreen />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function normalizeRole(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function RequireRoles({
  children,
  roles,
}: {
  children: JSX.Element;
  roles: string[];
}) {
  const user = useAuthStore((state) => state.user) as any;
  const role = normalizeRole(user?.role_name ?? user?.role?.name ?? user?.role);
  const capabilities = Array.isArray(user?.capabilities) ? user.capabilities : [];

  if (
    capabilities.includes("full_access") ||
    roles.includes(role) ||
    (!role && user)
  ) {
    return children;
  }

  return <Navigate to="/dashboard" replace />;
}

function GuestOnly({ children }: { children: JSX.Element }) {
  const hydrated = useAuthStore((state) => state.hydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated) return <LoadingScreen />;

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function ProtectedPage({
  children,
  roles,
}: {
  children: JSX.Element;
  roles?: string[];
}) {
  return (
    <RequireAuth>
      <RequireRoles roles={roles ?? STAFF_PAGE_ROLES}>
        <DashboardShell>{children}</DashboardShell>
      </RequireRoles>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Router>
        <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route
          path="/login"
          element={
            <GuestOnly>
              <Login />
            </GuestOnly>
          }
        />

        <Route
          path="/register"
          element={
            <GuestOnly>
              <StaffRegister />
            </GuestOnly>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedPage>
              <Dashboard />
            </ProtectedPage>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedPage>
              <AdminProfile />
            </ProtectedPage>
          }
        />

        <Route
          path="/team-chat"
          element={
            <ProtectedPage>
              <TeamChat />
            </ProtectedPage>
          }
        />

        <Route
          path="/patients"
          element={
            <ProtectedPage>
              <PatientRegistry />
            </ProtectedPage>
          }
        />

        <Route
          path="/patients/:userId"
          element={
            <ProtectedPage>
              <PatientProfile />
            </ProtectedPage>
          }
        />

        <Route
          path="/cms"
          element={
            <ProtectedPage>
              <Announcements />
            </ProtectedPage>
          }
        />

        <Route
          path="/cms/events"
          element={
            <ProtectedPage>
              <Events />
            </ProtectedPage>
          }
        />

        <Route
          path="/cms/events/:id/registrants"
          element={
            <ProtectedPage>
              <EventRegistrants />
            </ProtectedPage>
          }
        />

        <Route
          path="/analytics"
          element={
            <ProtectedPage>
              <Analytics />
            </ProtectedPage>
          }
        />

        <Route
          path="/heatmap-analytics"
          element={
            <ProtectedPage>
              <HeatmapAnalytics />
            </ProtectedPage>
          }
        />

        <Route
          path="/appointments"
          element={
            <ProtectedPage>
              <Appointments />
            </ProtectedPage>
          }
        />

        <Route
          path="/consultations"
          element={
            <ProtectedPage>
              <Consultations />
            </ProtectedPage>
          }
        />

        <Route
          path="/consultations/:id"
          element={
            <ProtectedPage>
              <ConsultationDetails />
            </ProtectedPage>
          }
        />

        <Route
          path="/prescriptions"
          element={
            <ProtectedPage>
              <Prescriptions />
            </ProtectedPage>
          }
        />

        <Route
          path="/telemedicine"
          element={
            <ProtectedPage>
              <Telemedicine />
            </ProtectedPage>
          }
        />

        {/* IMPORTANT: this opens the actual online consultation room with video + STT + SOAP/AI panel */}
        <Route
          path="/telemedicine/room/:sessionId"
          element={
            <ProtectedPage>
              <TelemedicineRoom />
            </ProtectedPage>
          }
        />

        <Route
          path="/follow-up"
          element={
            <ProtectedPage>
              <Followups />
            </ProtectedPage>
          }
        />

        <Route
          path="/inventory"
          element={
            <ProtectedPage>
              <Inventory />
            </ProtectedPage>
          }
        />

        <Route
          path="/queue"
          element={
            <ProtectedPage>
              <Queue />
            </ProtectedPage>
          }
        />

        <Route
          path="/feedback"
          element={
            <ProtectedPage>
              <Feedback />
            </ProtectedPage>
          }
        />

        <Route
          path="/sms"
          element={
            <ProtectedPage>
              <SmsModule />
            </ProtectedPage>
          }
        />

        <Route
          path="/reports"
          element={
            <ProtectedPage>
              <Reports />
            </ProtectedPage>
          }
        />

        <Route
          path="/notifications"
          element={
            <ProtectedPage>
              <Notifications />
            </ProtectedPage>
          }
        />

        <Route
          path="/users"
          element={
            <ProtectedPage>
              <Users />
            </ProtectedPage>
          }
        />

        <Route
          path="/registrations"
          element={
            <ProtectedPage>
              <RegistrationApprovals />
            </ProtectedPage>
          }
        />

        <Route
          path="/cms/users"
          element={
            <ProtectedPage>
              <Users />
            </ProtectedPage>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedPage>
              <Settings />
            </ProtectedPage>
          }
        />

        <Route
          path="/delete-history"
          element={
            <ProtectedPage>
              <DeleteHistory />
            </ProtectedPage>
          }
        />

        <Route
          path="/cms/delete-history"
          element={
            <ProtectedPage>
              <DeleteHistory />
            </ProtectedPage>
          }
        />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}
