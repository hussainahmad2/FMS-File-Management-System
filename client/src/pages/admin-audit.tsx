import { useAuditLogs } from "@/hooks/use-audit";
import { LayoutShell } from "@/components/layout-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Activity, File, Folder, User } from "lucide-react";

export default function AuditPage() {
  const { data: logs, isLoading } = useAuditLogs();

  const getIcon = (type: string) => {
    switch (type) {
      case "file": return <File className="w-4 h-4" />;
      case "folder": return <Folder className="w-4 h-4" />;
      case "user": return <User className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <LayoutShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Audit Logs</h1>
          <p className="text-muted-foreground">Track system activity and changes</p>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-3">Action</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-4">Details</div>
                <div className="col-span-3 text-right">Timestamp</div>
              </div>
              {logs?.map((log) => (
                <div key={log.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors">
                  <div className="col-span-3">
                    <span className="font-mono text-sm font-medium">{log.action.toUpperCase()}</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground capitalize">
                    {getIcon(log.targetType)}
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
              {logs?.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  No audit logs found.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </LayoutShell>
  );
}
