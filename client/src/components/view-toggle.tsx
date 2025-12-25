import { Button } from "@/components/ui/button";
import { LayoutGrid, List, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = 'list' | 'grid' | 'compact';

interface ViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="flex items-center border rounded-lg p-1 bg-muted/30">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-3",
          view === 'list' && "bg-background shadow-sm"
        )}
        onClick={() => onViewChange('list')}
        title="List view"
      >
        <List className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-3",
          view === 'grid' && "bg-background shadow-sm"
        )}
        onClick={() => onViewChange('grid')}
        title="Grid view"
      >
        <LayoutGrid className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-3",
          view === 'compact' && "bg-background shadow-sm"
        )}
        onClick={() => onViewChange('compact')}
        title="Compact view"
      >
        <LayoutList className="w-4 h-4" />
      </Button>
    </div>
  );
}

