import { Link, useRoute } from "wouter";
import { useFileSystem, useDeleteFile, usePermanentDeleteFile, useDeleteFolder } from "@/hooks/use-fs";
import { LayoutShell } from "@/components/layout-shell";
import { CreateFolderDialog } from "@/components/create-folder-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ViewToggle } from "@/components/view-toggle";
import { useViewMode } from "@/hooks/use-view-mode";
import { 
  Folder, 
  FileText, 
  Image as ImageIcon, 
  MoreVertical, 
  ChevronRight,
  Upload,
  Home,
  Download,
  Trash2,
  Edit2,
  Move,
  Eye,
  Share2
} from "lucide-react";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { UploadDialog } from "@/components/upload-dialog";
import { RenameDialog } from "@/components/rename-dialog";
import { MoveDialog } from "@/components/move-dialog";
import { ShareDialog } from "@/components/share-dialog";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatSize } from "@/lib/utils";

function FileIcon({ mimeType, size = "md" }: { mimeType: string; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-8 h-8"
  };
  const cls = sizeClasses[size];
  
  if (mimeType.includes("image")) return <ImageIcon className={`${cls} text-purple-500`} />;
  if (mimeType.includes("folder")) return <Folder className={`${cls} text-blue-500 fill-blue-500/20`} />;
  if (mimeType.includes("pdf")) return <FileText className={`${cls} text-red-500`} />;
  return <FileText className={`${cls} text-slate-500`} />;
}

function FileBrowser() {
  const [match, params] = useRoute("/folder/:id");
  const folderId = match ? params.id : undefined;
  
  const { data, isLoading, error } = useFileSystem(folderId);
  const deleteFileMutation = useDeleteFile();
  const deleteFolderMutation = useDeleteFolder();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useViewMode('dashboard');

  // Dialog States
  const [renameItem, setRenameItem] = useState<{ id: number; name: string; type: 'file' | 'folder' } | null>(null);
  const [moveItem, setMoveItem] = useState<{ id: number; name: string; type: 'file' | 'folder' } | null>(null);
  const [shareItem, setShareItem] = useState<{ id: number; name: string; type: 'file' | 'folder' } | null>(null);
  
  // Multi-select state
  const [selectedItems, setSelectedItems] = useState<{ id: number; name: string; type: 'file' | 'folder' }[]>([]);
  const [shareMultipleOpen, setShareMultipleOpen] = useState(false);

  const toggleSelection = (item: { id: number; name: string; type: 'file' | 'folder' }) => {
    setSelectedItems(prev => {
      const isSelected = prev.some(i => i.id === item.id && i.type === item.type);
      if (isSelected) {
        return prev.filter(i => !(i.id === item.id && i.type === item.type));
      } else {
        return [...prev, item];
      }
    });
  };

  const isSelected = (id: number, type: 'file' | 'folder') => 
    selectedItems.some(i => i.id === id && i.type === type);

  const clearSelection = () => setSelectedItems([]);

  const handleViewFile = (fileId: number) => {
    window.open(`/api/fs/${fileId}/view`, '_blank');
  };

  const handleDownloadFile = (fileId: number) => {
    window.open(`/api/fs/${fileId}/download`, '_blank');
  };

  const handleDownloadFolder = (folderId: number) => {
    window.open(`/api/fs/folders/${folderId}/download`, '_blank');
  };

  const handleDelete = async (id: number, type: 'file' | 'folder') => {
    if (type === 'file') {
       deleteFileMutation.mutate(id);
    } else {
       deleteFolderMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-12 bg-card rounded-2xl border border-border">
        <div className="p-4 bg-destructive/10 rounded-full mb-4 text-destructive">
          <Folder className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Error Loading Files</h3>
        <p className="text-muted-foreground mt-2">{error.message}</p>
        <Button onClick={() => window.location.reload()} variant="outline" className="mt-6">
          Retry
        </Button>
      </div>
    );
  }

  const { folders, files, breadcrumbs } = data!;
  const isEmpty = folders.length === 0 && files.length === 0;

  return (
    <div className="space-y-6">
      {/* Dialogs */}
      <RenameDialog 
        open={!!renameItem} 
        onOpenChange={(open) => !open && setRenameItem(null)} 
        item={renameItem} 
      />
      <MoveDialog 
        open={!!moveItem} 
        onOpenChange={(open) => !open && setMoveItem(null)} 
        item={moveItem} 
      />
      <ShareDialog
        open={!!shareItem}
        onOpenChange={(open) => !open && setShareItem(null)}
        item={shareItem}
      />
      {/* Multi-select share dialog */}
      <ShareDialog
        open={shareMultipleOpen}
        onOpenChange={(open) => {
          setShareMultipleOpen(open);
          if (!open) clearSelection();
        }}
        item={null}
        items={selectedItems}
      />

      {/* Breadcrumbs & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <nav className="flex items-center text-sm text-muted-foreground overflow-x-auto pb-2 md:pb-0">
          <Link href="/" className="hover:text-primary transition-colors flex items-center gap-1">
            <Home className="w-4 h-4" />
          </Link>
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.id} className="flex items-center">
              <ChevronRight className="w-4 h-4 mx-1" />
              <Link href={`/folder/${crumb.id}`} className="hover:text-primary transition-colors whitespace-nowrap font-medium text-foreground">
                {crumb.name}
              </Link>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Multi-select actions */}
          {selectedItems.length > 0 && (
            <>
              <span className="text-sm text-muted-foreground">{selectedItems.length} selected</span>
              <Button variant="outline" size="sm" onClick={clearSelection}>
                Clear
              </Button>
              <Button size="sm" onClick={() => setShareMultipleOpen(true)}>
                <Share2 className="w-4 h-4 mr-2" /> Share Selected
              </Button>
            </>
          )}
          <ViewToggle view={viewMode} onViewChange={setViewMode} />
          <CreateFolderDialog parentId={folderId ? parseInt(folderId) : undefined} />
          <UploadDialog folderId={folderId ? parseInt(folderId) : undefined} />
        </div>
      </div>

      {/* File List */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Content */}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Folder className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium text-foreground">This folder is empty</h3>
            <p className="text-muted-foreground mt-1">Upload files or create folders to get started</p>
          </div>
        ) : viewMode === 'grid' ? (
          // Grid View
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {folders.map((folder) => (
              <div 
                key={`folder-${folder.id}`} 
                className={`group relative bg-muted/30 hover:bg-muted/50 rounded-xl p-4 transition-all hover:shadow-md ${isSelected(folder.id, 'folder') ? 'ring-2 ring-primary' : ''}`}
              >
                <div className="absolute top-2 left-2">
                  <Checkbox
                    checked={isSelected(folder.id, 'folder')}
                    onCheckedChange={() => toggleSelection({ id: folder.id, name: folder.name, type: 'folder' })}
                  />
                </div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleDownloadFolder(folder.id)}>
                        <Download className="w-4 h-4 mr-2" /> Download Zip
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShareItem({ id: folder.id, name: folder.name, type: 'folder' })}>
                        <Share2 className="w-4 h-4 mr-2" /> Share
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setRenameItem({ id: folder.id, name: folder.name, type: 'folder' })}>
                        <Edit2 className="w-4 h-4 mr-2" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(folder.id, 'folder')}>
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Link href={`/folder/${folder.id}`} className="flex flex-col items-center text-center pt-4">
                  <div className="w-16 h-16 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
                    <Folder className="w-10 h-10 text-blue-600 fill-blue-600/20" />
                  </div>
                  <p className="text-sm font-medium truncate w-full">{folder.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">Folder</p>
                </Link>
              </div>
            ))}
            
            {files.map((file) => (
              <div 
                key={`file-${file.id}`} 
                className={`group relative bg-muted/30 hover:bg-muted/50 rounded-xl p-4 transition-all hover:shadow-md cursor-pointer ${isSelected(file.id, 'file') ? 'ring-2 ring-primary' : ''}`}
                onClick={() => handleViewFile(file.id)}
              >
                <div className="absolute top-2 left-2" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected(file.id, 'file')}
                    onCheckedChange={() => toggleSelection({ id: file.id, name: file.name, type: 'file' })}
                  />
                </div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewFile(file.id); }}>
                        <Eye className="w-4 h-4 mr-2" /> View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownloadFile(file.id); }}>
                        <Download className="w-4 h-4 mr-2" /> Download
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShareItem({ id: file.id, name: file.name, type: 'file' }); }}>
                        <Share2 className="w-4 h-4 mr-2" /> Share
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(file.id, 'file'); }}>
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex flex-col items-center text-center pt-4">
                  <div className="w-16 h-16 rounded-xl bg-background flex items-center justify-center mb-3 shadow-sm">
                    <FileIcon mimeType={file.mimeType} size="lg" />
                  </div>
                  <p className="text-sm font-medium truncate w-full">{file.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatSize(file.size)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === 'compact' ? (
          // Compact View
          <div className="divide-y divide-border/50">
            {folders.map((folder) => (
              <div 
                key={`folder-${folder.id}`} 
                className={`flex items-center gap-3 px-4 py-2 hover:bg-muted/30 transition-colors group ${isSelected(folder.id, 'folder') ? 'bg-primary/5' : ''}`}
              >
                <Checkbox
                  checked={isSelected(folder.id, 'folder')}
                  onCheckedChange={() => toggleSelection({ id: folder.id, name: folder.name, type: 'folder' })}
                />
                <Folder className="w-4 h-4 text-blue-500 shrink-0" />
                <Link href={`/folder/${folder.id}`} className="text-sm font-medium truncate flex-1 hover:text-primary">
                  {folder.name}
                </Link>
                <span className="text-xs text-muted-foreground hidden sm:block">
                  {(folder as any).size ? formatSize((folder as any).size) : "-"}
                </span>
                <span className="text-xs text-muted-foreground hidden md:block">
                  {folder.createdAt ? format(new Date(folder.createdAt), "MMM d") : "-"}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleDownloadFolder(folder.id)}>
                      <Download className="w-4 h-4 mr-2" /> Download
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShareItem({ id: folder.id, name: folder.name, type: 'folder' })}>
                      <Share2 className="w-4 h-4 mr-2" /> Share
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(folder.id, 'folder')}>
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            
            {files.map((file) => (
              <div 
                key={`file-${file.id}`} 
                className={`flex items-center gap-3 px-4 py-2 hover:bg-muted/30 transition-colors group cursor-pointer ${isSelected(file.id, 'file') ? 'bg-primary/5' : ''}`}
                onClick={() => handleViewFile(file.id)}
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected(file.id, 'file')}
                    onCheckedChange={() => toggleSelection({ id: file.id, name: file.name, type: 'file' })}
                  />
                </div>
                <FileIcon mimeType={file.mimeType} size="sm" />
                <span className="text-sm font-medium truncate flex-1">{file.name}</span>
                <span className="text-xs text-muted-foreground hidden sm:block">{formatSize(file.size)}</span>
                <span className="text-xs text-muted-foreground hidden md:block">
                  {file.createdAt ? format(new Date(file.createdAt), "MMM d") : "-"}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownloadFile(file.id); }}>
                      <Download className="w-4 h-4 mr-2" /> Download
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShareItem({ id: file.id, name: file.name, type: 'file' }); }}>
                      <Share2 className="w-4 h-4 mr-2" /> Share
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(file.id, 'file'); }}>
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        ) : (
          // List View (default)
          <>
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <div className="col-span-6 flex items-center gap-2">
                <div className="w-5" />
                Name
              </div>
              <div className="col-span-2 hidden sm:block">Size</div>
              <div className="col-span-3 hidden sm:block">Last Modified</div>
              <div className="col-span-1"></div>
            </div>
            
            <div className="divide-y divide-border/50">
              {folders.map((folder) => (
                <div key={`folder-${folder.id}`} className={`grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors group file-row ${isSelected(folder.id, 'folder') ? 'bg-primary/5' : ''}`}>
                  <div className="col-span-6 flex items-center gap-3">
                    <Checkbox
                      checked={isSelected(folder.id, 'folder')}
                      onCheckedChange={() => toggleSelection({ id: folder.id, name: folder.name, type: 'folder' })}
                      className="mr-1"
                    />
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
                      <Folder className="w-6 h-6 fill-blue-600/20" />
                    </div>
                    <Link href={`/folder/${folder.id}`} className="font-medium text-foreground hover:text-primary truncate">
                      {folder.name}
                    </Link>
                  </div>
                  <div className="col-span-2 hidden sm:block text-sm text-muted-foreground">
                    {(folder as any).size ? formatSize((folder as any).size) : "-"}
                  </div>
                  <div className="col-span-3 hidden sm:block text-sm text-muted-foreground">
                    {folder.createdAt ? format(new Date(folder.createdAt), "MMM d, yyyy") : "-"}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDownloadFolder(folder.id)}>
                          <Download className="w-4 h-4 mr-2" /> Download Zip
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShareItem({ id: folder.id, name: folder.name, type: 'folder' })}>
                          <Share2 className="w-4 h-4 mr-2" /> Share
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setRenameItem({ id: folder.id, name: folder.name, type: 'folder' })}>
                          <Edit2 className="w-4 h-4 mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setMoveItem({ id: folder.id, name: folder.name, type: 'folder' })}>
                          <Move className="w-4 h-4 mr-2" /> Move to...
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(folder.id, 'folder')}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}

              {files.map((file) => (
                <div key={`file-${file.id}`} className={`grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors group file-row ${isSelected(file.id, 'file') ? 'bg-primary/5' : ''}`}>
                  <div className="col-span-6 flex items-center gap-3">
                    <Checkbox
                      checked={isSelected(file.id, 'file')}
                      onCheckedChange={() => toggleSelection({ id: file.id, name: file.name, type: 'file' })}
                      className="mr-1"
                    />
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <FileIcon mimeType={file.mimeType} />
                    </div>
                    <span 
                      className="font-medium text-foreground truncate cursor-pointer hover:underline"
                      onClick={() => handleViewFile(file.id)}
                    >
                      {file.name}
                    </span>
                  </div>
                  <div className="col-span-2 hidden sm:block text-sm text-muted-foreground">
                    {formatSize(file.size)}
                  </div>
                  <div className="col-span-3 hidden sm:block text-sm text-muted-foreground">
                    {file.createdAt ? format(new Date(file.createdAt), "MMM d, yyyy") : "-"}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewFile(file.id)}>
                          <Eye className="w-4 h-4 mr-2" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownloadFile(file.id)}>
                          <Download className="w-4 h-4 mr-2" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShareItem({ id: file.id, name: file.name, type: 'file' })}>
                          <Share2 className="w-4 h-4 mr-2" /> Share
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setRenameItem({ id: file.id, name: file.name, type: 'file' })}>
                          <Edit2 className="w-4 h-4 mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setMoveItem({ id: file.id, name: file.name, type: 'file' })}>
                          <Move className="w-4 h-4 mr-2" /> Move to...
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(file.id, 'file')}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <LayoutShell>
      <FileBrowser />
    </LayoutShell>
  );
}
