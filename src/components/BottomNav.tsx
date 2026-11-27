import React from 'react';
import { ArrowDownToLine, FolderHeart, ListChecks, Smartphone } from 'lucide-react';
import type { ActiveTab } from '../types/media';

interface BottomNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  activeQueueCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  activeQueueCount,
}) => {
  const tabs: { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'downloader', label: 'Downloader', icon: ArrowDownToLine },
    { id: 'queue', label: activeQueueCount > 0 ? `Queue (${activeQueueCount})` : 'Queue', icon: ListChecks },
    { id: 'library', label: 'Library', icon: FolderHeart },
    { id: 'android', label: 'Android', icon: Smartphone },
  ];

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe md:hidden dark:border-slate-800 dark:bg-slate-950/95"
    >
      <div className="grid h-16 grid-cols-4 items-center">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-1 px-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Icon className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />
              <span className="text-[11px] font-medium leading-none tracking-tight whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
