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
import { User, Lock, X, Folder, FileText } from "lucide-react";
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
  // Support for multi-select share
  items?: { id: number; name: string; type: 'file' | 'folder' }[];
}

type SearchUser = { id: number; username: string };
type Permission = { id: number; userId: number; accessLevel: string; user: { username: string } };

export function ShareDialog({ open, onOpenChange, item, items }: ShareDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [accessLevel, setAccessLevel] = useState("view");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // If items array is provided, use it; otherwise use single item
  const shareItems = items && items.length > 0 ? items : (item ? [item] : []);
  const isMultiSelect = shareItems.length > 1;
  const displayName = isMultiSelect ? `${shareItems.length} items` : (shareItems[0]?.name || "");

  // Fetch all available users
  const { data: allUsers = [], isLoading: usersLoading, error: usersError } = useQuery<SearchUser[]>({
    queryKey: ['/api/users/available'],
    queryFn: async () => {
      const res = await fetch('/api/users/available');
      if (!res.ok) {
        console.error('Failed to fetch users:', res.status, res.statusText);
        return [];
      }
      const data = await res.json();
      console.log('Fetched users:', data);
      return data;
    },
    enabled: open
  });

  // Filter users based on search query
  const filteredUsers = searchQuery.length > 0 
    ? allUsers.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()))
    : allUsers;

  // Existing Permissions (only for single item)
  const { data: permissions = [], refetch: refetchPermissions } = useQuery<Permission[]>({
    queryKey: ['/api/fs/permissions', shareItems[0]?.type, shareItems[0]?.id],
    queryFn: async () => {
      if (!shareItems[0] || isMultiSelect) return [];
      const endpoint = shareItems[0].type === 'file' ? 'files' : 'folders';
      const res = await fetch(`/api/fs/${endpoint}/${shareItems[0].id}/permissions`);
      if (!res.ok) return []; // Should handle 403 (if not owner) gracefully
      return await res.json();
    },
    enabled: shareItems.length === 1 && open
  });

  const shareMutation = useMutation({
    mutationFn: async () => {
      if (shareItems.length === 0 || !selectedUser) return;
      
      if (isMultiSelect) {
        // Multi-share API
        const res = await fetch('/api/fs/share-multiple', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: shareItems.map(i => ({ id: i.id, type: i.type })),
            userId: selectedUser.id,
            accessLevel
          })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Failed to share");
        }
      } else {
        // Single share API
        const res = await fetch('/api/fs/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetId: shareItems[0].id,
            targetType: shareItems[0].type,
            userId: selectedUser.id,
            accessLevel
          })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Failed to share");
        }
      }
    },
    onSuccess: () => {
      toast({ title: isMultiSelect ? `Shared ${shareItems.length} items successfully` : "Shared successfully" });
      setSelectedUser(null);
      setSearchQuery("");
      if (!isMultiSelect) refetchPermissions();
      onOpenChange(false);
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
      // Invalidate file system cache so the shared user no longer sees the item
      queryClient.invalidateQueries({ queryKey: ['/api/fs/list'] });
    },
    onError: () => {
      toast({ title: "Failed to revoke permission", variant: "destructive" });
    }
  });

  if (shareItems.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Share {displayName}</DialogTitle>
          <DialogDescription>
            {isMultiSelect 
              ? `Share ${shareItems.length} selected items with others`
              : `Invite others to access this ${shareItems[0]?.type}`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Multi-select item list */}
          {isMultiSelect && (
            <div className="space-y-2 max-h-32 overflow-y-auto bg-muted/30 rounded-lg p-3">
              {shareItems.map((si, idx) => (
                <div key={`${si.type}-${si.id}`} className="flex items-center gap-2 text-sm">
                  {si.type === 'folder' ? (
                    <Folder className="w-4 h-4 text-blue-500" />
                  ) : (
                    <FileText className="w-4 h-4 text-slate-500" />
                  )}
                  <span className="truncate">{si.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Add People */}
          <div className="space-y-3">
            <Label>Add people</Label>
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-2">
                <Input
                  placeholder="Search by username..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (!e.target.value) setSelectedUser(null);
                  }}
                />
                
                {/* Available Users List */}
                <div className="border rounded-lg max-h-[150px] overflow-y-auto">
                  {usersLoading ? (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                      Loading users...
                    </div>
                  ) : filteredUsers.length > 0 ? (
                    <div className="divide-y">
                      {filteredUsers.map(u => (
                        <div 
                          key={u.id}
                          className={`px-3 py-2 cursor-pointer flex items-center gap-3 transition-colors ${
                            selectedUser?.id === u.id 
                              ? 'bg-primary/10 border-l-2 border-l-primary' 
                              : 'hover:bg-muted/50'
                          }`}
                          onClick={() => {
                            setSelectedUser(u);
                            setSearchQuery(u.username);
                          }}
                        >
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="text-xs font-medium">
                              {u.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium truncate">{u.username}</span>
                          {selectedUser?.id === u.id && (
                            <span className="ml-auto text-xs text-primary font-medium">Selected</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                      {searchQuery ? `No users found matching "${searchQuery}"` : 'No users available'}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col gap-2 shrink-0">
                <Select value={accessLevel} onValueChange={setAccessLevel}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">Can view</SelectItem>
                    <SelectItem value="download">Can download</SelectItem>
                    <SelectItem value="edit">Can edit</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => shareMutation.mutate()} 
                  disabled={!selectedUser || shareMutation.isPending}
                  className="w-[120px]"
                >
                  Share
                </Button>
              </div>
            </div>
          </div>

          {/* Existing Access (only for single item) */}
          {!isMultiSelect && (
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
                        <p className="text-xs text-muted-foreground capitalize">
                          {p.accessLevel === 'view' ? 'Can view' : p.accessLevel === 'download' ? 'Can download' : 'Can edit'}
                        </p>
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

