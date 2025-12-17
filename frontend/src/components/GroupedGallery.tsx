import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useStore, STATIC_MODE } from '../store';
import { ArrowLeft, RefreshCw, ChevronDown, ChevronUp, Loader2, Layers, Settings } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { StickerModal } from './StickerModal';

// Lazy Image component using IntersectionObserver
const LazyImage: React.FC<{ src: string; alt: string; className?: string }> = ({ src, alt, className }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const imgRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '100px' } // Start loading 100px before visible
        );

        if (imgRef.current) {
            observer.observe(imgRef.current);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <div ref={imgRef} className={`${className} bg-white/5 flex items-center justify-center`}>
            {isVisible ? (
                <img
                    src={src}
                    alt={alt}
                    className={`w-full h-full object-contain transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={() => setIsLoaded(true)}
                />
            ) : (
                <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-accent-primary animate-spin" />
            )}
        </div>
    );
};

const API_Base = STATIC_MODE ? '.' : 'http://localhost:8000';

export const GroupedGallery: React.FC = () => {
    const { setCurrentView, clusterData, triggerClustering, fetchClusters, clusterParams, setClusterParams } = useStore();
    const [expandedGroup, setExpandedGroup] = useState<number | null>(null);
    const [showUngrouped, setShowUngrouped] = useState(false);
    const [focusedSticker, setFocusedSticker] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);

    // On mount, fetch cached clusters first, then trigger if needed (only in dynamic mode)
    useEffect(() => {
        if (STATIC_MODE) return; // Data already loaded by initStatic
        const init = async () => {
            await fetchClusters();
            // Check state after fetch
            const state = useStore.getState();
            const data = state.clusterData;
            // Only trigger if no groups/ungrouped data and not already loading/running
            if (data.groups.length === 0 && data.ungrouped.length === 0 &&
                !data.loading && data.progress?.status !== 'running') {
                triggerClustering();
            }
        };
        init();
    }, []);

    const getStickerUrl = (path: string) => {
        if (path.startsWith('http')) return path;
        return `${API_Base}${path}`;
    };

    // Pagination for groups to prevent request spam
    const [displayCount, setDisplayCount] = useState(20);
    const visibleGroups = useMemo(() => clusterData.groups.slice(0, displayCount), [clusterData.groups, displayCount]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight * 1.5) {
            if (displayCount < clusterData.groups.length) {
                setDisplayCount(prev => Math.min(prev + 20, clusterData.groups.length));
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-bg-dark text-text-primary overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-4 p-4 border-b border-white/5 bg-black/20 shrink-0 z-10">
                <button
                    onClick={() => setCurrentView('home')}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors flex items-center gap-2 text-sm font-bold text-text-secondary"
                >
                    <ArrowLeft size={18} />
                    Back
                </button>

                <div className="h-6 w-px bg-white/10" />

                <div className="flex items-center gap-2">
                    <Layers size={18} className="text-accent-primary" />
                    <span className="font-bold">Grouped Stickers</span>
                </div>

                {/* Re-cluster button - hide in static mode */}
                {!STATIC_MODE && (
                    <button
                        onClick={() => triggerClustering()}
                        disabled={clusterData.loading}
                        className="ml-4 px-3 py-1.5 bg-accent-primary/20 hover:bg-accent-primary/40 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={clusterData.loading ? 'animate-spin' : ''} />
                        Re-cluster
                    </button>
                )}

                <button
                    onClick={() => setCurrentView('embedding-map')}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                    title="View embedding map - 2D visualization of sticker similarities"
                >
                    🗺️ Map View
                </button>

                {/* Settings Toggle - hide in static mode */}
                {!STATIC_MODE && (
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-white/20 text-white' : 'bg-white/5 text-text-secondary hover:text-white'}`}
                        title="Clustering Settings"
                    >
                        <Settings size={16} />
                    </button>
                )}

                {/* Clustering Settings Panel */}
                <AnimatePresence>
                    {showSettings && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex items-center gap-4 px-3 py-2 bg-black/40 rounded-lg border border-white/10"
                        >
                            <div className="flex items-center gap-2" title="Minimum stickers needed to form a group. Higher = fewer, larger groups. Lower = more, smaller groups (may include false positives).">
                                <span className="text-xs text-text-secondary whitespace-nowrap cursor-help underline decoration-dotted">Min Group Size</span>
                                <input
                                    type="range"
                                    min="2"
                                    max="10"
                                    value={clusterParams.minClusterSize}
                                    onChange={(e) => setClusterParams({ minClusterSize: parseInt(e.target.value) })}
                                    className="w-16 h-1 accent-blue-500 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="text-xs text-white w-4">{clusterParams.minClusterSize}</span>
                            </div>
                            <div className="flex items-center gap-2" title="How strict the grouping algorithm is. Higher = only very similar stickers group together. Lower = allows more variation within groups.">
                                <span className="text-xs text-text-secondary whitespace-nowrap cursor-help underline decoration-dotted">Strictness</span>
                                <input
                                    type="range"
                                    min="1"
                                    max="5"
                                    value={clusterParams.minSamples}
                                    onChange={(e) => setClusterParams({ minSamples: parseInt(e.target.value) })}
                                    className="w-16 h-1 accent-orange-500 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="text-xs text-white w-4">{clusterParams.minSamples}</span>
                            </div>
                            <div className="flex items-center gap-2" title="Distance threshold for merging clusters. 0 = Strict (separate). 0.2+ = Merge clusters that are close. Helps combine split groups.">
                                <span className="text-xs text-text-secondary whitespace-nowrap cursor-help underline decoration-dotted">Merge Dist</span>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={clusterParams.clusterSelectionEpsilon ?? 0.0}
                                    onChange={(e) => setClusterParams({ clusterSelectionEpsilon: parseFloat(e.target.value) })}
                                    className="w-16 h-1 accent-purple-500 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="text-xs text-white w-8">{(clusterParams.clusterSelectionEpsilon ?? 0.0).toFixed(2)}</span>
                            </div>
                            <div className="text-[10px] text-gray-500 border-l border-white/10 pl-3 ml-1">
                                Embeddings are cached.<br />Only clustering re-runs.
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="ml-auto text-sm text-text-secondary font-medium flex items-center gap-4">
                    <span>{clusterData.groups.length} Groups</span>
                    <span className="text-white/30">|</span>
                    <span>{clusterData.total_grouped} Grouped</span>
                    <span className="text-white/30">|</span>
                    <span>{clusterData.total_ungrouped} Ungrouped</span>
                </div>
            </div>

            {/* Content */}
            <div
                className="flex-1 overflow-y-auto p-6 custom-scrollbar"
                onScroll={handleScroll}
            >
                {clusterData.loading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-6 text-text-secondary max-w-md mx-auto w-full">
                        <Loader2 size={48} className="animate-spin text-accent-primary" />

                        <div className="w-full space-y-2">
                            <div className="flex justify-between text-sm font-medium text-gray-300">
                                <span>Analyzing Stickers</span>
                                <span>
                                    {clusterData.progress?.total > 0
                                        ? Math.round((clusterData.progress.current / clusterData.progress.total) * 100)
                                        : 0}%
                                </span>
                            </div>

                            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-accent-primary transition-all duration-300 ease-out"
                                    style={{
                                        width: `${clusterData.progress?.total > 0
                                            ? (clusterData.progress.current / clusterData.progress.total) * 100
                                            : 0}%`
                                    }}
                                />
                            </div>

                            <div className="flex justify-between text-xs text-gray-500">
                                <span>Processed {clusterData.progress?.current || 0} / {clusterData.progress?.total || 0}</span>
                                {clusterData.progress?.estimated_remaining > 0 && (
                                    <span>~{Math.ceil(clusterData.progress.estimated_remaining)}s remaining</span>
                                )}
                            </div>
                        </div>

                        <p className="text-sm text-gray-500 text-center">
                            Computing DINOv2 embeddings and identifying similar clusters...
                        </p>
                    </div>
                ) : clusterData.progress?.status === 'failed' ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-red-500 max-w-md mx-auto w-full text-center">
                        <Layers size={64} className="text-red-500/50" />
                        <p className="text-lg font-bold">Clustering Failed</p>
                        <p className="text-sm text-text-secondary">
                            An error occurred while grouping your stickers. Please try again.
                        </p>
                        <button
                            onClick={() => triggerClustering()}
                            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 rounded-lg text-sm font-medium transition-colors"
                        >
                            Retry Clustering
                        </button>
                    </div>
                ) : clusterData.groups.length === 0 && clusterData.ungrouped.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-text-secondary">
                        <Layers size={64} className="text-gray-600" />
                        <p className="text-lg font-medium">No stickers to group</p>
                        <p className="text-sm text-gray-500">Upload and process some images first</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Cluster Groups */}
                        {visibleGroups.map((group) => (
                            <div
                                key={group.id}
                                className="bg-white/5 rounded-xl border border-white/10 overflow-hidden transition-all"
                            >
                                {/* Group Header */}
                                <button
                                    onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
                                    className="w-full p-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
                                >
                                    {/* Preview thumbnails */}
                                    <div className="flex -space-x-3">
                                        {group.sticker_paths.slice(0, 4).map((path, idx) => (
                                            <div
                                                key={idx}
                                                className="w-12 h-12 rounded-lg bg-black/40 border-2 border-bg-dark overflow-hidden flex items-center justify-center"
                                                style={{ zIndex: 4 - idx }}
                                            >
                                                <img
                                                    src={STATIC_MODE ? getStickerUrl(path).replace('/results/', '/thumbs/') : getStickerUrl(path)}
                                                    alt=""
                                                    className="w-full h-full object-contain"
                                                />
                                            </div>
                                        ))}
                                        {group.count > 4 && (
                                            <div className="w-12 h-12 rounded-lg bg-black/60 border-2 border-bg-dark flex items-center justify-center text-xs font-bold text-text-secondary">
                                                +{group.count - 4}
                                            </div>
                                        )}
                                    </div>

                                    {/* Group info */}
                                    <div className="flex-1 text-left">
                                        <div className="font-bold text-white">Group {group.id + 1}</div>
                                        <div className="text-sm text-text-secondary">{group.count} similar stickers</div>
                                    </div>

                                    {/* Expand icon */}
                                    {expandedGroup === group.id ? (
                                        <ChevronUp size={20} className="text-text-secondary" />
                                    ) : (
                                        <ChevronDown size={20} className="text-text-secondary" />
                                    )}
                                </button>

                                {/* Expanded content */}
                                <AnimatePresence>
                                    {expandedGroup === group.id && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="p-4 pt-0 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3 max-h-[60vh] overflow-y-auto">
                                                {group.sticker_paths.map((path: string, idx: number) => (
                                                    <div
                                                        key={idx}
                                                        className="aspect-square bg-black/40 rounded-lg p-2 cursor-pointer hover:bg-white/10 transition-colors"
                                                        onClick={() => setFocusedSticker(getStickerUrl(path))}
                                                    >
                                                        <LazyImage
                                                            src={STATIC_MODE ? getStickerUrl(path).replace('/results/', '/thumbs/') : getStickerUrl(path)}
                                                            alt=""
                                                            className="w-full h-full"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))}

                        {/* Ungrouped Section */}
                        {clusterData.ungrouped.length > 0 && (
                            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden mt-8">
                                <button
                                    onClick={() => setShowUngrouped(!showUngrouped)}
                                    className="w-full p-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
                                >
                                    <div className="w-12 h-12 rounded-lg bg-gray-700/50 flex items-center justify-center">
                                        <span className="text-2xl text-text-secondary">?</span>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <div className="font-bold text-text-secondary">Ungrouped</div>
                                        <div className="text-sm text-gray-500">{clusterData.ungrouped.length} unique stickers</div>
                                    </div>
                                    {showUngrouped ? (
                                        <ChevronUp size={20} className="text-text-secondary" />
                                    ) : (
                                        <ChevronDown size={20} className="text-text-secondary" />
                                    )}
                                </button>

                                <AnimatePresence>
                                    {showUngrouped && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="p-4 pt-0 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
                                                {clusterData.ungrouped.map((path, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="aspect-square bg-black/40 rounded-lg p-2 cursor-pointer hover:bg-white/10 transition-colors flex items-center justify-center"
                                                        onClick={() => setFocusedSticker(getStickerUrl(path))}
                                                    >
                                                        <img
                                                            src={getStickerUrl(path)}
                                                            alt=""
                                                            loading="lazy"
                                                            className="w-full h-full object-contain"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Focused Modal */}
            <AnimatePresence>
                {focusedSticker && (
                    <StickerModal
                        stickerPath={focusedSticker}
                        onClose={() => setFocusedSticker(null)}
                        onChangeSticker={setFocusedSticker}
                        siblings={expandedGroup !== null
                            ? clusterData.groups.find(g => g.id === expandedGroup)?.sticker_paths.map(p => getStickerUrl(p)) || []
                            : []
                        }
                    />
                )}
            </AnimatePresence>
        </div>
    );
};
