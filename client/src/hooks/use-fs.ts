import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { CreateFolderRequest, Folder, File } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

type FileSystemResponse = {
  folders: Folder[];
  files: File[];
  breadcrumbs: { id: number; name: string }[];
};

export function useFileSystem(folderId?: string) {
  const queryKey = [api.fs.list.path, folderId || "root"];
  
  return useQuery<FileSystemResponse>({
    queryKey,
    queryFn: async () => {
      const url = folderId 
        ? `${api.fs.list.path}?folderId=${folderId}` 
        : api.fs.list.path;
      
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch file system");
      return api.fs.list.responses[200].parse(await res.json());
    },
  });
}

export function useRecentFiles() {
  return useQuery({
    queryKey: [api.fs.recent.path],
    queryFn: async () => {
      const res = await fetch(api.fs.recent.path);
      if (!res.ok) throw new Error("Failed to fetch recent files");
      return api.fs.recent.responses[200].parse(await res.json());
    },
  });
}

export function useStarredFiles() {
  return useQuery({
    queryKey: [api.fs.starred.path],
    queryFn: async () => {
      const res = await fetch(api.fs.starred.path);
      if (!res.ok) throw new Error("Failed to fetch starred files");
      return api.fs.starred.responses[200].parse(await res.json());
    },
  });
}

export function useTrashFiles() {
  return useQuery({
    queryKey: [api.fs.trash.path],
    queryFn: async () => {
      const res = await fetch(api.fs.trash.path);
      if (!res.ok) throw new Error("Failed to fetch trash files");
      return api.fs.trash.responses[200].parse(await res.json());
    },
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateFolderRequest) => {
      const res = await fetch(api.fs.createFolder.path, {
        method: api.fs.createFolder.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = await res.json();
          throw new Error(error.message);
        }
        throw new Error("Failed to create folder");
      }
      return api.fs.createFolder.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      // Invalidate current folder view
      const currentFolderId = variables.parentId ? String(variables.parentId) : "root";
      queryClient.invalidateQueries({ queryKey: [api.fs.list.path, currentFolderId] });
      toast({ title: "Folder created", description: variables.name });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useToggleStar() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (fileId: number) => {
      const url = buildUrl(api.fs.toggleStar.path, { fileId });
      const res = await fetch(url, {
        method: api.fs.toggleStar.method,
      });
      if (!res.ok) throw new Error("Failed to toggle star");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.fs.starred.path] });
      queryClient.invalidateQueries({ queryKey: [api.fs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.fs.recent.path] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (fileId: number) => {
      const url = buildUrl(api.fs.delete.path, { fileId });
      const res = await fetch(url, {
        method: api.fs.delete.method,
      });
      if (!res.ok) throw new Error("Failed to delete file");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.fs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.fs.recent.path] });
      queryClient.invalidateQueries({ queryKey: [api.fs.starred.path] });
      queryClient.invalidateQueries({ queryKey: [api.fs.trash.path] });
      toast({ title: "File moved to trash" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (folderId: number) => {
      const res = await fetch(`/api/fs/folders/${folderId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete folder");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.fs.list.path] });
      toast({ title: "Folder deleted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useRestoreFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (fileId: number) => {
      const res = await fetch(`/api/fs/${fileId}/restore`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to restore file");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.fs.trash.path] });
      queryClient.invalidateQueries({ queryKey: [api.fs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.fs.recent.path] });
      toast({ title: "File restored" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function usePermanentDeleteFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (fileId: number) => {
      const res = await fetch(`/api/fs/${fileId}/permanent`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to permanently delete file");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.fs.trash.path] });
      toast({ title: "File permanently deleted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
