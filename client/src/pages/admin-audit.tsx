import { useAuditLogs } from "@/hooks/use-audit";
import { useViewMode } from "@/hooks/use-view-mode";
import { ViewToggle } from "@/components/view-toggle";
import { LayoutShell } from "@/components/layout-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Activity, File, Folder, User, Clock, MoreVertical, Eye, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AuditPage() {
  const { data: logs, isLoading } = useAuditLogs();
  const [viewMode, setViewMode] = useViewMode('audit');

  const getIcon = (type: string, size: "sm" | "md" | "lg" = "md") => {
    const sizeClasses = {
      sm: "w-4 h-4",
      md: "w-5 h-5",
      lg: "w-6 h-6"
    };
    const cls = sizeClasses[size];
    
    switch (type) {
      case "file": return <File className={`${cls} text-blue-500`} />;
      case "folder": return <Folder className={`${cls} text-yellow-500`} />;
      case "user": return <User className={`${cls} text-purple-500`} />;
      default: return <Activity className={`${cls} text-gray-500`} />;
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes('delete')) return 'text-red-600 bg-red-50 border-red-200';
    if (action.includes('create') || action.includes('upload')) return 'text-green-600 bg-green-50 border-green-200';
    if (action.includes('update') || action.includes('edit') || action.includes('rename')) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (action.includes('login') || action.includes('logout')) return 'text-purple-600 bg-purple-50 border-purple-200';
    if (action.includes('share') || action.includes('permission')) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  return (
    <LayoutShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              Audit Logs
            </h1>
            <p className="text-muted-foreground">Track system activity and changes</p>
          </div>
          <ViewToggle view={viewMode} onViewChange={setViewMode} />
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : logs?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Activity className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-medium text-foreground">No audit logs</h3>
              <p className="text-muted-foreground mt-1">Activity will be tracked here</p>
            </div>
          ) : viewMode === 'grid' ? (
            // Grid View
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {logs?.map((log) => (
                <div 
                  key={log.id} 
                  className="group relative bg-muted/30 hover:bg-muted/50 rounded-xl p-4 transition-all hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center shadow-sm shrink-0">
                      {getIcon(log.targetType, "md")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${getActionColor(log.action)}`}>
                          {log.action.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate" title={log.details || ""}>
                        {log.details || "-"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {log.createdAt ? format(new Date(log.createdAt), "MMM d, HH:mm") : "-"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : viewMode === 'compact' ? (
            // Compact View
            <div className="divide-y divide-border/50">
              {logs?.map((log) => (
                <div 
                  key={log.id} 
                  className="flex items-center gap-3 px-4 py-2 hover:bg-muted/30 transition-colors group"
                >
                  {getIcon(log.targetType, "sm")}
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium border shrink-0 ${getActionColor(log.action)}`}>
                    {log.action.toUpperCase()}
                  </span>
                  <span className="text-sm text-muted-foreground truncate flex-1" title={log.details || ""}>
                    {log.details || "-"}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono hidden md:block shrink-0">
                    {log.createdAt ? format(new Date(log.createdAt), "HH:mm:ss") : "-"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            // List View (default)
            <div className="divide-y divide-border/50">
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-3">Action</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-4">Details</div>
                <div className="col-span-3 text-right">Timestamp</div>
              </div>
              {logs?.map((log) => (
                <div key={log.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors group">
                  <div className="col-span-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${getActionColor(log.action)}`}>
                      {log.action.toUpperCase()}
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground capitalize">
                    {getIcon(log.targetType, "sm")}
                    {log.targetType}
                  </div>
                  <div className="col-span-4 text-sm text-muted-foreground truncate" title={log.details || ""}>
                    {log.details || "-"}
                  </div>
                  <div className="col-span-3 text-right text-sm text-muted-foreground font-mono">
                    {log.createdAt ? format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss") : "-"}
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
