import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore, STATIC_MODE } from '../store';
import { AnimatePresence } from 'framer-motion';
import { Grid, Layout, ArrowLeft } from 'lucide-react';
import { PhysicsCanvas } from './PhysicsCanvas';
import { StickerModal } from './StickerModal';
import { getSourceUrl } from '../utils';

// How many stickers to render at once in the grid before requiring a scroll.
// Keeps the DOM small so GitHub Pages isn't hit with thousands of image
// requests on first paint (the main cause of lag / rate-limiting).
const GRID_PAGE_SIZE = 80;
// The physics canvas is O(n^2); cap how many stickers it simulates so it
// stays smooth even on collections with tens of thousands of stickers.
const CANVAS_MAX_NODES = 250;

export const GlobalGallery: React.FC = () => {
    const { images, clusterData, setCurrentView } = useStore();
    const [viewMode, setViewMode] = useState<'canvas' | 'grid'>('grid');
    const [stickerSize, setStickerSize] = useState(100);
    const [focusedSticker, setFocusedSticker] = useState<string | null>(null);
    const [visibleCount, setVisibleCount] = useState(GRID_PAGE_SIZE);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Flatten all stickers with source info
    const allStickers = useMemo(() => {
        // In static mode, use cluster data instead of images
        if (STATIC_MODE) {
            const paths = [
                ...clusterData.groups.flatMap(g => g.sticker_paths),
                ...clusterData.ungrouped
            ];
            return paths.map(path => {
                const meta = clusterData.task_metadata?.[path];
                // Use thumbnail for display/grid/canvas performance
                // StickerModal will upgrade to full res if needed
                const displayPath = path.replace('/results/', '/thumbs/');
                return {
                    path: `.${displayPath}`, // Prepend . for relative paths
                    box: [0, 0, 0, 0],
                    score: 1,
                    sourceUrl: meta?.source_url
                };
            });
        }
        return images.flatMap(img => {
            const src = img.metadata?.source_url || getSourceUrl(img.originalUrl);
            return (img.resultUrls || []).map(s => ({ ...s, sourceUrl: src }));
        });
    }, [images, clusterData]);

    // Only render a window of the grid; grow it as the user scrolls down.
    const visibleStickers = useMemo(
        () => allStickers.slice(0, visibleCount),
        [allStickers, visibleCount]
    );

    // For the heavy physics canvas, only ever simulate a bounded subset.
    const canvasStickers = useMemo(
        () => allStickers.slice(0, CANVAS_MAX_NODES),
        [allStickers]
    );

    // Reset the paging window when the dataset changes.
    useEffect(() => {
        setVisibleCount(GRID_PAGE_SIZE);
    }, [allStickers]);

    // Infinite scroll: load the next page when the sentinel scrolls into view.
    useEffect(() => {
        if (viewMode !== 'grid') return;
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    setVisibleCount((prev) =>
                        Math.min(prev + GRID_PAGE_SIZE, allStickers.length)
                    );
                }
            },
            { rootMargin: '600px' }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [viewMode, allStickers.length, visibleCount]);

    return (
        <div className="flex flex-col h-full bg-bg-dark text-white overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-2 md:gap-4 p-2 md:p-4 border-b border-white/5 bg-black/20 shrink-0 z-10 overflow-x-auto no-scrollbar">
                <button
                    onClick={() => setCurrentView('home')}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors flex items-center gap-2 text-sm font-bold text-gray-300 shrink-0"
                >
                    <ArrowLeft size={18} />
                    <span className="hidden md:inline">Back</span>
                </button>

                <div className="h-6 w-px bg-white/10 shrink-0" />

                {/* View Mode Switches */}
                <div className="flex bg-black/40 rounded-lg p-1 shrink-0">
                    <div className="relative group/tooltip">
                        <button
                            onClick={() => setViewMode('canvas')}
                            className={`p-1.5 rounded transition-all ${viewMode === 'canvas' ? 'bg-accent-primary text-white shadow-lg' : 'text-text-secondary hover:text-white'}`}
                        >
                            <Layout size={16} />
                        </button>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-xs rounded whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none backdrop-blur-sm z-50">
                            Warning: High CPU/GPU usage
                        </div>
                    </div>
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded transition-all ${viewMode === 'grid' ? 'bg-accent-primary text-white shadow-lg' : 'text-text-secondary hover:text-white'}`}
                        title="Grid View"
                    >
                        <Grid size={16} />
                    </button>
                </div>

                <div className="h-6 w-px bg-white/10 shrink-0" />

                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-medium text-text-secondary hidden md:inline">Size</span>
                    <input
                        type="range" min="40" max="200" step="10"
                        value={stickerSize}
                        onChange={(e) => setStickerSize(parseInt(e.target.value))}
                        className="w-24 md:w-32 accent-white h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>

                <div className="ml-auto text-xs md:text-sm text-text-secondary font-medium shrink-0">
                    {viewMode === 'canvas' && allStickers.length > CANVAS_MAX_NODES ? (
                        <span title={`Canvas shows the first ${CANVAS_MAX_NODES} for performance`}>
                            {CANVAS_MAX_NODES} / {allStickers.length}
                        </span>
                    ) : (
                        allStickers.length
                    )}{' '}
                    <span className="hidden md:inline">Stickers</span>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">
                {viewMode === 'canvas' ? (
                    <PhysicsCanvas
                        stickers={canvasStickers}
                        stickerSize={stickerSize}
                        onStickerClick={(path) => setFocusedSticker(path)}
                    />
                ) : (
                    <div className="w-full h-full overflow-y-auto p-2 md:p-8 custom-scrollbar">
                        <div
                            className="grid gap-6"
                            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${stickerSize}px, 1fr))` }}
                        >
                            {visibleStickers.map((sticker, idx) => (
                                <div
                                    key={`${sticker.path}-${idx}-grid`}
                                    className="aspect-square bg-white/5 rounded-xl flex items-center justify-center p-4 cursor-pointer hover:bg-white/10 transition-colors"
                                    onClick={() => setFocusedSticker(sticker.path)}
                                >
                                    <img
                                        src={sticker.path}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Infinite-scroll sentinel + remaining count */}
                        {visibleCount < allStickers.length && (
                            <div
                                ref={sentinelRef}
                                className="flex justify-center py-8 text-xs text-text-secondary"
                            >
                                Loading more… ({visibleCount} / {allStickers.length})
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal Expansion */}
            <AnimatePresence>
                {focusedSticker && (
                    <StickerModal
                        stickerPath={focusedSticker}
                        onClose={() => setFocusedSticker(null)}
                        onChangeSticker={setFocusedSticker}
                        siblings={allStickers.map(s => s.path)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};
