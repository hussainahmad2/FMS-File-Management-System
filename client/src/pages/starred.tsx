import { LayoutShell } from "@/components/layout-shell";
import { useStarredFiles, useToggleStar } from "@/hooks/use-fs";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { 
  FileText, 
  Image as ImageIcon, 
  Folder,
  MoreVertical, 
  Star,
  StarOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatSize } from "@/lib/utils";

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.includes("image")) return <ImageIcon className="w-5 h-5 text-purple-500" />;
  if (mimeType.includes("folder")) return <Folder className="w-5 h-5 text-blue-500 fill-blue-500/20" />;
  return <FileText className="w-5 h-5 text-slate-500" />;
}

export default function StarredPage() {
  const { data: files, isLoading } = useStarredFiles();
  const toggleStar = useToggleStar();

  return (
    <LayoutShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
            Starred Files
          </h1>
          <p className="text-muted-foreground">Your favorite files and folders</p>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-6">Name</div>
                <div className="col-span-2 hidden sm:block">Size</div>
                <div className="col-span-3 hidden sm:block">Last Modified</div>
                <div className="col-span-1"></div>
              </div>
              
              {files?.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <Star className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground">No starred files</h3>
                  <p className="text-muted-foreground mt-1">Star files to see them here</p>
                </div>
              ) : (
                files?.map((file) => (
                  <div key={file.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors group">
                    <div className="col-span-6 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        <FileIcon mimeType={file.mimeType} />
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
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Download</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleStar.mutate(file.id)}>
                            <StarOff className="w-4 h-4 mr-2" />
                            Unstar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </LayoutShell>
  );
}

