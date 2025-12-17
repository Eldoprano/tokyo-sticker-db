import React, { useCallback, useState, useRef } from 'react';
import { Upload, CloudLightning } from 'lucide-react';
import { useStore } from '../store';
import { motion } from 'framer-motion';

export const DropZone: React.FC = () => {
    const uploadImages = useStore(state => state.uploadImages);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dirInputRef = useRef<HTMLInputElement>(null);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setIsUploading(true);
            const files = Array.from(e.dataTransfer.files);
            await uploadImages(files);
            setIsUploading(false);
        }
    }, [uploadImages]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleClick = () => {
        inputRef.current?.click();
    };

    return (
        <motion.div
            className={`glass-panel p-8 text-center flex flex-col items-center justify-center cursor-pointer transition-all border-2 border-dashed
        ${isDragOver ? 'border-accent-primary bg-white/10' : 'border-white/20 hover:border-white/40'}
      `}
            layout
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleClick}
            style={{ minHeight: '300px' }}
        >
            <div className="mb-4 relative">
                <Upload size={48} className="text-accent-primary" />
                {isUploading && (
                    <motion.div
                        className="absolute inset-0 text-accent-pink"
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1 }}
                    >
                        <CloudLightning size={48} />
                    </motion.div>
                )}
            </div>

            <h3 className="text-xl font-bold mb-2">Drop Sticker Images Here</h3>
            <p className="text-text-secondary">
                or click to browse
            </p>
            <button
                className="mt-2 text-sm text-accent-primary hover:text-accent-pink underline z-10 relative"
                onClick={(e) => {
                    e.stopPropagation();
                    dirInputRef.current?.click();
                }}
            >
                Upload Directory
            </button>

            {isUploading && (
                <p className="mt-4 text-accent-secondary animate-pulse">Uploading & Queuing...</p>
            )}

            <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    if (e.target.files) {
                        setIsUploading(true);
                        uploadImages(Array.from(e.target.files)).then(() => setIsUploading(false));
                    }
                }}
            />
            <input
                ref={dirInputRef}
                type="file"
                multiple
                className="hidden"
                {...({ webkitdirectory: "", directory: "" } as any)}
                onChange={(e) => {
                    if (e.target.files) {
                        setIsUploading(true);
                        uploadImages(Array.from(e.target.files)).then(() => setIsUploading(false));
                    }
                }}
            />
        </motion.div>
    );
};
