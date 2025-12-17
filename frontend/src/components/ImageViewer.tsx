import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Sliders, RefreshCw, ChevronDown, ChevronUp, Grid, Layout, ExternalLink, Minimize2, Maximize2 } from 'lucide-react';
import { PhysicsCanvas } from './PhysicsCanvas';
import { StickerModal } from './StickerModal';
import { getSourceUrl } from '../utils';

const InteractiveImage: React.FC<{
    src: string;
    stickers: any[];
    onStickerClick: (path: string) => void;
    sourceUrl: string | null;
}> = ({ src, stickers, onStickerClick, sourceUrl }) => {
    const [dims, setDims] = useState<{ w: number, h: number } | null>(null);

    React.useEffect(() => {
        const img = new Image();
        img.src = src;
        img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    }, [src]);

    return (
        <div className="relative w-full h-full flex items-center justify-center">
            {/* Wrapper to maintain aspect ratio logic if needed, or simple img-based approach */}
            <div
                className="relative shadow-2xl rounded-lg overflow-hidden"
                style={dims ? { aspectRatio: `${dims.w} / ${dims.h}`, maxWidth: '100%', maxHeight: '100%' } : { width: '100%', height: '100%' }}
            >
                <img
                    src={src}
                    alt="Original"
                    className="w-full h-full object-contain block"
                />

                {dims && stickers.map((sticker) => {
                    if (!sticker.box || sticker.box.length !== 4) return null;
                    const [x, y, w, h] = sticker.box;
                    return (
                        <div
                            key={sticker.path}
                            className="absolute border-2 border-transparent hover:border-white/80 hover:bg-white/10 cursor-pointer transition-all z-10"
                            style={{
                                left: `${(x / dims.w) * 100}%`,
                                top: `${(y / dims.h) * 100}%`,
                                width: `${(w / dims.w) * 100}%`,
                                height: `${(h / dims.h) * 100}%`,
                            }}
                            onClick={() => onStickerClick(sticker.path)}
                            title={`Score: ${sticker.score.toFixed(2)}`}
                        />
                    );
                })}

                {/* Source URL Overlay */}
                {sourceUrl && (
                    <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute bottom-3 right-3 z-20 flex items-center gap-2 px-3 py-1.5 bg-black/60 hover:bg-black/80 backdrop-blur text-white rounded-full transition-all text-xs font-bold border border-white/10 group shadow-lg"
                        title="View Source on X"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="w-3.5 h-3.5 fill-current"><g><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></g></svg>
                        <span>Source</span>
                        <ExternalLink size={10} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                    </a>
                )}
            </div>
        </div>
    );
};

export const ImageViewer: React.FC = () => {
    const { images, selectedImageId, selectImage, regenerateTask, modelParams, updateModelParams, segmentationProgress, selectedArtists } = useStore();
    const selectedImage = images.find(i => i.id === selectedImageId);
    const [isParamsOpen, setIsParamsOpen] = useState(false);
    const [isImageCollapsed, setIsImageCollapsed] = useState(false);

    // Compute filtered list to sync with Gallery context
    const filteredImages = useMemo(() => {
        if (!selectedArtists || selectedArtists.length === 0) return images;
        const set = new Set(selectedArtists);
        return images.filter(img => set.has(img.metadata?.artist || ''));
    }, [images, selectedArtists]);

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!selectedImageId) return;

            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const currentIndex = filteredImages.findIndex(i => i.id === selectedImageId);
                if (currentIndex === -1) return;

                let nextIndex = currentIndex;
                if (e.key === 'ArrowRight') {
                    nextIndex = currentIndex + 1;
                    if (nextIndex >= filteredImages.length) nextIndex = 0; // Loop or stop? User didn't specify, standard is often loop or stop. Let's loop for smoother UX? Or stop. Gallery usually wraps or stops. Let's wrap.
                } else {
                    nextIndex = currentIndex - 1;
                    if (nextIndex < 0) nextIndex = filteredImages.length - 1;
                }

                if (nextIndex !== currentIndex) {
                    selectImage(filteredImages[nextIndex].id);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedImageId, filteredImages, selectImage]);

    // Get Source URL
    const sourceUrl = selectedImage?.metadata?.source_url || (selectedImage ? getSourceUrl(selectedImage.originalUrl) : null);

    // View Settings
    const [stickerSize, setStickerSize] = useState(150);
    const [viewMode, setViewMode] = useState<'canvas' | 'grid'>('canvas');
    const [focusedSticker, setFocusedSticker] = useState<string | null>(null);

    if (!selectedImage) return null;

    const handleRegenerate = async () => {
        if (!selectedImage) return;
        await regenerateTask(selectedImage.id);
    };

    const isProcessing = selectedImage.status === 'processing' || selectedImage.status === 'pending';



    // Calculate interactive boxes for Original View
    // Store sends boxes in [x, y, w, h] format relative to ORIGINAL image size
    // We need to scale them to the displayed image size.
    // This is tricky because we don't know the displayed size until render.
    // For now, simpler approach:
    // If we can't easily map clicks purely by CSS, we can render the Overlay Image if available.
    // User requested "colored stickers that were segmented". 
    // The backend provides `overlayUrl`. Let's use that as the source if available!

    return (
        <div className="w-full flex-1 flex flex-col md:flex-row gap-4 md:gap-8 h-full min-h-0 overflow-hidden">
            {/* Original View */}
            <motion.div
                className={`glass-panel relative flex items-center justify-center overflow-hidden transition-all duration-300 ${isImageCollapsed ? 'h-14 min-h-[3.5rem] flex-none p-2' : 'flex-1 p-2 md:p-4'}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                key={selectedImageId}
            >
                {/* Controls */}
                <div className="absolute top-2 right-2 flex gap-2 z-30">
                    <button
                        className="p-2 bg-black/50 rounded-full hover:bg-white/20 transition-colors text-white"
                        onClick={() => setIsImageCollapsed(!isImageCollapsed)}
                        title={isImageCollapsed ? "Show Image" : "Hide Image"}
                    >
                        {isImageCollapsed ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                    </button>
                    <button
                        className="p-2 bg-black/50 rounded-full hover:bg-white/20 transition-colors text-white"
                        onClick={() => selectImage(null as any)}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className={`relative flex items-center justify-center w-full h-full ${isImageCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    <InteractiveImage
                        src={selectedImage.overlayUrl || selectedImage.originalUrl}
                        stickers={selectedImage.resultUrls}
                        onStickerClick={(path) => setFocusedSticker(path)}
                        sourceUrl={sourceUrl}
                    />
                </div>

                {isImageCollapsed && (
                    <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                        <span className="text-sm font-bold text-white/70">Original Image</span>
                    </div>
                )}

                {isProcessing && !isImageCollapsed && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center flex-col z-20">
                        <Sparkles className="animate-spin text-accent-primary mb-4" size={48} />
                        <p className="text-xl font-bold text-white">Segmenting Stickers...</p>
                        {segmentationProgress.total > 0 && (
                            <p className="text-sm text-gray-300 mt-2">
                                {segmentationProgress.completed} of {segmentationProgress.total} complete
                                {segmentationProgress.processing > 0 && ` • ${segmentationProgress.processing} processing`}
                            </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">Using SAM 3 Model</p>
                    </div>
                )}
            </motion.div>

            {/* Results View */}
            <motion.div
                className="flex-1 glass-panel p-2 md:p-4 flex flex-col w-full md:w-auto md:min-w-[400px]"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
            >
                {/* Unified Toolbar */}
                <div className="mb-4 flex flex-wrap items-center gap-4 p-3 bg-white/5 rounded-xl border border-white/5">
                    {/* View Toggle */}
                    <div className="flex bg-black/40 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('canvas')}
                            className={`p-1.5 rounded transition-all ${viewMode === 'canvas' ? 'bg-accent-primary text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                            title="Canvas View"
                        >
                            <Layout size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded transition-all ${viewMode === 'grid' ? 'bg-accent-primary text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                            title="Grid View"
                        >
                            <Grid size={16} />
                        </button>
                    </div>

                    {/* Source URL Link REMOVED from Toolbar */}

                    <div className="h-6 w-px bg-white/10" />

                    {/* Size Slider */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-400">Size</span>
                        <input
                            type="range" min="50" max="400" step="10"
                            value={stickerSize}
                            onChange={(e) => setStickerSize(parseInt(e.target.value))}
                            className="w-24 accent-white h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>

                    <div className="h-6 w-px bg-white/10" />

                    {/* Model Parameters Popover/Expandable */}
                    <div className="relative group">
                        <button
                            className="flex items-center gap-2 text-xs font-bold text-gray-300 hover:text-white transition-colors py-1 px-2 rounded-lg hover:bg-white/5"
                            onClick={() => setIsParamsOpen(!isParamsOpen)}
                        >
                            <Sliders size={14} />
                            Params
                            {isParamsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                    </div>

                    <div className="flex-1" />

                    {/* Regenerate Action */}
                    <button
                        onClick={handleRegenerate}
                        disabled={isProcessing}
                        className="py-1.5 px-3 bg-accent-secondary/20 hover:bg-accent-secondary/30 text-accent-secondary rounded-lg flex items-center gap-2 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
                    >
                        <RefreshCw size={12} className={isProcessing ? "animate-spin" : ""} />
                        Regenerate
                    </button>
                </div>

                {/* Collapsible Param Panel */}
                <AnimatePresence>
                    {isParamsOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden mb-4"
                        >
                            <div className="p-3 bg-white/5 rounded-lg border border-white/5 flex gap-6">
                                <div className="flex-1">
                                    <div className="flex justify-between text-xs mb-1 text-gray-400">
                                        <span className="font-medium text-white">IOU Threshold</span>
                                        <span className="text-accent-primary">{modelParams.iouThreshold}</span>
                                    </div>
                                    <input
                                        type="range" min="0.1" max="1.0" step="0.05"
                                        value={modelParams.iouThreshold}
                                        onChange={(e) => updateModelParams({ iouThreshold: parseFloat(e.target.value) })}
                                        className="w-full accent-accent-primary h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between text-xs mb-1 text-gray-400">
                                        <span className="font-medium text-white">Score Threshold</span>
                                        <span className="text-accent-pink">{modelParams.scoreThreshold}</span>
                                    </div>
                                    <input
                                        type="range" min="0.1" max="1.0" step="0.05"
                                        value={modelParams.scoreThreshold}
                                        onChange={(e) => updateModelParams({ scoreThreshold: parseFloat(e.target.value) })}
                                        className="w-full accent-accent-pink h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white/90">
                    <Sparkles className="text-accent-pink" size={20} />
                    Extracted Stickers <span className="text-gray-500 text-sm font-normal">({selectedImage.resultUrls.length})</span>
                </h2>

                <div className="flex-1 min-h-0 relative p-2 bg-black/20 rounded-xl border border-white/5 overflow-hidden">
                    {viewMode === 'canvas' ? (
                        <PhysicsCanvas
                            stickers={selectedImage.resultUrls}
                            stickerSize={stickerSize}
                        />
                    ) : (
                        <div className="w-full h-full overflow-y-auto p-4 custom-scrollbar">
                            <div
                                className="grid gap-4"
                                style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${stickerSize}px, 1fr))` }}
                            >
                                {selectedImage.resultUrls.map((sticker) => (
                                    <div
                                        key={sticker.path}
                                        className="aspect-square relative group cursor-pointer"
                                        onClick={() => setFocusedSticker(sticker.path)}
                                    >
                                        <div className="absolute inset-0 bg-white/5 rounded-lg group-hover:bg-white/10 transition-colors" />
                                        <img
                                            src={sticker.path}
                                            alt="Sticker"
                                            className="w-full h-full object-contain p-2"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Modal for Grid View Expansion */}
            <AnimatePresence>
                {focusedSticker && (
                    <StickerModal
                        stickerPath={focusedSticker}
                        onClose={() => setFocusedSticker(null)}
                        onChangeSticker={setFocusedSticker}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};
