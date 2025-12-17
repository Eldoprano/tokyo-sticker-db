import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { useStore, STATIC_MODE } from '../store';
import { getSourceUrl } from '../utils';

interface StickerModalProps {
    stickerPath: string | null;
    onClose: () => void;
    onChangeSticker: (path: string) => void;
    siblings?: string[]; // For navigation
}

const API_Base = STATIC_MODE ? '.' : 'http://localhost:8000';

const getStickerUrl = (path: string) => {
    if (path.startsWith('http')) return path;
    return `${API_Base}${path}`;
};

export const StickerModal: React.FC<StickerModalProps> = ({ stickerPath, onClose, onChangeSticker, siblings }) => {
    const { clusterData, fetchClusters, images } = useStore();
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number, y: number } | null>(null);
    const imageRef = useRef<HTMLDivElement>(null);

    // Ensure cluster data is loaded
    useEffect(() => {
        if (clusterData.groups.length === 0 && !clusterData.loading) {
            fetchClusters();
        }
    }, []);

    // Reset zoom on sticker change
    useEffect(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    }, [stickerPath]);

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();

            if (stickerPath && siblings && siblings.length > 0) {
                // Use normalize for comparison
                const normalizePath = (p: string) => {
                    let path = p.replace(API_Base, '').replace(/^\/?static\//, '').replace(/^\/?/, '');
                    path = path.replace(/^(results|thumbs|uploads)\//, '');
                    return path.replace(/\.[^/.]+$/, "");
                };

                const normTarget = normalizePath(stickerPath);
                const currentIndex = siblings.findIndex(s => normalizePath(getStickerUrl(s)) === normTarget || normalizePath(s) === normTarget);

                if (currentIndex === -1) return;

                if (e.key === 'ArrowRight') {
                    const nextIndex = (currentIndex + 1) % siblings.length;
                    onChangeSticker(siblings[nextIndex]);
                } else if (e.key === 'ArrowLeft') {
                    const prevIndex = (currentIndex - 1 + siblings.length) % siblings.length;
                    onChangeSticker(siblings[prevIndex]);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [stickerPath, siblings, onClose, onChangeSticker]);

    if (!stickerPath) return null;

    // In static mode, if we get a thumbnail path, upgrade to full size for the modal
    const fullResPath = (STATIC_MODE && stickerPath.includes('/thumbs/'))
        ? stickerPath.replace('/thumbs/', '/results/')
        : stickerPath;

    // Normalized Path Matching
    const normalize = (p: string) => {
        let path = p.replace(API_Base, '').replace(/^\/?static\//, '').replace(/^\/?/, '');
        path = path.replace(/^(results|thumbs|uploads)\//, '');
        // Remove uuid prefix if present logic? No, just keep uuid + filename.
        // But some paths might have different extensions (png vs jpg).
        // Remove extension.
        return path.replace(/\.[^/.]+$/, "");
    };

    const currentGroup = clusterData.groups.find(g =>
        g.sticker_paths.some(p => normalize(getStickerUrl(p)) === normalize(fullResPath))
    );

    // Get Source URL
    let sourceUrl: string | null | undefined;

    if (STATIC_MODE) {
        // remove API_Base ('.') and leading slash
        // normalize keys to always look up via result path, not thumb path
        const relPath = fullResPath.replace(/^\.\//, '/').replace(/^\./, '');
        sourceUrl = clusterData.task_metadata?.[relPath]?.source_url;
    } else {
        const storeImage = images.find(img => img.resultUrls?.some(r => r.path === stickerPath));
        sourceUrl = storeImage?.metadata?.source_url;
    }

    if (!sourceUrl) sourceUrl = getSourceUrl(stickerPath);

    // Zoom Handlers
    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = e.deltaY * -0.001;
        const newScale = Math.min(Math.max(0.5, scale + delta), 5);
        setScale(newScale);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !dragStartRef.current) return;
        setPosition({
            x: e.clientX - dragStartRef.current.x,
            y: e.clientY - dragStartRef.current.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center overflow-hidden"
            onClick={onClose}
        >
            {/* Main Content Area */}
            <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden" onWheel={handleWheel}>
                {/* Close Button */}
                <button
                    className="absolute top-4 right-4 bg-white/10 hover:bg-white/30 p-2 rounded-full text-white transition-colors z-50"
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                >
                    <X size={24} />
                </button>

                {/* Sticker Container */}
                <div
                    ref={imageRef}
                    className="relative cursor-grab active:cursor-grabbing"
                    style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                        transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onClick={(e) => e.stopPropagation()}
                >
                    <img
                        src={fullResPath}
                        alt="Focused"
                        className="max-h-[70vh] max-w-[90vw] object-contain drop-shadow-[0_0_50px_rgba(255,255,255,0.2)] pointer-events-none select-none"
                    />
                </div>

                {/* Source Link Overlay - Positioned relative to screen usually, or we can put it under the image if scale is 1 */}
                {sourceUrl && (
                    <div className="absolute bottom-24 md:bottom-32 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
                        <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-5 py-2.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-all text-sm font-bold border border-white/10 group pointer-events-auto shadow-xl backdrop-blur-sm"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 fill-current"><g><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></g></svg>
                            <span>Source</span>
                            <ExternalLink size={14} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                        </a>
                    </div>
                )}
            </div>

            {/* Group Strip */}
            {currentGroup && currentGroup.sticker_paths.length > 1 && (
                <div
                    className="w-full h-24 md:h-28 bg-black/80 border-t border-white/10 backdrop-blur-md shrink-0 flex flex-col z-50"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-4 py-1 text-xs text-gray-400 font-medium flex items-center justify-between border-b border-white/5">
                        <span>Similar Stickers (Group {currentGroup.id + 1})</span>
                        <span>{currentGroup.count} items</span>
                    </div>
                    <div className="flex-1 overflow-x-auto overflow-y-hidden p-3 flex items-center gap-3 custom-scrollbar">
                        {currentGroup.sticker_paths.map((path, idx) => {
                            const fullPath = getStickerUrl(path);
                            const isActive = normalize(fullPath) === normalize(stickerPath);

                            return (
                                <button
                                    key={idx}
                                    onClick={() => onChangeSticker(fullPath)}
                                    className={`relative h-full aspect-square rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${isActive ? 'border-accent-primary scale-105 ring-2 ring-accent-primary/20' : 'border-transparent hover:border-white/50 opacity-60 hover:opacity-100'}`}
                                >
                                    <img
                                        src={fullPath}
                                        alt=""
                                        loading="lazy"
                                        className="w-full h-full object-contain bg-white/5"
                                    />
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </motion.div>
    );
};
