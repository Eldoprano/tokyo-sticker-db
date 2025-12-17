import React, { useState, useMemo } from 'react';
import { useStore, STATIC_MODE } from '../store';
import { AnimatePresence } from 'framer-motion';
import { Grid, Layout, ArrowLeft } from 'lucide-react';
import { PhysicsCanvas } from './PhysicsCanvas';
import { StickerModal } from './StickerModal';
import { getSourceUrl } from '../utils';

export const GlobalGallery: React.FC = () => {
    const { images, clusterData, setCurrentView } = useStore();
    const [viewMode, setViewMode] = useState<'canvas' | 'grid'>('grid');
    const [stickerSize, setStickerSize] = useState(100);
    const [focusedSticker, setFocusedSticker] = useState<string | null>(null);

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

    return (
        <div className="flex flex-col h-full bg-bg-dark text-white overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-4 p-4 border-b border-white/5 bg-black/20 shrink-0 z-10">
                <button
                    onClick={() => setCurrentView('home')}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors flex items-center gap-2 text-sm font-bold text-gray-300"
                >
                    <ArrowLeft size={18} />
                    Back
                </button>

                <div className="h-6 w-px bg-white/10" />

                {/* View Mode Switches */}
                <div className="flex bg-black/40 rounded-lg p-1">
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

                <div className="h-6 w-px bg-white/10" />

                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-secondary">Size</span>
                    <input
                        type="range" min="40" max="200" step="10"
                        value={stickerSize}
                        onChange={(e) => setStickerSize(parseInt(e.target.value))}
                        className="w-32 accent-white h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>

                <div className="ml-auto text-sm text-text-secondary font-medium">
                    {allStickers.length} Stickers
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">
                {viewMode === 'canvas' ? (
                    <PhysicsCanvas
                        stickers={allStickers}
                        stickerSize={stickerSize}
                        onStickerClick={(path) => setFocusedSticker(path)}
                    />
                ) : (
                    <div className="w-full h-full overflow-y-auto p-8 custom-scrollbar">
                        <div
                            className="grid gap-6"
                            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${stickerSize}px, 1fr))` }}
                        >
                            {allStickers.map((sticker, idx) => (
                                <div
                                    key={`${sticker.path}-${idx}-grid`}
                                    className="aspect-square bg-white/5 rounded-xl flex items-center justify-center p-4 cursor-pointer hover:bg-white/10 transition-colors"
                                    onClick={() => setFocusedSticker(sticker.path)}
                                >
                                    <img
                                        src={sticker.path}
                                        alt=""
                                        loading="lazy"
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                            ))}
                        </div>
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
