import { useState, useRef, DragEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { File, Folder, Archive, Upload, X, FolderOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

interface UploadDialogProps {
  folderId?: number | null;
  trigger?: React.ReactNode;
}

type UploadType = 'file' | 'folder' | 'archive' | null;

interface FileWithPath {
  file: globalThis.File;
  path: string;
}

interface SelectionInfo {
  type: UploadType;
  filesWithPaths: FileWithPath[];
  folderName?: string;
  totalFiles: number;
  subFolderCount: number;
  totalSize: number;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Recursively read all files from a directory handle
async function readDirectoryRecursively(
  dirHandle: any,
  basePath: string = ''
): Promise<FileWithPath[]> {
  const files: FileWithPath[] = [];
  
  // Use for-await-of with the async iterator
  for await (const entry of dirHandle.values()) {
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      files.push({ file, path: entryPath });
    } else if (entry.kind === 'directory') {
      const subFiles = await readDirectoryRecursively(entry, entryPath);
      files.push(...subFiles);
    }
  }
  
  return files;
}

// Read files from drag & drop DataTransfer
async function readDroppedItems(items: DataTransferItemList): Promise<{ filesWithPaths: FileWithPath[], folderName: string }> {
  const files: FileWithPath[] = [];
  let folderName = '';
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Try to get as FileSystemHandle (modern browsers)
    if ('getAsFileSystemHandle' in item) {
      const handle = await (item as any).getAsFileSystemHandle();
      if (handle) {
        if (handle.kind === 'directory') {
          folderName = handle.name;
          const dirFiles = await readDirectoryRecursively(handle, handle.name);
          files.push(...dirFiles);
        } else if (handle.kind === 'file') {
          const file = await handle.getFile();
          files.push({ file, path: file.name });
        }
        continue;
      }
    }
    
    // Fallback: webkitGetAsEntry
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      if (entry.isDirectory) {
        folderName = entry.name;
        const dirFiles = await readEntryRecursively(entry as FileSystemDirectoryEntry, entry.name);
        files.push(...dirFiles);
      } else if (entry.isFile) {
        const file = await getFileFromEntry(entry as FileSystemFileEntry);
        files.push({ file, path: file.name });
      }
    }
  }
  
  return { filesWithPaths: files, folderName };
}

// Read FileSystemEntry recursively (for webkitGetAsEntry fallback)
async function readEntryRecursively(
  dirEntry: FileSystemDirectoryEntry,
  basePath: string
): Promise<FileWithPath[]> {
  return new Promise((resolve) => {
    const reader = dirEntry.createReader();
    const files: FileWithPath[] = [];
    
    const readEntries = () => {
      reader.readEntries(async (entries) => {
        if (entries.length === 0) {
          resolve(files);
          return;
        }
        
        for (const entry of entries) {
          const entryPath = `${basePath}/${entry.name}`;
          if (entry.isFile) {
            const file = await getFileFromEntry(entry as FileSystemFileEntry);
            files.push({ file, path: entryPath });
          } else if (entry.isDirectory) {
            const subFiles = await readEntryRecursively(entry as FileSystemDirectoryEntry, entryPath);
            files.push(...subFiles);
          }
        }
        
        readEntries(); // Continue reading (entries come in batches)
      });
    };
    
    readEntries();
  });
}

function getFileFromEntry(entry: FileSystemFileEntry): Promise<globalThis.File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

export function UploadDialog({ folderId, trigger }: UploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const resetSelection = () => {
    setSelection(null);
    setUploadProgress(0);
    if (archiveInputRef.current) archiveInputRef.current.value = "";
  };

  // Analyze files and create selection info
  const createSelectionInfo = (filesWithPaths: FileWithPath[], type: UploadType, folderName?: string): SelectionInfo => {
    const subFolders = new Set<string>();
    let totalSize = 0;

    for (const { file, path } of filesWithPaths) {
      totalSize += file.size;
      
      if (type === 'folder') {
        const parts = path.split('/');
        // Count unique subfolders (exclude root folder and file)
        if (parts.length > 2) {
          for (let j = 1; j < parts.length - 1; j++) {
            subFolders.add(parts.slice(0, j + 1).join('/'));
          }
        }
      }
    }

    return {
      type,
      filesWithPaths,
      folderName: folderName || (type === 'folder' ? filesWithPaths[0]?.path.split('/')[0] : undefined),
      totalFiles: filesWithPaths.length,
      subFolderCount: subFolders.size,
      totalSize
    };
  };

  // Use File System Access API for file picking (no browser confirmation dialog)
  const handleFilePick = async () => {
    try {
      if ('showOpenFilePicker' in window) {
        const handles = await (window as any).showOpenFilePicker({ multiple: true });
        const filesWithPaths: FileWithPath[] = [];
        
        for (const handle of handles) {
          const file = await handle.getFile();
          filesWithPaths.push({ file, path: file.name });
        }
        
        if (filesWithPaths.length > 0) {
          setSelection(createSelectionInfo(filesWithPaths, 'file'));
        }
      } else {
        // Fallback for browsers without File System Access API
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = (e) => {
          const files = (e.target as HTMLInputElement).files;
          if (files && files.length > 0) {
            const filesWithPaths: FileWithPath[] = Array.from(files).map(f => ({ file: f, path: f.name }));
            setSelection(createSelectionInfo(filesWithPaths, 'file'));
          }
        };
        input.click();
      }
    } catch (e) {
      // User cancelled or error
      console.log('File pick cancelled');
    }
  };

  // Use File System Access API for folder picking (no browser confirmation dialog)
  const handleFolderPick = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        const filesWithPaths = await readDirectoryRecursively(dirHandle, dirHandle.name);
        
        if (filesWithPaths.length > 0) {
          setSelection(createSelectionInfo(filesWithPaths, 'folder', dirHandle.name));
        }
      } else {
        toast({
          title: "Folder upload",
          description: "Please drag and drop a folder, or use a Chromium-based browser for folder selection.",
          variant: "destructive",
        });
      }
    } catch (e) {
      console.log('Folder pick cancelled');
    }
  };

  // Handle archive file selection (still uses input for accept filter)
  const handleArchiveSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const filesWithPaths: FileWithPath[] = [{ file: files[0], path: files[0].name }];
    setSelection(createSelectionInfo(filesWithPaths, 'archive'));
  };

  // Handle drag & drop
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (uploading) return;
    
    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;
    
    try {
      const { filesWithPaths, folderName } = await readDroppedItems(items);
      
      if (filesWithPaths.length > 0) {
        // Determine type based on content
        const hasFolder = folderName !== '';
        const type: UploadType = hasFolder ? 'folder' : 'file';
        setSelection(createSelectionInfo(filesWithPaths, type, folderName));
      }
    } catch (error) {
      console.error('Drop error:', error);
      toast({
        title: "Error",
        description: "Failed to read dropped files",
        variant: "destructive",
      });
    }
  };

  // Start the upload
  const startUpload = async () => {
    if (!selection) return;

    setUploading(true);
    setUploadProgress(0);
    
    const formData = new FormData();
    
    if (folderId) {
      formData.append("folderId", folderId.toString());
    }

    const { type, filesWithPaths } = selection;

    if (type === 'file') {
      for (const { file } of filesWithPaths) {
        formData.append("files", file);
      }
    } else if (type === 'folder') {
      for (const { file, path } of filesWithPaths) {
        formData.append("files", file);
        formData.append("paths", path);
      }
      formData.append("isFolderUpload", "true");
    } else if (type === 'archive') {
      formData.append("archive", filesWithPaths[0].file);
    }

    try {
      let endpoint = "/api/fs/upload";
      if (type === 'folder') endpoint = "/api/fs/upload-folder";
      if (type === 'archive') endpoint = "/api/fs/upload-archive";

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error('Upload failed'));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.open('POST', endpoint);
        xhr.send(formData);
      });

      toast({ title: "Upload successful" });
      queryClient.invalidateQueries({ queryKey: [api.fs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.fs.recent.path] });
      setOpen(false);
      resetSelection();
    } catch (error) {
      toast({
        title: "Upload error",
        description: "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) {
        resetSelection();
        setUploading(false);
        setIsDragging(false);
      }
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2 shadow-lg shadow-primary/25">
            <Upload className="w-4 h-4" />
            Upload
          </Button>
        )}
      </DialogTrigger>
      <DialogContent 
        className="sm:max-w-md"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <DialogHeader>
          <DialogTitle>Upload</DialogTitle>
        </DialogHeader>
        
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm rounded-lg border-2 border-dashed border-primary">
            <div className="text-center">
              <Upload className="w-12 h-12 mx-auto text-primary mb-2" />
              <p className="text-lg font-medium">Drop files or folder here</p>
            </div>
          </div>
        )}
        
        {/* Upload Type Options */}
        <div className="grid grid-cols-3 gap-4 py-4">
          {/* File Upload */}
          <div 
            className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all gap-2 text-center ${
              selection?.type === 'file' 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                : 'border-border hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
            } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
            onClick={() => !uploading && handleFilePick()}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              selection?.type === 'file' ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-600'
            }`}>
              <File className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">Files</span>
          </div>

          {/* Folder Upload */}
          <div 
            className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all gap-2 text-center ${
              selection?.type === 'folder' 
                ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' 
                : 'border-border hover:border-yellow-400 hover:bg-yellow-50/50 dark:hover:bg-yellow-900/10'
            } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
            onClick={() => !uploading && handleFolderPick()}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              selection?.type === 'folder' ? 'bg-yellow-500 text-white' : 'bg-yellow-100 text-yellow-600'
            }`}>
              <Folder className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">Folder</span>
          </div>

          {/* Archive Upload */}
          <div 
            className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all gap-2 text-center ${
              selection?.type === 'archive' 
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' 
                : 'border-border hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-900/10'
            } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
            onClick={() => !uploading && archiveInputRef.current?.click()}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              selection?.type === 'archive' ? 'bg-purple-500 text-white' : 'bg-purple-100 text-purple-600'
            }`}>
              <Archive className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">Archive</span>
            <input 
              type="file" 
              accept=".zip,.rar,.7z,.tar" 
              className="hidden" 
              ref={archiveInputRef} 
              onChange={handleArchiveSelect}
            />
          </div>
        </div>

        {/* Hint text */}
        {!selection && !uploading && (
          <p className="text-xs text-center text-muted-foreground">
            Click to select or drag & drop files/folders
          </p>
        )}

        {/* Selection Summary */}
        {selection && !uploading && (
          <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  selection.type === 'folder' ? 'bg-yellow-100 text-yellow-600' :
                  selection.type === 'file' ? 'bg-blue-100 text-blue-600' : 
                  'bg-purple-100 text-purple-600'
                }`}>
                  {selection.type === 'folder' ? <FolderOpen className="w-5 h-5" /> :
                   selection.type === 'file' ? <File className="w-5 h-5" /> :
                   <Archive className="w-5 h-5" />}
                </div>
                <div>
                  {selection.type === 'folder' ? (
                    <>
                      <p className="font-semibold">{selection.folderName}</p>
                      <p className="text-sm text-muted-foreground">
                        {selection.totalFiles} files • {selection.subFolderCount} subfolders
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">
                        {selection.totalFiles} {selection.totalFiles === 1 ? 'file' : 'files'} selected
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatSize(selection.totalSize)}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={resetSelection} className="h-8 w-8">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {selection.type === 'folder' && (
              <p className="text-xs text-muted-foreground border-t pt-2">
                Total size: {formatSize(selection.totalSize)}
              </p>
            )}

            <Button onClick={startUpload} className="w-full gap-2">
              <Upload className="w-4 h-4" />
              Start Upload
            </Button>
          </div>
        )}

        {/* Upload Progress */}
        {uploading && (
          <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Upload className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <p className="font-medium">
                  {selection?.type === 'folder' 
                    ? `Uploading "${selection.folderName}"...` 
                    : `Uploading ${selection?.totalFiles || 0} files...`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {(selection?.totalFiles || 0) > 3 
                    ? "Your patience is valuable!" 
                    : "Please wait..."}
                </p>
              </div>
            </div>
            
            <div className="space-y-1">
              <Progress value={uploadProgress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{uploadProgress}%</span>
                <span>{formatSize(selection?.totalSize || 0)}</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
