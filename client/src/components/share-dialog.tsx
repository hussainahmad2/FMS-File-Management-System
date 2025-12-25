import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { User, Lock, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: { id: number; name: string; type: 'file' | 'folder' } | null;
}

type SearchUser = { id: number; username: string };
type Permission = { id: number; userId: number; accessLevel: string; user: { username: string } };

export function ShareDialog({ open, onOpenChange, item }: ShareDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [accessLevel, setAccessLevel] = useState("view");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Search Users
  const { data: users = [] } = useQuery<SearchUser[]>({
    queryKey: ['/api/users/search', searchQuery],
    queryFn: async () => {
      if (searchQuery.length < 2) return [];
      const res = await fetch(`/api/users/search?q=${searchQuery}`);
      if (!res.ok) return [];
      return await res.json();
    },
    enabled: searchQuery.length >= 2
  });

  // Existing Permissions
  const { data: permissions = [], refetch: refetchPermissions } = useQuery<Permission[]>({
    queryKey: ['/api/fs/permissions', item?.type, item?.id],
    queryFn: async () => {
      if (!item) return [];
      const endpoint = item.type === 'file' ? 'files' : 'folders';
      const res = await fetch(`/api/fs/${endpoint}/${item.id}/permissions`);
      if (!res.ok) return []; // Should handle 403 (if not owner) gracefully
      return await res.json();
    },
    enabled: !!item && open
  });

  const shareMutation = useMutation({
    mutationFn: async () => {
      if (!item || !selectedUser) return;
      const res = await fetch('/api/fs/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: item.id,
          targetType: item.type,
          userId: selectedUser.id,
          accessLevel
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to share");
      }
    },
    onSuccess: () => {
      toast({ title: "Shared successfully" });
      setSelectedUser(null);
      setSearchQuery("");
      refetchPermissions();
    },
    onError: (e) => {
      toast({ title: e.message, variant: "destructive" });
    }
  });

  const revokeMutation = useMutation({
    mutationFn: async (permissionId: number) => {
      const res = await fetch(`/api/fs/share/${permissionId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error("Failed to revoke");
    },
    onSuccess: () => {
      toast({ title: "Permission revoked" });
      refetchPermissions();
    },
    onError: () => {
      toast({ title: "Failed to revoke permission", variant: "destructive" });
    }
  });

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Share {item.name}</DialogTitle>
          <DialogDescription>
            Invite others to access this {item.type}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Add People */}
          <div className="space-y-4">
            <Label>Add people</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="Search by username..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (!e.target.value) setSelectedUser(null);
                  }}
                />
                {users.length > 0 && !selectedUser && (
                  <div className="absolute top-full left-0 right-0 bg-popover border rounded-md shadow-md mt-1 z-50 max-h-[200px] overflow-auto">
                    {users.map(u => (
                      <div 
                        key={u.id}
                        className="p-2 hover:bg-accent cursor-pointer flex items-center gap-2"
                        onClick={() => {
                          setSelectedUser(u);
                          setSearchQuery(u.username);
                        }}
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarFallback>{u.username[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span>{u.username}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Select value={accessLevel} onValueChange={setAccessLevel}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">Can view</SelectItem>
                  <SelectItem value="edit">Can edit</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                onClick={() => shareMutation.mutate()} 
                disabled={!selectedUser || shareMutation.isPending}
              >
                Share
              </Button>
            </div>
          </div>

          {/* Existing Access */}
          <div className="space-y-4">
            <Label>People with access</Label>
            <div className="space-y-3">
              {/* Owner (Implicit) - We don't fetch owner but usually it's current user if they can see this dialog */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">You</p>
                    <p className="text-xs text-muted-foreground">Owner</p>
                  </div>
                </div>
              </div>

              {permissions.map(p => (
                <div key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{p.user.username[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{p.user.username}</p>
                      <p className="text-xs text-muted-foreground capitalize">{p.accessLevel}</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => revokeMutation.mutate(p.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              
              {permissions.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No permissions granted yet.</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

