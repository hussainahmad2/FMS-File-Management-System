import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Folder } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Folder as FolderType } from "@shared/schema";

interface MoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: { id: number; name: string; type: 'file' | 'folder' } | null;
}

export function MoveDialog({ open, onOpenChange, item }: MoveDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all folders for selection (flat list for MVP, ideally tree)
  const { data: folders } = useQuery<FolderType[]>({
    queryKey: ['/api/fs/folders/all'],
    queryFn: async () => {
        // We'll reuse the list endpoint but maybe we need a param to get ALL or just browse
        // For simplicity, let's just fetch root folders and allow navigation if we had more time.
        // Or better: Let's fetch the current directory's siblings.
        // Actually, to implement "Move To", we usually need a folder picker.
        // Let's implement a simple browser here.
        return []; 
    },
    enabled: false // Disable for now as we need a proper endpoint for "all folders" or tree traversal
  });
  
  // Alternative: Just simple recursive fetcher logic inside the component
  const [currentBrowseId, setCurrentBrowseId] = useState<number | null>(null);
  
  const { data: currentFolders } = useQuery({
      queryKey: ['/api/fs/list', currentBrowseId],
      queryFn: async () => {
          const res = await fetch(`/api/fs/list${currentBrowseId ? `?folderId=${currentBrowseId}` : ''}`);
          if (!res.ok) throw new Error("Failed");
          return await res.json();
      },
      enabled: open
  });

  const moveMutation = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const endpoint = item.type === 'file' 
        ? `/api/fs/files/${item.id}/move` 
        : `/api/fs/folders/${item.id}/move`;
        
      const body = item.type === 'file' 
        ? { folderId: selectedFolderId }
        : { parentId: selectedFolderId };
      
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) throw new Error("Failed to move");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fs/list'] });
      toast({ title: "Moved successfully" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to move", variant: "destructive" });
    }
  });

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Move {item.name}</DialogTitle>
          <DialogDescription>
            Select a destination folder
          </DialogDescription>
        </DialogHeader>
        
        <div className="border rounded-md h-[300px] flex flex-col">
            <div className="p-2 border-b bg-muted/50 flex items-center gap-2">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setCurrentBrowseId(null)}
                    disabled={currentBrowseId === null}
                >
                    Root
                </Button>
                {currentBrowseId && <span className="text-muted-foreground">/ ...</span>}
            </div>
            <ScrollArea className="flex-1 p-2">
                <div className="space-y-1">
                    <div 
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent ${selectedFolderId === null && currentBrowseId === null ? 'bg-accent' : ''}`}
                        onClick={() => setSelectedFolderId(null)}
                    >
                        <Folder className="w-4 h-4 text-blue-500" />
                        <span className="text-sm">My Files (Root)</span>
                    </div>
                    {currentFolders?.folders?.map((folder: any) => (
                        // Don't show the folder itself if we are moving it
                        folder.id !== item.id && (
                        <div 
                            key={folder.id}
                            className={`flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-accent ${selectedFolderId === folder.id ? 'bg-accent' : ''}`}
                            onClick={() => setSelectedFolderId(folder.id)}
                            onDoubleClick={() => setCurrentBrowseId(folder.id)}
                        >
                            <div className="flex items-center gap-2">
                                <Folder className="w-4 h-4 text-blue-500 fill-blue-500/20" />
                                <span className="text-sm">{folder.name}</span>
                            </div>
                        </div>
                        )
                    ))}
                </div>
            </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => moveMutation.mutate()} disabled={moveMutation.isPending}>
            Move Here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

