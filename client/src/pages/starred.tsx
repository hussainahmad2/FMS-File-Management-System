import { LayoutShell } from "@/components/layout-shell";
import { useStarredFiles, useToggleStar } from "@/hooks/use-fs";
import { useViewMode } from "@/hooks/use-view-mode";
import { ViewToggle } from "@/components/view-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { 
  FileText, 
  Image as ImageIcon, 
  Folder,
  MoreVertical, 
  Star,
  StarOff,
  Download,
  Eye
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
  
  if (mimeType.includes("image")) return <ImageIcon className={`${cls} text-purple-500`} />;
  if (mimeType.includes("folder")) return <Folder className={`${cls} text-blue-500 fill-blue-500/20`} />;
  if (mimeType.includes("pdf")) return <FileText className={`${cls} text-red-500`} />;
  if (mimeType.includes("word") || mimeType.includes("document")) return <FileText className={`${cls} text-blue-600`} />;
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) return <FileText className={`${cls} text-green-600`} />;
  return <FileText className={`${cls} text-slate-500`} />;
}

export default function StarredPage() {
  const { data: files, isLoading } = useStarredFiles();
  const toggleStar = useToggleStar();
  const [viewMode, setViewMode] = useViewMode('starred');

  const handleViewFile = (fileId: number) => {
    window.open(`/api/fs/${fileId}/view`, '_blank');
  };

  const handleDownloadFile = (fileId: number) => {
    window.open(`/api/fs/${fileId}/download`, '_blank');
  };

  return (
    <LayoutShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display flex items-center gap-2">
              <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
              Starred Files
            </h1>
            <p className="text-muted-foreground">Your favorite files and folders</p>
          </div>
          <ViewToggle view={viewMode} onViewChange={setViewMode} />
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : files?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Star className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-medium text-foreground">No starred files</h3>
              <p className="text-muted-foreground mt-1">Star files to see them here</p>
            </div>
          ) : viewMode === 'grid' ? (
            // Grid View
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {files?.map((file) => (
                <div 
                  key={file.id} 
                  className="group relative bg-muted/30 hover:bg-muted/50 rounded-xl p-4 transition-all hover:shadow-md cursor-pointer"
                  onClick={() => handleViewFile(file.id)}
                >
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
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleStar.mutate(file.id); }}>
                          <StarOff className="w-4 h-4 mr-2" /> Unstar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-xl bg-background flex items-center justify-center mb-3 shadow-sm">
                      <FileIcon mimeType={file.mimeType} size="lg" />
                    </div>
                    <p className="text-sm font-medium truncate w-full">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatSize(file.size)}</p>
                  </div>
                  <Star className="absolute top-2 left-2 w-4 h-4 text-yellow-500 fill-yellow-500" />
                </div>
              ))}
            </div>
          ) : viewMode === 'compact' ? (
            // Compact View
            <div className="divide-y divide-border/50">
              {files?.map((file) => (
                <div 
                  key={file.id} 
                  className="flex items-center gap-3 px-4 py-2 hover:bg-muted/30 transition-colors group cursor-pointer"
                  onClick={() => handleViewFile(file.id)}
                >
                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 shrink-0" />
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
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleStar.mutate(file.id); }}>
                        <StarOff className="w-4 h-4 mr-2" /> Unstar
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
                <div className="col-span-3 hidden sm:block">Last Modified</div>
                <div className="col-span-1"></div>
              </div>
              
              {files?.map((file) => (
                <div 
                  key={file.id} 
                  className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors group cursor-pointer"
                  onClick={() => handleViewFile(file.id)}
                >
                  <div className="col-span-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center relative">
                      <FileIcon mimeType={file.mimeType} />
                      <Star className="absolute -top-1 -right-1 w-4 h-4 text-yellow-500 fill-yellow-500" />
                    </div>
                    <span className="font-medium text-foreground truncate">{file.name}</span>
                  </div>
                  <div className="col-span-2 hidden sm:block text-sm text-muted-foreground">
                    {formatSize(file.size)}
                  </div>
                  <div className="col-span-3 hidden sm:block text-sm text-muted-foreground">
                    {file.createdAt ? format(new Date(file.createdAt), "MMM d, yyyy") : "-"}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
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
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleStar.mutate(file.id); }}>
                          <StarOff className="w-4 h-4 mr-2" /> Unstar
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
