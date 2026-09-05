import React, { useState } from 'react';

interface VideoEmbedProps {
  /** Direct .mp4 URL, or a YouTube/Vimeo watch URL — either is handled automatically. */
  src?: string;
  posterUrl?: string;
}

function toEmbedUrl(src: string): string | null {
  const yt = src.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = src.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

const VideoEmbed: React.FC<VideoEmbedProps> = ({ src, posterUrl }) => {
  const [playing, setPlaying] = useState(false);

  if (!src) {
    return (
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-900 to-emerald-950 flex flex-col items-center justify-center text-center px-6 border border-emerald-800">
        <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </div>
        <p className="text-white font-medium">Platform walkthrough — video coming soon</p>
        <p className="text-emerald-300 text-sm mt-1 max-w-sm">
          A real look at a repair going from tenant report to a paid, verified artisan.
        </p>
      </div>
    );
  }

  const embedUrl = toEmbedUrl(src);

  if (!playing) {
    return (
      <button
        onClick={() => setPlaying(true)}
        className="relative aspect-video rounded-2xl overflow-hidden w-full group border border-gray-200"
        aria-label="Play video"
      >
        {posterUrl ? (
          <img src={posterUrl} alt="Video preview" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-emerald-900 to-emerald-950" />
        )}
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6 text-emerald-700 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="aspect-video rounded-2xl overflow-hidden border border-gray-200">
      {embedUrl ? (
        <iframe
          src={`${embedUrl}?autoplay=1`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="EstateCopilot walkthrough"
        />
      ) : (
        <video src={src} className="w-full h-full" controls autoPlay playsInline />
      )}
    </div>
  );
};

export default VideoEmbed;
