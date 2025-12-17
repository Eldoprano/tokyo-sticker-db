import React, { useMemo, useState, useRef, Suspense } from 'react';
import { useStore, STATIC_MODE } from '../store';
import { ArrowLeft } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Billboard, Image as DreiImage } from '@react-three/drei';
import { StickerModal } from './StickerModal';

const API_Base = STATIC_MODE ? '.' : 'http://localhost:8000';

const CLUSTER_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8B500', '#00CED1', '#FF69B4', '#32CD32', '#FFD700'
];

interface MapNode {
    path: string;
    x: number;
    y: number;
    z?: number;
    clusterId: number;
}

export const EmbeddingMap: React.FC = () => {
    const { setCurrentView, clusterData, fetchClusters } = useStore();
    const containerRef = useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (clusterData.groups.length === 0) fetchClusters();
    }, []);


    const [focusedSticker, setFocusedSticker] = useState<string | null>(null);
    const [nodeSize, setNodeSize] = useState(40);


    const embeddingMap = (clusterData as any)?.embedding_map as MapNode[] | undefined;

    const clusterNodes = useMemo(() => {
        if (!embeddingMap) return [];
        const clusters = new Map<number, MapNode[]>();
        embeddingMap.forEach(node => {
            const id = (node as any).cluster_id ?? node.clusterId;
            if (!clusters.has(id)) clusters.set(id, []);
            clusters.get(id)!.push({ ...node, clusterId: id });
        });

        return Array.from(clusters.entries()).map(([clusterId, members]) => {
            const avgX = members.reduce((sum, m) => sum + m.x, 0) / members.length;
            const avgY = members.reduce((sum, m) => sum + m.y, 0) / members.length;
            const avgZ = members.reduce((sum, m) => sum + (m.z || 0), 0) / members.length;
            return {
                clusterId,
                representative: members[0], // Use first member as repr
                members,
                x: avgX, y: avgY, z: avgZ,
                color: clusterId === -1 ? '#666' : CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length]
            };
        });
    }, [embeddingMap]);

    // Calculate center of all nodes for camera positioning
    const mapCenter = useMemo(() => {
        if (clusterNodes.length === 0) return { x: 0, y: 0, z: 0 };
        const sumX = clusterNodes.reduce((sum, n) => sum + n.x, 0);
        const sumY = clusterNodes.reduce((sum, n) => sum + n.y, 0);
        const sumZ = clusterNodes.reduce((sum, n) => sum + n.z, 0);
        return {
            x: (sumX / clusterNodes.length) * 100,
            y: (sumY / clusterNodes.length) * 100,
            z: (sumZ / clusterNodes.length) * 100
        };
    }, [clusterNodes]);

    // Helper for URLs
    const getStickerUrl = (path: string) => {
        if (!path) return '';
        if (path.startsWith('http')) return path;
        const url = `${API_Base}${path}`;
        // Use thumbnails for map view icons to save memory/bandwidth
        if (STATIC_MODE && url.includes('/results/')) {
            return url.replace('/results/', '/thumbs/');
        }
        return url;
    };

    // Helper for Full Res URL (for passing to modal)
    const getFullStickerUrl = (path: string) => {
        if (!path) return '';
        if (path.startsWith('http')) return path;
        return `${API_Base}${path}`;
    };



    return (
        <div className="fixed inset-0 bg-bg-dark z-[100] flex flex-col">
            {/* 1. Header / Back Button - Top-Left (Always Visible) */}
            <div className="absolute top-4 left-6 z-[101]">
                <button
                    onClick={() => setCurrentView('grouped')}
                    className="p-3 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-black/80 hover:text-accent-primary transition-all border border-white/10 shadow-xl"
                    title="Back to Gallery"
                >
                    <ArrowLeft size={20} />
                </button>
            </div>

            {/* 2. Controls (Size Slider) - Below Header */}
            <div className="absolute top-16 left-6 z-[101] flex items-center gap-4 bg-black/60 backdrop-blur-md p-2 rounded-2xl border border-white/10 shadow-2xl">
                {/* Size Slider */}
                <div className="flex items-center gap-3 px-2">
                    <span className="text-xs font-bold text-white/50 uppercase tracking-wider">Size</span>
                    <input
                        type="range"
                        min="20" max="200"
                        value={nodeSize}
                        onChange={(e) => setNodeSize(Number(e.target.value))}
                        className="w-24 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-accent-primary hover:accent-accent-secondary transition-all"
                    />
                </div>
            </div>

            {/* Canvas - 3D Only */}
            <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden">
                <Canvas camera={{ position: [mapCenter.x, mapCenter.y, mapCenter.z + 100], fov: 60 }}>
                    <color attach="background" args={['#111']} />
                    <ambientLight intensity={0.5} />
                    <pointLight position={[100, 100, 100]} />
                    <OrbitControls target={[mapCenter.x, mapCenter.y, mapCenter.z]} />
                    {/* Granular Suspense with NO fallback (null) for progressive loading without placeholders */}
                    {clusterNodes.map((node, i) => (
                        <Suspense
                            key={i}
                            fallback={null}
                        >
                            <Billboard
                                position={[node.x * 100, node.y * 100, (node.z || 0) * 100]}
                            >
                                <DreiImage
                                    url={STATIC_MODE ? getStickerUrl(node.representative.path).replace('/results/', '/thumbs/') : getStickerUrl(node.representative.path)}
                                    scale={nodeSize / 10}
                                    transparent
                                    // @ts-ignore
                                    crossOrigin="anonymous"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setFocusedSticker(getFullStickerUrl(node.representative.path));
                                    }}
                                />
                            </Billboard>
                        </Suspense>
                    ))}
                </Canvas>
            </div>

            {/* Sticker Modal */}
            <AnimatePresence>
                {focusedSticker && (
                    <StickerModal
                        stickerPath={focusedSticker}
                        onClose={() => setFocusedSticker(null)}
                        onChangeSticker={setFocusedSticker}
                        siblings={clusterNodes.map(n => getFullStickerUrl(n.representative.path))}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};
