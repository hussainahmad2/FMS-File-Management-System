import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import UsersPage from "@/pages/admin-users";
import AuditPage from "@/pages/admin-audit";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  return <Component />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (!user) {
    setLocation("/login");
    return null;
  }

  if (user.role !== "admin" && user.role !== "superadmin") {
    setLocation("/");
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={() => <ProtectedRoute component={DashboardPage} />} />
      <Route path="/folder/:id" component={() => <ProtectedRoute component={DashboardPage} />} />
      <Route path="/admin/users" component={() => <AdminRoute component={UsersPage} />} />
      <Route path="/admin/audit" component={() => <AdminRoute component={AuditPage} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
