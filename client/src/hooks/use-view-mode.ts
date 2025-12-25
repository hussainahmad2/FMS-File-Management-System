import { useState, useEffect } from 'react';
import type { ViewMode } from '@/components/view-toggle';

export function useViewMode(key: string = 'default') {
  const storageKey = `fms-view-mode-${key}`;
  
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(storageKey);
      if (saved && ['list', 'grid', 'compact'].includes(saved)) {
        return saved as ViewMode;
      }
    }
    return 'list';
  });

  useEffect(() => {
    localStorage.setItem(storageKey, viewMode);
  }, [viewMode, storageKey]);

  return [viewMode, setViewMode] as const;
}

