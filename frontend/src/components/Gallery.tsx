import React from 'react';
import { useStore, STATIC_MODE } from '../store';
import { motion } from 'framer-motion';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';

// Custom artist priority order (higher index = later in list)
const ARTIST_ORDER: Record<string, number> = {
    'SemantiClub': 0,
    '_kawaii_sticker': 1,
};

const sortArtists = (a: string, b: string) => {
    const orderA = ARTIST_ORDER[a] ?? 999;
    const orderB = ARTIST_ORDER[b] ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
};

interface GalleryProps {
    compact?: boolean;
}

export const Gallery: React.FC<GalleryProps> = ({ compact }) => {
    const { images, selectedImageId, selectImage, selectedArtists, toggleArtist } = useStore();
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);

    // Unique Artists (Exclude Unknown) - sorted with custom priority
    const uniqueArtists = React.useMemo(() => {
        const artists = new Set(images
            .map(img => img.metadata?.artist)
            .filter(a => a && a !== 'Unknown') as string[]
        );
        return Array.from(artists).sort(sortArtists);
    }, [images]);

    // Filtered Images - sorted by artist priority
    // Note: Even in compact mode (carousel), we now respect the global filter
    // so that the "next/prev" context matches what the user saw in the gallery.
    const filteredImages = React.useMemo(() => {
        let result = images;
        if (selectedArtists.length > 0) {
            const set = new Set(selectedArtists);
            result = images.filter(img => set.has(img.metadata?.artist || ''));
        }
        // Sort by artist priority
        return [...result].sort((a, b) => {
            const artistA = a.metadata?.artist || '';
            const artistB = b.metadata?.artist || '';
            return sortArtists(artistA, artistB);
        });
    }, [images, selectedArtists]);

    // Scroll to selected image in compact mode
    React.useEffect(() => {
        if (compact && selectedImageId && scrollContainerRef.current) {
            const el = document.getElementById(`gallery-item-${selectedImageId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [selectedImageId, compact]);

    if (images.length === 0) return null;

    return (
        <div className="flex flex-col gap-4">
            {/* Artist Filters (Only in full view) */}
            {!compact && uniqueArtists.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 flex-none scrollbar-hide px-1" style={{ paddingTop: '1em', paddingBottom: '0em' }}>
                    {uniqueArtists.map(artist => {
                        const isSelected = selectedArtists.includes(artist);
                        // If NO stickers selected, ALL are technically "active" in view, 
                        // but visually we might want to differentiate "Explicitly Selected" vs "Implicitly All".
                        // User said: "only their background should change to show that they are checked or unchecked"
                        // And "unchecking all... as if all where checked".
                        // So visually:
                        // - Empty Set: All buttons "Unchecked" (gray)? Or All "Checked"?
                        // Usually "All" means all are active. If I click one, others deactivate.
                        // Let's make "Empty Set" look like "All Checked" visually?
                        // No, that's confusing state.
                        // "Unchecking all": implies they were checked.
                        // If I have [A, B] selected. I uncheck A. B remains. I uncheck B. Set is empty. All show up.
                        // Visuals: When Set is empty, all buttons should be "Gray" or "Colored"?
                        // If they are Gray, it implies "None Selected", which aligns with logic.
                        // The user sees all images.
                        // Let's keep them Gray when not in the set.

                        return (
                            <button
                                key={artist}
                                onClick={() => toggleArtist(artist)}
                                className={`
                                    px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border
                                    ${isSelected
                                        ? 'bg-accent-primary text-white border-accent-primary shadow-lg shadow-accent-primary/20 scale-105'
                                        : 'bg-white/5 text-gray-400 border-transparent hover:bg-white/10 hover:border-white/10'}
                                `}
                            >
                                {artist}
                            </button>
                        );
                    })}
                </div>
            )}

            <div
                ref={scrollContainerRef}
                className={`w-full glass-panel p-2 md:p-4 ${compact ? 'overflow-x-auto flex gap-4 whitespace-nowrap scrollbar-hide' : 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-4'}`}
            >
                {filteredImages.map(img => (
                    <motion.div
                        key={img.id}
                        id={`gallery-item-${img.id}`}
                        layoutId={img.id}
                        onClick={() => selectImage(img.id)}
                        whileHover={{ y: -5 }}
                        className={`
                            relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all 
                            ${selectedImageId === img.id ? 'border-accent-primary shadow-[0_0_20px_rgba(50,215,75,0.3)] scale-105 z-10' : 'border-transparent hover:border-white/20'}
                            ${compact ? 'w-24 h-24 shrink-0' : 'aspect-square pb-[100%]'}
                        `}
                    >
                        <img
                            src={img.originalUrl}
                            alt="Thumbnail"
                            className={`w-full h-full object-cover ${compact ? '' : 'absolute inset-0'}`}
                        />

                        {!STATIC_MODE && (
                            <div className="absolute top-1 right-1 p-1 rounded-full bg-black/50 backdrop-blur-sm z-10">
                                {img.status === 'processing' && <Loader2 size={16} className="animate-spin text-accent-secondary" />}
                                {img.status === 'completed' && <CheckCircle size={16} className="text-green-400" />}
                                {img.status === 'failed' && <AlertCircle size={16} className="text-red-500" />}
                            </div>
                        )}

                        {/* Priority Indicator */}
                        {img.priority <= 1 && img.status !== 'completed' && (
                            <div className="absolute bottom-0 inset-x-0 h-1 bg-accent-pink z-10" />
                        )}
                    </motion.div>
                ))}
            </div>
        </div>
    );
};
