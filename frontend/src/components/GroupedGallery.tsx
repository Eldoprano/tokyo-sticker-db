import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useStore, STATIC_MODE } from '../store';
import { ArrowLeft, RefreshCw, ChevronUp, Loader2, Layers, Settings, Maximize2, Minimize2, Map } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { StickerModal } from './StickerModal';

// API Base URL helper
const API_Base = STATIC_MODE ? '.' : 'http://localhost:8000';
const getStickerUrl = (path: string) => {
    if (path.startsWith('http')) return path;
    return `${API_Base}${path}`;
};


// Lazy Image component
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
            { rootMargin: '200px' }
        );

        if (imgRef.current) {
            observer.observe(imgRef.current);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <div ref={imgRef} className={`${className} flex items-center justify-center overflow-hidden`}>
            {isVisible ? (
                <motion.img
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isLoaded ? 1 : 0 }}
                    src={src}
                    alt={alt}
                    className="w-full h-full object-contain"
                    onLoad={() => setIsLoaded(true)}
                />
            ) : (
                <div className="w-full h-full animate-pulse bg-white/5" />
            )}
        </div>
    );
};

// --- Group Card Component ---
interface GroupCardProps {
    group: any;
    size: number;
    isExpanded: boolean;
    onClick: () => void;
}

const GroupCard: React.FC<GroupCardProps> = ({ group, size, isExpanded, onClick }) => {
    const mainSticker = group.sticker_paths[0];
    // Take up to 4 background stickers
    const bgStickers = group.sticker_paths.slice(1, 5);

    // Generate stable random rotations for this group based on ID
    const rotations = useMemo(() => {
        return bgStickers.map((_: string, i: number) => {
            // Pseudo-random based on group ID and index
            const seed = (group.id * 13 + i * 7) % 20;
            return seed - 10; // -10 to 10 degrees
        });
    }, [group.id, bgStickers.length]);

    return (
        <motion.div
            className={`relative cursor-pointer group select-none ${isExpanded ? 'z-10' : ''}`}
            style={{ width: size, height: size }}
            onClick={onClick}
            initial={false}
            animate={isExpanded ? { scale: 1.05 } : { scale: 1 }}
            whileHover="hover"
        >
            {/* Background Stack (Reverse order so first in array is strictly behind main) */}
            {bgStickers.map((path: string, i: number) => (
                <motion.div
                    key={path}
                    className="absolute inset-0 rounded-xl shadow-lg overflow-hidden flex items-center justify-center p-2"
                    style={{
                        zIndex: 4 - i, // Higher index = closer to front (but behind main)
                    }}
                    initial={{ rotate: rotations[i], scale: 0.9 - (i * 0.05) }}
                    variants={{
                        hover: {
                            rotate: rotations[i] * 1.5, // Exaggerate rotation
                            x: (i % 2 === 0 ? 1 : -1) * (i + 1) * 10, // Spread X
                            y: -(i + 1) * 5, // Move up slightly
                            scale: 0.95,
                        }
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                    <img
                        src={STATIC_MODE ? getStickerUrl(path).replace('/results/', '/thumbs/') : getStickerUrl(path)}
                        alt=""
                        className="w-full h-full object-contain opacity-60"
                        loading="lazy"
                    />
                </motion.div>
            ))}

            {/* Main Top Card */}
            <motion.div
                className={`absolute inset-0 rounded-xl ${isExpanded ? 'border-2 border-accent-primary shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'shadow-xl'} overflow-hidden flex items-center justify-center z-10 transition-all`}
                variants={{
                    hover: { y: -10 }
                }}
            >
                <div className="p-3 w-full h-full">
                    <img
                        src={STATIC_MODE ? getStickerUrl(mainSticker).replace('/results/', '/thumbs/') : getStickerUrl(mainSticker)}
                        alt=""
                        className="w-full h-full object-contain drop-shadow-lg"
                    />

                </div>

                {/* Count Badge */}
                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white px-2 py-0.5 rounded-full text-xs font-bold border border-white/10 flex items-center gap-1 shadow-sm">
                    <Layers size={10} />
                    {group.count}
                </div>
            </motion.div>
        </motion.div>
    );
};


export const GroupedGallery: React.FC = () => {
    const { setCurrentView, clusterData, triggerClustering, fetchClusters, clusterParams, setClusterParams } = useStore();
    const [expandedGroup, setExpandedGroup] = useState<number | null>(null);
    const [cardSize, setCardSize] = useState(160);
    const [showSettings, setShowSettings] = useState(false);
    const [focusedSticker, setFocusedSticker] = useState<string | null>(null);
    const [columns, setColumns] = useState(4);

    // Pagination
    const [visibleCount, setVisibleCount] = useState(20);

    const containerRef = useRef<HTMLDivElement>(null);

    // Filter clusters (e.g. search) could go here, but focusing on raw display
    const allGroups = clusterData.groups;

    // Initial load logic
    useEffect(() => {
        if (STATIC_MODE) return;
        const init = async () => {
            await fetchClusters();
            const state = useStore.getState();
            const data = state.clusterData;
            if (data.groups.length === 0 && data.ungrouped.length === 0 &&
                !data.loading && data.progress?.status !== 'running') {
                triggerClustering();
            }
        };
        init();
    }, []);

    // Resize Observer for Grid Calculation
    useEffect(() => {
        if (!containerRef.current) return;

        const updateLayout = () => {
            if (!containerRef.current) return;
            // Subtract padding (p-6 = 24px * 2 = 48px)
            const width = containerRef.current.offsetWidth - 48;
            const gap = 24;
            // Calculate how many cardSize + gap fit
            const cols = Math.max(1, Math.floor(width / (cardSize + gap)));
            setColumns(cols);
        };

        const observer = new ResizeObserver(updateLayout);
        observer.observe(containerRef.current);
        updateLayout();

        return () => observer.disconnect();
    }, [cardSize]);

    // Scroll to expanded group
    useEffect(() => {
        if (expandedGroup !== null) {
            setTimeout(() => {
                const element = document.getElementById(`group-card-${expandedGroup}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
    }, [expandedGroup]);

    // Handle Infinite Scroll
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
        // Load more when near bottom (buffer of 1000px)
        if (scrollHeight - scrollTop - clientHeight < 1000) {
            if (visibleCount < allGroups.length) {
                setVisibleCount(prev => Math.min(prev + 20, allGroups.length));
            }
        }
    };

    // Ensure we fill the screen if initial load didn't
    useEffect(() => {
        if (allGroups.length > 0 && containerRef.current) {
            const { clientHeight, scrollHeight } = containerRef.current;
            // If content is shorter than container (or just barely larger), load more
            if (scrollHeight <= clientHeight + 500 && visibleCount < allGroups.length) {
                setVisibleCount(prev => Math.min(prev + 20, allGroups.length));
            }
        }
    }, [allGroups.length, visibleCount, columns, cardSize]);


    // Chunk groups into rows for rendering
    // IMPORTANT: Only chunk the VISIBLE groups to avoid rendering thousands of motion divs
    const rows = useMemo(() => {
        const result = [];
        const visibleGroups = allGroups.slice(0, visibleCount);
        for (let i = 0; i < visibleGroups.length; i += columns) {
            result.push(visibleGroups.slice(i, i + columns));
        }
        return result;
    }, [allGroups, visibleCount, columns]);


    const handleGroupClick = (groupId: number) => {
        setExpandedGroup(prev => prev === groupId ? null : groupId);
    };

    return (
        <div className="flex flex-col h-full bg-bg-dark text-text-primary overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-2 md:gap-4 p-2 md:p-4 border-b border-white/5 bg-black/20 shrink-0 z-20 backdrop-blur-md overflow-x-auto no-scrollbar">
                <button onClick={() => setCurrentView('home')} className="p-2 hover:bg-white/10 rounded-full transition-colors flex items-center gap-2 text-sm font-bold text-text-secondary shrink-0">
                    <ArrowLeft size={18} /> <span className="hidden md:inline">Back</span>
                </button>
                <div className="h-6 w-px bg-white/10 shrink-0" />
                <div className="flex items-center gap-2 shrink-0">
                    <Layers size={18} className="text-accent-primary" />
                    <span className="font-bold hidden md:inline">Grouped Stickers</span>
                </div>

                {/* Size Slider */}
                <div className="flex items-center gap-2 ml-auto md:ml-4 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 shrink-0">
                    <Minimize2 size={14} className="text-text-secondary" />
                    <input
                        type="range"
                        min="100"
                        max="300"
                        step="10"
                        value={cardSize}
                        onChange={(e) => setCardSize(parseInt(e.target.value))}
                        className="w-20 md:w-24 h-1 accent-accent-primary bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <Maximize2 size={14} className="text-text-secondary" />
                </div>

                {/* Map View Button */}
                <button
                    onClick={() => setCurrentView('embedding-map')}
                    className="ml-2 md:ml-4 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border border-white/5 shrink-0"
                    title="View 3D Map"
                >
                    <Map size={14} className="text-blue-400" />
                    <span className="hidden md:inline">Map View</span>
                </button>


                {/* Re-cluster button */}
                {!STATIC_MODE && (
                    <button
                        onClick={() => triggerClustering()}
                        disabled={clusterData.loading}
                        className="ml-auto md:ml-auto px-3 py-1.5 bg-accent-primary/20 hover:bg-accent-primary/40 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 shrink-0"
                    >
                        <RefreshCw size={14} className={clusterData.loading ? 'animate-spin' : ''} />
                        <span className="hidden md:inline">Re-cluster</span>
                    </button>
                )}

                {/* Settings Toggle */}
                {!STATIC_MODE && (
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-2 rounded-lg transition-colors shrink-0 ${showSettings ? 'bg-white/20 text-white' : 'bg-white/5 text-text-secondary hover:text-white'}`}
                        title="Clustering Settings"
                    >
                        <Settings size={16} />
                    </button>
                )}
            </div>

            {/* Settings Components */}
            <AnimatePresence>
                {showSettings && !STATIC_MODE && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-black/40 border-b border-white/10 overflow-hidden"
                    >
                        <div className="flex flex-wrap items-center justify-center gap-6 p-4">
                            <div className="flex items-center gap-2" title="Minimum stickers needed to form a group.">
                                <span className="text-xs text-text-secondary font-mono">Min Size</span>
                                <input type="range" min="2" max="10" value={clusterParams.minClusterSize}
                                    onChange={(e) => setClusterParams({ minClusterSize: parseInt(e.target.value) })}
                                    className="w-20 h-1 accent-blue-500 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                                <span className="text-xs text-white w-4">{clusterParams.minClusterSize}</span>
                            </div>
                            <div className="flex items-center gap-2" title="Strictness of grouping.">
                                <span className="text-xs text-text-secondary font-mono">Strictness</span>
                                <input type="range" min="1" max="5" value={clusterParams.minSamples}
                                    onChange={(e) => setClusterParams({ minSamples: parseInt(e.target.value) })}
                                    className="w-20 h-1 accent-orange-500 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                                <span className="text-xs text-white w-4">{clusterParams.minSamples}</span>
                            </div>
                            <div className="flex items-center gap-2" title="Distance to merge clusters.">
                                <span className="text-xs text-text-secondary font-mono">Merge Dist</span>
                                <input type="range" min="0" max="1" step="0.05" value={clusterParams.clusterSelectionEpsilon ?? 0.0}
                                    onChange={(e) => setClusterParams({ clusterSelectionEpsilon: parseFloat(e.target.value) })}
                                    className="w-20 h-1 accent-purple-500 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                                <span className="text-xs text-white w-8">{(clusterParams.clusterSelectionEpsilon ?? 0.0).toFixed(2)}</span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content Area */}
            <div
                className="flex-1 overflow-y-auto custom-scrollbar"
                ref={containerRef}
                onScroll={handleScroll}
            >
                {clusterData.loading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-6 text-text-secondary w-full">
                        <Loader2 size={48} className="animate-spin text-accent-primary" />
                        <p className="text-sm">Grouping stickers...</p>
                    </div>
                ) : clusterData.groups.length === 0 && clusterData.ungrouped.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-text-secondary">
                        <Layers size={64} className="text-gray-600" />
                        <p className="text-lg font-medium">No stickers to group</p>
                    </div>
                ) : (
                    <div className="p-2 md:p-6 pb-20 space-y-4 md:space-y-8">
                        {/* Render Rows */}
                        {rows.map((row, rowIndex) => {
                            // Check if any group in this row is expanded
                            const expandedInRow = row.find(g => g.id === expandedGroup);

                            return (
                                <div key={rowIndex} className="space-y-6">
                                    {/* The Grid Row */}
                                    <div className="flex gap-4 md:gap-6 flex-wrap" style={{ gap: window.innerWidth < 768 ? '16px' : '24px' }}>
                                        {row.map(group => (
                                            <div key={group.id} id={`group-card-${group.id}`} className="flex-shrink-0 flex-grow" style={{ flexBasis: cardSize }}>
                                                <GroupCard
                                                    group={group}
                                                    size={cardSize}
                                                    isExpanded={expandedGroup === group.id}
                                                    onClick={() => handleGroupClick(group.id)}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    {/* Expanded Panel (Rendered AFTER the row if needed) */}
                                    <AnimatePresence>
                                        {expandedInRow && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.3, ease: 'circOut' }}
                                                className="w-full overflow-hidden"
                                            >
                                                <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-6 relative shadow-inner">

                                                    <div className="flex justify-between items-center mb-6">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-lg bg-accent-primary/20 flex items-center justify-center text-accent-primary">
                                                                <Layers size={20} />
                                                            </div>
                                                            <div>
                                                                <h3 className="font-bold text-lg text-white">Group {expandedInRow.id + 1}</h3>
                                                                <p className="text-sm text-text-secondary">{expandedInRow.count} stickers</p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => setExpandedGroup(null)}
                                                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                                        >
                                                            <ChevronUp size={20} />
                                                        </button>
                                                    </div>

                                                    {/* Grid of Stickers in Group */}
                                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
                                                        {expandedInRow.sticker_paths.map((path: string) => (
                                                            <motion.div
                                                                key={path}
                                                                layoutId={path}
                                                                className="aspect-square bg-black/40 rounded-xl p-2 cursor-pointer hover:bg-white/5 border border-transparent hover:border-accent-primary/50 transition-all group relative"
                                                                onClick={() => setFocusedSticker(getStickerUrl(path))}
                                                                whileHover={{ scale: 1.05 }}
                                                            >
                                                                {/* Eager load images in expanded view to avoid glitch */}
                                                                <img
                                                                    src={STATIC_MODE ? getStickerUrl(path).replace('/results/', '/thumbs/') : getStickerUrl(path)}
                                                                    alt=""
                                                                    className="w-full h-full object-contain"
                                                                    loading="eager"
                                                                />
                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl" />
                                                            </motion.div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}

                        {/* Loading spinner at bottom if more to load */}
                        {visibleCount < allGroups.length && (
                            <div className="flex justify-center py-4 text-text-secondary">
                                <Loader2 className="animate-spin" size={24} />
                            </div>
                        )}

                        {/* Ungrouped Section (Always at bottom) */}
                        {clusterData.ungrouped.length > 0 && visibleCount >= allGroups.length && (
                            <div className="mt-12 pt-12 border-t border-white/10">
                                <h3 className="text-xl font-bold text-text-secondary mb-6 flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm">?</span>
                                    Ungrouped Stickers ({clusterData.ungrouped.length})
                                </h3>

                                <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3 opacity-60 hover:opacity-100 transition-opacity">
                                    {clusterData.ungrouped.map((path, idx) => (
                                        <div
                                            key={idx}
                                            className="aspect-square bg-black/20 rounded-lg p-2 cursor-pointer hover:scale-105 transition-transform"
                                            onClick={() => setFocusedSticker(getStickerUrl(path))}
                                        >
                                            <LazyImage
                                                src={STATIC_MODE ? getStickerUrl(path).replace('/results/', '/thumbs/') : getStickerUrl(path)}
                                                alt="Ungrouped"
                                                className="w-full h-full scale-90"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </div>

            {/* Focused Modal */}
            <AnimatePresence>
                {focusedSticker && expandedGroup !== null && (
                    <StickerModal
                        stickerPath={focusedSticker}
                        onClose={() => setFocusedSticker(null)}
                        onChangeSticker={setFocusedSticker}
                        siblings={clusterData.groups.find(g => g.id === expandedGroup)?.sticker_paths.map(p => getStickerUrl(p)) || []}
                    />
                )}
                {/* Handle focused sticker for ungrouped items too? Need siblings logic */}
                {focusedSticker && expandedGroup === null && (
                    <StickerModal
                        stickerPath={focusedSticker}
                        onClose={() => setFocusedSticker(null)}
                        onChangeSticker={setFocusedSticker}
                        siblings={clusterData.ungrouped.map(p => getStickerUrl(p))}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};
