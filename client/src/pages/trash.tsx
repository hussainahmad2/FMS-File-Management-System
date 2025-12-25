import { LayoutShell } from "@/components/layout-shell";
import { useTrashFiles, useRestoreFile, usePermanentDeleteFile, useRestoreFolder, usePermanentDeleteFolder } from "@/hooks/use-fs";
import { useViewMode } from "@/hooks/use-view-mode";
import { ViewToggle } from "@/components/view-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { 
  FileText, 
  Image as ImageIcon, 
  Folder,
  MoreVertical, 
  Trash2,
  RefreshCw,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatSize } from "@/lib/utils";

function FileIcon({ mimeType, size = "md" }: { mimeType: string; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-8 h-8"
  };
  const cls = sizeClasses[size];
  
  if (mimeType === "folder") return <Folder className={`${cls} text-blue-500 fill-blue-500/20`} />;
  if (mimeType.includes("image")) return <ImageIcon className={`${cls} text-purple-500`} />;
  if (mimeType.includes("pdf")) return <FileText className={`${cls} text-red-500`} />;
  return <FileText className={`${cls} text-slate-500`} />;
}

export default function TrashPage() {
  const { data, isLoading } = useTrashFiles();
  const restoreFile = useRestoreFile();
  const permanentDeleteFile = usePermanentDeleteFile();
  const restoreFolder = useRestoreFolder();
  const permanentDeleteFolder = usePermanentDeleteFolder();
  const [viewMode, setViewMode] = useViewMode('trash');
  
  const allItems = [
    ...(data?.folders || []).map(f => ({ ...f, type: 'folder' as const, size: 0, mimeType: 'folder' })),
    ...(data?.files || []).map(f => ({ ...f, type: 'file' as const, mimeType: f.mimeType }))
  ];

  return (
    <LayoutShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display flex items-center gap-2">
              <Trash2 className="w-6 h-6 text-destructive" />
              Trash
            </h1>
            <p className="text-muted-foreground">Items in trash will be deleted after 30 days</p>
          </div>
          <ViewToggle view={viewMode} onViewChange={setViewMode} />
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : allItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-medium text-foreground">Trash is empty</h3>
              <p className="text-muted-foreground mt-1">Deleted items will appear here</p>
            </div>
          ) : viewMode === 'grid' ? (
            // Grid View
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {allItems.map((item) => (
                <div 
                  key={`${item.type}-${item.id}`} 
                  className="group relative bg-muted/30 hover:bg-muted/50 rounded-xl p-4 transition-all hover:shadow-md opacity-75"
                >
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => item.type === 'file' ? restoreFile.mutate(item.id) : restoreFolder.mutate(item.id)}>
                          <RefreshCw className="w-4 h-4 mr-2" /> Restore
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => item.type === 'file' ? permanentDeleteFile.mutate(item.id) : permanentDeleteFolder.mutate(item.id)}>
                          <X className="w-4 h-4 mr-2" /> Delete Forever
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-xl bg-background/50 flex items-center justify-center mb-3 shadow-sm">
                      <FileIcon mimeType={item.mimeType} size="lg" />
                    </div>
                    <p className="text-sm font-medium truncate w-full opacity-75">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.type === 'file' ? formatSize(item.size) : 'Folder'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : viewMode === 'compact' ? (
            // Compact View
            <div className="divide-y divide-border/50">
              {allItems.map((item) => (
                <div 
                  key={`${item.type}-${item.id}`} 
                  className="flex items-center gap-3 px-4 py-2 hover:bg-muted/30 transition-colors group opacity-75"
                >
                  <FileIcon mimeType={item.mimeType} size="sm" />
                  <span className="text-sm font-medium truncate flex-1">{item.name}</span>
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    {item.type === 'file' ? formatSize(item.size) : "-"}
                  </span>
                  <span className="text-xs text-muted-foreground hidden md:block">
                    {item.deletedAt ? format(new Date(item.deletedAt), "MMM d") : "-"}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => item.type === 'file' ? restoreFile.mutate(item.id) : restoreFolder.mutate(item.id)}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Restore
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => item.type === 'file' ? permanentDeleteFile.mutate(item.id) : permanentDeleteFolder.mutate(item.id)}>
                        <X className="w-4 h-4 mr-2" /> Delete Forever
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          ) : (
            // List View (default)
            <div className="divide-y divide-border/50">
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-6">Name</div>
                <div className="col-span-2 hidden sm:block">Size</div>
                <div className="col-span-3 hidden sm:block">Deleted At</div>
                <div className="col-span-1"></div>
              </div>
              
              {allItems.map((item) => (
                <div key={`${item.type}-${item.id}`} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors group opacity-75">
                  <div className="col-span-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <FileIcon mimeType={item.mimeType} />
                    </div>
                    <span className="font-medium text-foreground truncate">{item.name}</span>
                  </div>
                  <div className="col-span-2 hidden sm:block text-sm text-muted-foreground">
                    {item.type === 'file' ? formatSize(item.size) : "-"}
                  </div>
                  <div className="col-span-3 hidden sm:block text-sm text-muted-foreground">
                    {item.deletedAt ? format(new Date(item.deletedAt), "MMM d, yyyy") : (item.createdAt ? format(new Date(item.createdAt), "MMM d, yyyy") : "-")}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => item.type === 'file' ? restoreFile.mutate(item.id) : restoreFolder.mutate(item.id)}>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Restore
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => item.type === 'file' ? permanentDeleteFile.mutate(item.id) : permanentDeleteFolder.mutate(item.id)}>
                          <X className="w-4 h-4 mr-2" />
                          Permanently Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </LayoutShell>
  );
}
