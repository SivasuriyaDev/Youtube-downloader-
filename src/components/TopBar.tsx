import React from 'react';
import { Moon, Sun } from 'lucide-react';
import type { ActiveTab } from '../types/media';
import type { ThemeMode } from '../hooks/useTheme';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  activeQueueCount: number;
  libraryCount: number;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  activeQueueCount,
  libraryCount,
  theme,
  onToggleTheme,
}) => {
  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'downloader', label: 'Downloader' },
    { id: 'queue', label: activeQueueCount > 0 ? `Queue (${activeQueueCount})` : 'Queue' },
    { id: 'library', label: libraryCount > 0 ? `Library (${libraryCount})` : 'Library' },
    { id: 'android', label: 'Android Setup' },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-[52px] max-w-6xl items-center justify-between gap-4 px-4 md:h-16 md:gap-8 md:px-6">
        <button
          type="button"
          onClick={() => onSelectTab('downloader')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          VeloSave
        </button>

        <nav className="hidden md:flex items-center gap-6" aria-label="Primary navigation">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative min-h-[44px] px-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <span>{item.label}</span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Moon className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
          <div className="hidden md:block">
            <PWAInstallButton onOpenAndroidGuide={() => onSelectTab('android')} />
          </div>
          <div className="md:hidden">
            <PWAInstallButton compact />
          </div>
        </div>
      </div>
    </header>
  );
};
