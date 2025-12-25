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
import { useQueryClient, useMutation } from "@tanstack/react-query";

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: { id: number; name: string; type: 'file' | 'folder' } | null;
}

export function RenameDialog({ open, onOpenChange, item }: RenameDialogProps) {
  const [name, setName] = useState(item?.name || "");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const renameMutation = useMutation({
    mutationFn: async (newName: string) => {
      if (!item) return;
      const endpoint = item.type === 'file' 
        ? `/api/fs/files/${item.id}/rename` 
        : `/api/fs/folders/${item.id}/rename`;
      
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      });
      
      if (!res.ok) throw new Error("Failed to rename");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fs/list'] });
      toast({ title: "Renamed successfully" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to rename", variant: "destructive" });
    }
  });

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Rename {item.type === 'file' ? 'File' : 'Folder'}</DialogTitle>
          <DialogDescription>
            Enter a new name for {item.name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              defaultValue={item.name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => renameMutation.mutate(name)} disabled={renameMutation.isPending}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

