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
