import React, { useRef, useState } from 'react';

interface PropertyGalleryProps {
  images?: string[];
  alt: string;
}

// Shown until a landlord uploads real photos — labeled so a visitor still
// understands the layout being described, not just an empty gray box.
const PLACEHOLDER_ROOMS = [
  { label: 'Living room', icon: '🛋️', from: 'from-emerald-700', to: 'to-emerald-950' },
  { label: 'Kitchen', icon: '🍳', from: 'from-amber-700', to: 'to-amber-950' },
  { label: 'Bedroom', icon: '🛏️', from: 'from-blue-700', to: 'to-blue-950' },
  { label: 'Exterior', icon: '🏡', from: 'from-teal-700', to: 'to-teal-950' },
];

const PropertyGallery: React.FC<PropertyGalleryProps> = ({ images, alt }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const hasRealPhotos = images && images.length > 0;
  const slideCount = hasRealPhotos ? images.length : PLACEHOLDER_ROOMS.length;

  function scrollToIndex(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(slideCount - 1, index));
    track.scrollTo({ left: clamped * track.clientWidth, behavior: 'smooth' });
  }

  function handleScroll() {
    const track = trackRef.current;
    if (!track) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    setActive(index);
  }

  return (
    <div className="relative group">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar w-full h-44 rounded-t-xl"
        style={{ scrollbarWidth: 'none' }}
      >
        {hasRealPhotos
          ? images!.map((src, i) => (
              <img key={i} src={src} alt={`${alt} — photo ${i + 1}`} className="w-full h-44 object-cover shrink-0 snap-start" />
            ))
          : PLACEHOLDER_ROOMS.map((room) => (
              <div
                key={room.label}
                className={`w-full h-44 shrink-0 snap-start bg-gradient-to-br ${room.from} ${room.to} flex flex-col items-center justify-center text-white/90`}
              >
                <span className="text-3xl mb-1">{room.icon}</span>
                <span className="text-xs font-medium tracking-wide uppercase">{room.label}</span>
              </div>
            ))}
      </div>

      {!hasRealPhotos && (
        <span className="absolute top-2 right-2 bg-black/40 text-white text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm">
          Sample layout — photos coming
        </span>
      )}

      {slideCount > 1 && (
        <>
          <button
            type="button"
            onClick={() => scrollToIndex(active - 1)}
            aria-label="Previous photo"
            className="opacity-0 group-hover:opacity-100 transition absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-700 hover:bg-white"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scrollToIndex(active + 1)}
            aria-label="Next photo"
            className="opacity-0 group-hover:opacity-100 transition absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-700 hover:bg-white"
          >
            ›
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {Array.from({ length: slideCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to photo ${i + 1}`}
                onClick={() => scrollToIndex(i)}
                className={`w-1.5 h-1.5 rounded-full transition ${i === active ? 'bg-white w-4' : 'bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default PropertyGallery;
