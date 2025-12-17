import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Magnet, Zap } from 'lucide-react';

interface PhysicsNode {
    id: string;
    path: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    isDragging: boolean;
}

interface PhysicsCanvasProps {
    stickers: Array<{ path: string; box?: number[]; score?: number }>;
    stickerSize: number;
    onStickerClick?: (path: string) => void;
}

export const PhysicsCanvas: React.FC<PhysicsCanvasProps> = ({
    stickers,
    stickerSize,
    onStickerClick
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const nodesRef = useRef<PhysicsNode[]>([]);
    const frameRef = useRef<number>(0);
    const lastRenderRef = useRef<number>(0);
    const [renderTick, setRenderTick] = useState(0);

    // Canvas transform (pan/zoom)
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const isPanningRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const lastTouchRef = useRef<{ x: number, y: number } | null>(null);
    const lastPinchDistRef = useRef<number | null>(null);

    // Physics controls
    const [attraction, setAttraction] = useState(0.0003);
    const [repulsion, setRepulsion] = useState(600);
    const [showControls, setShowControls] = useState(false);

    // Focused sticker modal
    const [focusedSticker, setFocusedSticker] = useState<string | null>(null);

    // Drag state
    const draggingIdRef = useRef<string | null>(null);
    const mouseCanvasRef = useRef({ x: 0, y: 0 });

    // Initialize nodes from stickers
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const width = container.clientWidth || 800;
        const height = container.clientHeight || 600;
        const centerX = width / 2;
        const centerY = height / 2;

        // Identify active IDs in the new stickers list
        const activeIds = new Set<string>();
        const newNodes: PhysicsNode[] = [];

        stickers.forEach((sticker, i) => {
            const id = `${sticker.path}-${i}`;
            activeIds.add(id);

            // If checking by checking if ID exists in current nodes
            const exists = nodesRef.current.some(n => n.id === id);

            if (!exists) {
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * Math.min(width, height) * 0.3 + 50;
                newNodes.push({
                    id,
                    path: sticker.path,
                    x: centerX + Math.cos(angle) * radius,
                    y: centerY + Math.sin(angle) * radius,
                    vx: (Math.random() - 0.5) * 2,
                    vy: (Math.random() - 0.5) * 2,
                    size: stickerSize,
                    isDragging: false
                });
            }
        });

        // Filter out nodes that are no longer in the stickers list
        nodesRef.current = nodesRef.current
            .filter(n => activeIds.has(n.id))
            .map(n => ({ ...n, size: stickerSize }));

        // Add new nodes
        nodesRef.current = [...nodesRef.current, ...newNodes];

        // Trigger re-render to show/hide nodes based on new state
        setRenderTick(n => n + 1);
    }, [stickers, stickerSize]);

    // Physics loop - optimized
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const tick = (timestamp: number) => {
            const nodes = nodesRef.current;
            if (nodes.length === 0) {
                // Even if empty, we might need to clear the canvas if it wasn't empty before
                if (frameRef.current) {
                    // Check if we need to force update to clear visual state
                    // We can just rely on the fact that we updated nodesRef in useEffect
                    // But we need to cycle the render to reflect the empty array
                }
                frameRef.current = requestAnimationFrame(tick);
                // forceUpdate(n => n + 1); // This would cause infinite loop if we don't throttle
                return;
            }

            const width = container.clientWidth || 800;
            const height = container.clientHeight || 600;
            const centerX = width / 2;
            const centerY = height / 2;

            const friction = 0.9;
            const boundaryForce = 0.02;

            // Physics calculations
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (node.isDragging) {
                    node.x = mouseCanvasRef.current.x;
                    node.y = mouseCanvasRef.current.y;
                    node.vx = 0;
                    node.vy = 0;
                    continue;
                }

                // Attraction to center
                const dx = centerX - node.x;
                const dy = centerY - node.y;
                node.vx += dx * attraction;
                node.vy += dy * attraction;

                // Repulsion (optimized: skip if too far)
                for (let j = i + 1; j < nodes.length; j++) {
                    const other = nodes[j];
                    const rx = node.x - other.x;
                    const ry = node.y - other.y;
                    const distSq = rx * rx + ry * ry || 1;
                    const minDist = (node.size + other.size) / 2 + 15;
                    const minDistSq = minDist * minDist * 2;

                    if (distSq < minDistSq) {
                        const dist = Math.sqrt(distSq);
                        const force = repulsion / distSq;
                        const fx = (rx / dist) * force;
                        const fy = (ry / dist) * force;
                        node.vx += fx;
                        node.vy += fy;
                        other.vx -= fx;
                        other.vy -= fy;
                    }
                }

                // Soft boundary (infinite canvas, but gentle pull back)
                const softBoundary = 300;
                if (node.x < -softBoundary) node.vx += boundaryForce * (-softBoundary - node.x) * -0.01;
                if (node.x > width + softBoundary) node.vx -= boundaryForce * (node.x - width - softBoundary) * 0.01;
                if (node.y < -softBoundary) node.vy += boundaryForce * (-softBoundary - node.y) * -0.01;
                if (node.y > height + softBoundary) node.vy -= boundaryForce * (node.y - height - softBoundary) * 0.01;

                // Apply velocity
                node.vx *= friction;
                node.vy *= friction;
                node.x += node.vx;
                node.y += node.vy;
            }

            // Throttle DOM updates to ~30fps
            if (timestamp - lastRenderRef.current > 33) {
                lastRenderRef.current = timestamp;
                setRenderTick(n => n + 1);
            }

            frameRef.current = requestAnimationFrame(tick);
        };

        frameRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameRef.current);
    }, [attraction, repulsion, transform.x, transform.y, transform.scale]);

    // Touch Handlers
    const getTouchDistance = (t1: React.Touch, t2: React.Touch) => {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.hypot(dx, dy);
    };

    const getTouchCenter = (t1: React.Touch, t2: React.Touch) => {
        return {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2
        };
    };

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        e.preventDefault(); // Prevent scrolling
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            lastTouchRef.current = { x: touch.clientX, y: touch.clientY };

            // Check if tapping a node
            // Note: We need a way to detect node hit from touch coordinates if we want to support dragging nodes via touch on the main canvas handler.
            // But usually the node's own event handler would fire? 
            // `e.target` check is tricky with touch.
            // Let's rely on standard events bubbling.
            // If the user touches a node's div, that div's onTouchStart could fire? 
            // We haven't added onTouchStart to the nodes yet. We should.
            // For now, let's support Panning with 1 finger on background.
            // If the target is the container, it's a pan.
            if ((e.target as HTMLElement).dataset.pannable) {
                isPanningRef.current = true;
            }
        } else if (e.touches.length === 2) {
            isPanningRef.current = false; // Stop panning
            draggingIdRef.current = null; // Stop dragging
            lastPinchDistRef.current = getTouchDistance(e.touches[0], e.touches[1]);
        }
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        if (e.touches.length === 1 && isPanningRef.current && lastTouchRef.current) {
            const touch = e.touches[0];
            const dx = touch.clientX - lastTouchRef.current.x;
            const dy = touch.clientY - lastTouchRef.current.y;
            setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
            lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
        } else if (e.touches.length === 1 && draggingIdRef.current) {
            const touch = e.touches[0];
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                const canvasX = (touch.clientX - rect.left - transform.x) / transform.scale;
                const canvasY = (touch.clientY - rect.top - transform.y) / transform.scale;
                mouseCanvasRef.current = { x: canvasX, y: canvasY };
            }
        } else if (e.touches.length === 2 && lastPinchDistRef.current) {
            const newDist = getTouchDistance(e.touches[0], e.touches[1]);
            const center = getTouchCenter(e.touches[0], e.touches[1]);
            const rect = containerRef.current?.getBoundingClientRect();

            if (newDist > 10 && rect) {
                const scaleChange = newDist / lastPinchDistRef.current;
                const newScale = Math.max(0.2, Math.min(3, transform.scale * scaleChange));

                // Zoom towards center of pinch
                // Helper: calculate zoom relative to a point
                // current point in canvas space
                const centerX = center.x - rect.left;
                const centerY = center.y - rect.top;

                // We want (centerX, centerY) to stay at the same screen position
                // newX = centerX - (centerX - oldX) * (newScale / oldScale)
                // Wait, simplified:
                const actualScaleChange = newScale / transform.scale;
                const newX = centerX - (centerX - transform.x) * actualScaleChange;
                const newY = centerY - (centerY - transform.y) * actualScaleChange;

                setTransform({ x: newX, y: newY, scale: newScale });
                lastPinchDistRef.current = newDist;
            }
        }
    }, [transform]);

    const handleTouchEnd = useCallback(() => {
        isPanningRef.current = false;
        if (draggingIdRef.current) {
            const node = nodesRef.current.find(n => n.id === draggingIdRef.current);
            if (node) node.isDragging = false;
            draggingIdRef.current = null;
        }
        lastPinchDistRef.current = null;
        lastTouchRef.current = null;
    }, []);

    // Mouse handlers for drag & pan
    const handleMouseDown = useCallback((id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        draggingIdRef.current = id;
        const node = nodesRef.current.find(n => n.id === id);
        if (node) node.isDragging = true;
    }, []);

    const handleBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.target === containerRef.current || (e.target as HTMLElement).dataset.pannable) {
            isPanningRef.current = true;
            lastMouseRef.current = { x: e.clientX, y: e.clientY };
        }
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        // Update canvas-space mouse position for dragging
        const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
        const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
        mouseCanvasRef.current = { x: canvasX, y: canvasY };

        // Handle panning
        if (isPanningRef.current) {
            const dx = e.clientX - lastMouseRef.current.x;
            const dy = e.clientY - lastMouseRef.current.y;
            setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
            lastMouseRef.current = { x: e.clientX, y: e.clientY };
        }
    }, [transform]);

    const handleMouseUp = useCallback(() => {
        if (draggingIdRef.current) {
            const node = nodesRef.current.find(n => n.id === draggingIdRef.current);
            if (node) node.isDragging = false;
            draggingIdRef.current = null;
        }
        isPanningRef.current = false;
    }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.2, Math.min(3, transform.scale * zoomFactor));

        // Zoom towards mouse position
        const scaleChange = newScale / transform.scale;
        const newX = mouseX - (mouseX - transform.x) * scaleChange;
        const newY = mouseY - (mouseY - transform.y) * scaleChange;

        setTransform({ x: newX, y: newY, scale: newScale });
    }, [transform]);

    const handleStickerClick = useCallback((path: string) => {
        if (onStickerClick) {
            onStickerClick(path);
        } else {
            setFocusedSticker(path);
        }
    }, [onStickerClick]);

    // Viewport culling: only render nodes visible on screen
    const visibleNodes = useMemo(() => {
        const container = containerRef.current;
        if (!container) return nodesRef.current;

        const width = container.clientWidth || 800;
        const height = container.clientHeight || 600;
        const buffer = 200; // Render nodes slightly outside viewport for smooth scrolling

        // Calculate viewport bounds in canvas space (inverse transform)
        const viewLeft = -transform.x / transform.scale;
        const viewTop = -transform.y / transform.scale;
        const viewRight = (width - transform.x) / transform.scale;
        const viewBottom = (height - transform.y) / transform.scale;

        return nodesRef.current.filter(node =>
            node.x + node.size / 2 > viewLeft - buffer &&
            node.x - node.size / 2 < viewRight + buffer &&
            node.y + node.size / 2 > viewTop - buffer &&
            node.y - node.size / 2 < viewBottom + buffer
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transform, renderTick]); // renderTick triggers recalculation when physics updates

    return (
        <div
            ref={containerRef}
            className="w-full h-full relative overflow-hidden bg-gradient-to-br from-black/40 to-black/20 rounded-xl border border-white/5 cursor-grab active:cursor-grabbing"
            onMouseDown={handleBackgroundMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
            data-pannable="true"
        >
            {/* Transform container */}
            <div
                className="absolute inset-0 origin-top-left pointer-events-none"
                style={{
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                }}
            >
                {visibleNodes.map((node) => (
                    <div
                        key={node.id}
                        className="absolute pointer-events-auto cursor-grab active:cursor-grabbing select-none"
                        style={{
                            left: node.x - node.size / 2,
                            top: node.y - node.size / 2,
                            width: node.size,
                            height: node.size,
                            zIndex: node.isDragging ? 100 : 1,
                            filter: node.isDragging
                                ? 'drop-shadow(0 15px 30px rgba(0,0,0,0.6))'
                                : 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
                            transition: node.isDragging ? 'none' : 'filter 0.2s'
                        }}
                        onMouseDown={(e) => handleMouseDown(node.id, e)}
                        onTouchStart={(e) => {
                            e.stopPropagation();
                            draggingIdRef.current = node.id;
                            const n = nodesRef.current.find(item => item.id === node.id);
                            if (n) n.isDragging = true;
                        }}
                        onDoubleClick={() => handleStickerClick(node.path)}
                    >
                        <img
                            src={node.path}
                            className="w-full h-full object-contain pointer-events-none"
                            draggable={false}
                        />
                    </div>
                ))}
            </div>

            {/* Controls Toggle */}
            <button
                className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-lg text-white/70 hover:text-white transition-colors z-20"
                onClick={() => setShowControls(!showControls)}
                title="Physics Controls"
            >
                <Zap size={16} />
            </button>

            {/* Physics Controls Panel */}
            <AnimatePresence>
                {showControls && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="absolute top-14 right-4 w-48 p-3 bg-black/80 backdrop-blur-md rounded-xl border border-white/10 z-20"
                    >
                        <div className="space-y-3">
                            <div>
                                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                                    <span className="flex items-center gap-1"><Magnet size={10} /> Attraction</span>
                                    <span>{(attraction * 10000).toFixed(1)}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="0.002"
                                    step="0.0001"
                                    value={attraction}
                                    onChange={(e) => setAttraction(parseFloat(e.target.value))}
                                    className="w-full accent-blue-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div>
                                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                                    <span className="flex items-center gap-1"><Zap size={10} /> Repulsion</span>
                                    <span>{repulsion}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="2000"
                                    step="50"
                                    value={repulsion}
                                    onChange={(e) => setRepulsion(parseFloat(e.target.value))}
                                    className="w-full accent-orange-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div className="text-[10px] text-gray-500 pt-1 border-t border-white/5">
                                Scroll to zoom • Drag to pan
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Zoom indicator */}
            <div className="absolute bottom-4 left-4 text-xs text-white/30 pointer-events-none">
                {Math.round(transform.scale * 100)}%
            </div>

            {/* Hint */}
            <p className="absolute top-4 left-4 text-xs text-white/20 pointer-events-none">
                Drag stickers • Double-click to expand
            </p>

            {/* Focused Modal */}
            <AnimatePresence>
                {focusedSticker && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-8"
                        onClick={() => setFocusedSticker(null)}
                    >
                        <motion.div
                            className="relative max-w-full max-h-full flex items-center justify-center"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                className="absolute -top-4 -right-4 bg-white/10 hover:bg-white/30 p-2 rounded-full text-white transition-colors z-20"
                                onClick={() => setFocusedSticker(null)}
                            >
                                <X size={20} />
                            </button>
                            <img
                                src={focusedSticker}
                                alt="Focused"
                                className="max-w-full max-h-[85vh] object-contain drop-shadow-[0_0_50px_rgba(255,255,255,0.2)]"
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
