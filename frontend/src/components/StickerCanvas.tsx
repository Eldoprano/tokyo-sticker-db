import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface StickerLayout {
    x: number;
    y: number;
    rotation: number;
    scale: number;
    zIndex: number;
    id: string; // url as id
}

interface StickerCanvasProps {
    stickers: any[]; // relaxed type for now to match store
    stickerSize: number;
}

export const StickerCanvas: React.FC<StickerCanvasProps> = ({ stickers, stickerSize }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [layout, setLayout] = useState<StickerLayout[]>([]);
    const [focusedSticker, setFocusedSticker] = useState<string | null>(null);
    const [highestZ, setHighestZ] = useState(10);

    // Track drag state to prevent click triggering
    const isDragging = useRef(false);

    // Initial Placement Algorithm
    useEffect(() => {
        if (!containerRef.current || stickers.length === 0) return;

        const container = containerRef.current;
        const width = container.offsetWidth;
        const height = container.offsetHeight;

        // Settings - Use prop
        // const stickerSize is passed in props
        const newLayout: StickerLayout[] = [];

        // Simple collision check
        stickers.forEach((sticker: any, idx) => {
            let bestX = 0;
            let bestY = 0;
            let bestRotation = 0;
            let placed = false;

            // Try 50 times to find a spot with no heavy overlap
            for (let i = 0; i < 50; i++) {
                const x = Math.random() * (width - stickerSize);
                const y = Math.random() * (height - stickerSize);
                const rotation = Math.random() * 40 - 20; // -20 to 20 deg

                // Check collision with already placed
                // We define collision as center-point being too close
                // Threshold = stickerSize * 0.5 (allow overlap but avoid stacking)
                const collision = newLayout.some(item => {
                    const dist = Math.hypot(item.x - x, item.y - y);
                    return dist < (stickerSize * 0.5);
                });

                if (!collision) {
                    bestX = x;
                    bestY = y;
                    bestRotation = rotation;
                    placed = true;
                    break;
                }
            }

            if (!placed) {
                // If failed, place randomly
                bestX = Math.random() * (width - stickerSize);
                bestY = Math.random() * (height - stickerSize);
                bestRotation = Math.random() * 40 - 20;
            }

            newLayout.push({
                id: sticker.path, // Use path as ID
                x: bestX,
                y: bestY,
                rotation: bestRotation,
                scale: 1,
                zIndex: idx + 1
            });
        });

        setLayout(newLayout);

    }, [stickers, stickerSize]); // Depend on size

    const bringToFront = (url: string) => {
        setHighestZ(prev => prev + 1);
        setLayout(prev => prev.map(item =>
            item.id === url ? { ...item, zIndex: highestZ + 1 } : item
        ));
    };

    return (
        <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-black/20 rounded-xl border border-white/5">
            {/* Background Hint */}
            {stickers.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                    No stickers to display
                </div>
            )}

            <p className="absolute top-4 left-4 text-xs text-white/30 pointer-events-none z-0">
                Drag to move • Click to expand
            </p>

            {layout.map((item) => (
                <motion.div
                    key={item.id}
                    layoutId={`sticker-${item.id}`} // Shared layout ID
                    style={{
                        x: item.x,
                        y: item.y,
                        rotate: item.rotation,
                        zIndex: item.zIndex,
                        position: 'absolute',
                        width: stickerSize,
                        height: stickerSize,
                        cursor: 'grab'
                    }}
                    drag
                    dragMomentum={false}
                    dragConstraints={containerRef}
                    whileDrag={{ scale: 1.1, cursor: 'grabbing', zIndex: highestZ + 10 }}
                    whileHover={{ scale: 1.05 }}
                    onDragStart={() => {
                        isDragging.current = true;
                        bringToFront(item.id);
                    }}
                    onDragEnd={() => {
                        // Small delay to prevent click firing immediately
                        setTimeout(() => isDragging.current = false, 50);
                    }}
                    onClick={() => {
                        if (!isDragging.current) {
                            bringToFront(item.id);
                            setFocusedSticker(item.id);
                        }
                    }}
                >
                    <img
                        src={item.id}
                        alt="Sticker"
                        className="w-full h-full object-contain drop-shadow-2xl pointer-events-none select-none"
                    />
                </motion.div>
            ))}

            {/* Focused Overlay */}
            <AnimatePresence>
                {focusedSticker && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-8"
                        onClick={() => setFocusedSticker(null)}
                    >
                        <motion.div
                            layoutId={`sticker-${focusedSticker}`}
                            className="relative max-w-full max-h-full flex items-center justify-center"
                            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking image
                        >
                            <button
                                className="absolute -top-4 -right-4 bg-white/10 hover:bg-white/30 p-2 rounded-full text-white transition-colors z-20"
                                onClick={() => setFocusedSticker(null)}
                            >
                                <X size={20} />
                            </button>
                            <img
                                src={focusedSticker}
                                alt="Focused Sticker"
                                className="max-w-full max-h-[80vh] object-contain drop-shadow-[0_0_50px_rgba(255,255,255,0.2)]"
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
