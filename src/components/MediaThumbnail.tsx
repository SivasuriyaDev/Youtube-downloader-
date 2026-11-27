import React, { useState } from 'react';
import { Film } from 'lucide-react';
import type { MediaPlatform } from '../types/media';

interface MediaThumbnailProps {
  src: string;
  alt: string;
  platform: MediaPlatform;
  durationLabel?: string;
  className?: string;
}

export const MediaThumbnail: React.FC<MediaThumbnailProps> = ({
  src,
  alt,
  platform,
  durationLabel,
  className = '',
}) => {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`relative overflow-hidden bg-slate-200 dark:bg-slate-800 ${className}`}
    >
      {!failed && src ? (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-200 to-slate-300 p-4 text-slate-600 dark:from-slate-800 dark:to-slate-900 dark:text-slate-300">
          <Film className="h-7 w-7 opacity-70" aria-hidden="true" />
          <span className="text-xs font-medium">
            {platform === 'youtube' ? 'YouTube Media' : 'Instagram Media'}
          </span>
        </div>
      )}

      {durationLabel && durationLabel !== '0:00' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-end bg-gradient-to-t from-black/80 via-black/35 to-transparent p-2.5">
          <span className="font-mono text-xs font-medium text-white tabular-nums">
            {durationLabel}
          </span>
        </div>
      )}
    </div>
  );
};
