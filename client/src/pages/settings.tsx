import { LayoutShell } from "@/components/layout-shell";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, User, Shield, Bell, Moon, Sun } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserSettings } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: settings, isLoading } = useQuery<UserSettings>({
    queryKey: ['/api/user/settings'],
    queryFn: async () => {
      const res = await fetch('/api/user/settings');
      if (!res.ok) throw new Error("Failed to fetch settings");
      return await res.json();
    }
  });

  const updateSettings = useMutation({
    mutationFn: async (newSettings: Partial<UserSettings>) => {
      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/settings'] });
      toast({ title: "Settings updated" });
    },
    onError: () => {
      toast({ title: "Failed to update settings", variant: "destructive" });
    }
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match");
      }
      const res = await fetch('/api/user/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update password");
      }
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Password updated successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    }
  });

  return (
    <LayoutShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground">Manage your account preferences</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Profile Section */}
          <div className="bg-card rounded-2xl border border-border p-6 shadow-sm h-fit">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-muted-foreground" />
              Profile Information
            </h2>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={user?.username} disabled />
                <p className="text-xs text-muted-foreground">Username cannot be changed</p>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="role">Role</Label>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium capitalize border ${
                    user?.role === 'admin' || user?.role === 'superadmin'
                      ? 'bg-purple-50 text-purple-700 border-purple-200' 
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}>
                    {user?.role === 'admin' && <Shield className="w-3 h-3" />}
                    {user?.role}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Preferences Section */}
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-muted-foreground" />
                Preferences
              </h2>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <Moon className="w-4 h-4" />
                      Dark Mode
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Enable dark mode for the interface
                    </p>
                  </div>
                  <Switch 
                    checked={settings?.theme === 'dark'}
                    onCheckedChange={(checked) => updateSettings.mutate({ theme: checked ? 'dark' : 'light' })}
                    disabled={isLoading}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <Bell className="w-4 h-4" />
                      Notifications
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications about file activities
                    </p>
                  </div>
                  <Switch 
                    checked={settings?.notificationsEnabled ?? true}
                    onCheckedChange={(checked) => updateSettings.mutate({ notificationsEnabled: checked })}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

            {/* Security Section */}
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-4">Security</h2>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input 
                    id="current-password" 
                    type="password" 
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input 
                    id="new-password" 
                    type="password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input 
                    id="confirm-password" 
                    type="password" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <div className="flex justify-end mt-4">
                  <Button 
                    onClick={() => updatePasswordMutation.mutate()} 
                    disabled={updatePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
                  >
                    {updatePasswordMutation.isPending ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </LayoutShell>
  );
}

