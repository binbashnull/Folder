import { useState } from 'react';
import { FileText, Download, Play, X } from 'lucide-react';

type Props = {
  url: string;
  type: 'image' | 'video' | 'file';
  name: string | null;
};

export default function MediaMessage({ url, type, name }: Props) {
  const [lightbox, setLightbox] = useState(false);

  if (type === 'image') {
    return (
      <>
        <div
          className="mt-2 cursor-pointer overflow-hidden rounded-xl max-w-xs"
          onClick={() => setLightbox(true)}
        >
          <img
            src={url}
            alt={name ?? 'image'}
            className="w-full object-cover hover:scale-105 transition-transform duration-300 max-h-64"
          />
        </div>
        {lightbox && (
          <div
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setLightbox(false)}
          >
            <button className="absolute top-4 right-4 text-white hover:text-zinc-300 transition-colors">
              <X className="w-6 h-6" />
            </button>
            <img
              src={url}
              alt={name ?? 'image'}
              className="max-w-full max-h-full object-contain rounded-xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </>
    );
  }

  if (type === 'video') {
    return (
      <div className="mt-2 max-w-xs overflow-hidden rounded-xl bg-zinc-800 border border-zinc-700">
        <video
          src={url}
          controls
          className="w-full max-h-64"
          preload="metadata"
        >
          Your browser does not support video playback.
        </video>
        {name && (
          <div className="px-3 py-2 flex items-center gap-2 text-xs text-zinc-400">
            <Play className="w-3 h-3" />
            <span className="truncate">{name}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <a
      href={url}
      download={name ?? true}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-4 py-3 max-w-xs transition-colors group"
    >
      <div className="flex-shrink-0 w-8 h-8 bg-zinc-700 rounded-lg flex items-center justify-center">
        <FileText className="w-4 h-4 text-zinc-300" />
      </div>
      <span className="text-sm text-zinc-300 truncate flex-1">{name ?? 'Download file'}</span>
      <Download className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors flex-shrink-0" />
    </a>
  );
}
