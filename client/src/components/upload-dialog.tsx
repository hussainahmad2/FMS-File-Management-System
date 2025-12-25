import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { File, Folder, Archive, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

interface UploadDialogProps {
  folderId?: number | null;
  trigger?: React.ReactNode;
}

export function UploadDialog({ folderId, trigger }: UploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'file' | 'folder' | 'archive') => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    
    // Pass folderId
    if (folderId) {
      formData.append("folderId", folderId.toString());
    }

    if (type === 'file') {
      // Bulk file upload
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
    } else if (type === 'folder') {
      // Folder upload (files with paths)
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        formData.append("files", file);
        // webkitRelativePath contains the path including the folder name
        formData.append("paths", file.webkitRelativePath);
      }
      formData.append("isFolderUpload", "true");
    } else if (type === 'archive') {
      // Archive upload (single file usually)
      formData.append("archive", files[0]);
    }

    try {
      let endpoint = "/api/fs/upload";
      if (type === 'folder') endpoint = "/api/fs/upload-folder";
      if (type === 'archive') endpoint = "/api/fs/upload-archive";

      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      toast({ title: "Upload successful" });
      queryClient.invalidateQueries({ queryKey: [api.fs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.fs.recent.path] });
      setOpen(false);
    } catch (error) {
      toast({
        title: "Upload error",
        description: "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      // Reset inputs
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
      if (archiveInputRef.current) archiveInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2 shadow-lg shadow-primary/25">
            <Upload className="w-4 h-4" />
            Upload
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-4 py-4">
          {/* File Upload */}
          <div 
            className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-border rounded-xl hover:border-primary/50 hover:bg-muted/50 cursor-pointer transition-colors gap-2 text-center"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center">
              <File className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">Files</span>
            <input 
              type="file" 
              multiple 
              className="hidden" 
              ref={fileInputRef} 
              onChange={(e) => handleUpload(e, 'file')}
            />
          </div>

          {/* Folder Upload */}
          <div 
            className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-border rounded-xl hover:border-primary/50 hover:bg-muted/50 cursor-pointer transition-colors gap-2 text-center"
            onClick={() => folderInputRef.current?.click()}
          >
            <div className="w-10 h-10 rounded-full bg-yellow-50 text-yellow-500 flex items-center justify-center">
              <Folder className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">Folder</span>
            <input 
              type="file" 
              // @ts-ignore
              webkitdirectory="" 
              directory="" 
              className="hidden" 
              ref={folderInputRef} 
              onChange={(e) => handleUpload(e, 'folder')}
            />
          </div>

          {/* Archive Upload */}
          <div 
            className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-border rounded-xl hover:border-primary/50 hover:bg-muted/50 cursor-pointer transition-colors gap-2 text-center"
            onClick={() => archiveInputRef.current?.click()}
          >
            <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center">
              <Archive className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">Archive</span>
            <input 
              type="file" 
              accept=".zip,.rar,.7z,.tar" 
              className="hidden" 
              ref={archiveInputRef} 
              onChange={(e) => handleUpload(e, 'archive')}
            />
          </div>
        </div>
        {uploading && (
          <div className="text-center text-sm text-muted-foreground animate-pulse">
            Uploading... please wait.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

