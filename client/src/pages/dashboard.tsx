import { Link, useRoute } from "wouter";
import { useFileSystem } from "@/hooks/use-fs";
import { LayoutShell } from "@/components/layout-shell";
import { CreateFolderDialog } from "@/components/create-folder-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Folder, 
  FileText, 
  Image as ImageIcon, 
  MoreVertical, 
  ChevronRight,
  Upload,
  Home
} from "lucide-react";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.includes("image")) return <ImageIcon className="w-5 h-5 text-purple-500" />;
  if (mimeType.includes("folder")) return <Folder className="w-5 h-5 text-blue-500 fill-blue-500/20" />;
  return <FileText className="w-5 h-5 text-slate-500" />;
}

function FileBrowser() {
  const [match, params] = useRoute("/folder/:id");
  const folderId = match ? params.id : undefined;
  
  const { data, isLoading, error } = useFileSystem(folderId);

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
      {/* Breadcrumbs & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <nav className="flex items-center text-sm text-muted-foreground overflow-x-auto pb-2 md:pb-0">
          <Link href="/" className="hover:text-primary transition-colors flex items-center gap-1">
            <Home className="w-4 h-4" />
          </Link>
          {breadcrumbs.map((crumb) => (
            <div key={crumb.id} className="flex items-center">
              <ChevronRight className="w-4 h-4 mx-1" />
              <Link href={`/folder/${crumb.id}`} className="hover:text-primary transition-colors whitespace-nowrap font-medium text-foreground">
                {crumb.name}
              </Link>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <CreateFolderDialog parentId={folderId ? parseInt(folderId) : undefined} />
          <Button className="gap-2 shadow-lg shadow-primary/25">
            <Upload className="w-4 h-4" />
            Upload File
          </Button>
        </div>
      </div>

      {/* File List */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-6">Name</div>
          <div className="col-span-2 hidden sm:block">Size</div>
          <div className="col-span-3 hidden sm:block">Last Modified</div>
          <div className="col-span-1"></div>
        </div>

        {/* Content */}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Folder className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium text-foreground">This folder is empty</h3>
            <p className="text-muted-foreground mt-1">Upload files or create folders to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {folders.map((folder) => (
              <div key={`folder-${folder.id}`} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors group file-row">
                <div className="col-span-6 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
                    <Folder className="w-6 h-6 fill-blue-600/20" />
                  </div>
                  <Link href={`/folder/${folder.id}`} className="font-medium text-foreground hover:text-primary truncate">
                    {folder.name}
                  </Link>
                </div>
                <div className="col-span-2 hidden sm:block text-sm text-muted-foreground">-</div>
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
                      <DropdownMenuItem>Rename</DropdownMenuItem>
                      <DropdownMenuItem>Move to...</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}

            {files.map((file) => (
              <div key={`file-${file.id}`} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors group file-row">
                <div className="col-span-6 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <FileIcon mimeType={file.mimeType} />
                  </div>
                  <span className="font-medium text-foreground truncate">{file.name}</span>
                </div>
                <div className="col-span-2 hidden sm:block text-sm text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
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
                      <DropdownMenuItem>Download</DropdownMenuItem>
                      <DropdownMenuItem>Rename</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
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
