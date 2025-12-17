import { create } from 'zustand';
import axios from 'axios';

// Static mode detection - set by vite.config.static.ts
export const STATIC_MODE = import.meta.env.VITE_STATIC_MODE === 'true';

// Types
export interface StickerImage {
  id: string; // The backend task ID
  file: File | null;
  previewUrl: string;
  originalUrl: string; // The URL to the original uploaded image
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultUrls: { path: string; box: number[]; score: number }[]; // Extracted sticker URLs with metadata
  overlayUrl?: string; // URL to the overlay visualization
  error?: string;
  priority: number;
  hash?: string; // File hash for reuse checks
  metadata?: {
    source_url?: string;
    artist?: string;
  };
  createdAt: number;
}

export interface ClusterGroup {
  id: number;
  sticker_paths: string[];
  count: number;
}

export interface ClusterData {
  groups: ClusterGroup[];
  ungrouped: string[];
  total_grouped: number;
  total_ungrouped: number;
  loading: boolean;
  cached: boolean;
  progress: {
    status: string;
    total: number;
    current: number;
    estimated_remaining: number;
  };
  embedding_map?: Array<{ path: string; x: number; y: number; z?: number; cluster_id: number }>;
  task_metadata?: Record<string, { source_url?: string; artist?: string }>;
}

export interface SegmentationProgress {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

interface AppState {
  images: StickerImage[];
  selectedImageId: string | null;
  theme: 'dark' | 'light';
  modelParams: {
    iouThreshold: number;
    scoreThreshold: number;
  };

  // Actions
  uploadImages: (files: File[]) => Promise<void>;
  selectImage: (id: string) => void;
  updatePriority: (id: string, priority: number) => void;
  toggleTheme: () => void;
  updateModelParams: (params: Partial<{ iouThreshold: number; scoreThreshold: number }>) => void;
  regenerateTask: (taskId: string) => Promise<void>;
  deleteTask: (imageId: string) => Promise<void>;
  // Polling helper
  checkStatus: () => Promise<void>;

  // Global View Navigation
  currentView: 'home' | 'editor' | 'global' | 'grouped' | 'embedding-map';
  setCurrentView: (view: 'home' | 'editor' | 'global' | 'grouped' | 'embedding-map') => void;

  // Clustering
  clusterData: ClusterData;
  triggerClustering: () => Promise<void>;
  fetchClusters: () => Promise<void>;
  fetchTasks: () => Promise<void>;
  initStatic: () => Promise<void>;

  // Segmentation Progress
  segmentationProgress: SegmentationProgress;

  // Cluster Parameters
  clusterParams: {
    minClusterSize: number;
    minSamples: number;
    clusterSelectionEpsilon: number;
  };
  setClusterParams: (params: { minClusterSize?: number; minSamples?: number; clusterSelectionEpsilon?: number }) => void;

  // UX State Persistence
  selectedArtists: string[];
  toggleArtist: (artist: string) => void;
  galleryScrollPosition: number;
  setGalleryScrollPosition: (pos: number) => void;
}

const API_Base = STATIC_MODE ? '' : 'http://localhost:8000';

export const useStore = create<AppState>((set, get) => ({
  images: [],
  selectedImageId: null,
  theme: 'dark', // Default
  currentView: 'home',
  modelParams: {
    iouThreshold: 0.8,
    scoreThreshold: 0.5
  },
  clusterData: {
    groups: [],
    ungrouped: [],
    total_grouped: 0,
    total_ungrouped: 0,
    loading: false,
    cached: false,
    progress: { status: 'idle', total: 0, current: 0, estimated_remaining: 0 }
  },
  segmentationProgress: {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0
  },
  clusterParams: {
    minClusterSize: 2,
    minSamples: 1,
    clusterSelectionEpsilon: 0.0
  },

  selectedArtists: [],
  galleryScrollPosition: 0,

  toggleArtist: (artist) => set(state => {
    // Toggle logic: If currently empty (showing all), and we click one -> select just that one.
    // If we have some selected, toggle standard.
    // If we deselect the last one -> empty (show all).

    const prev = new Set(state.selectedArtists);
    if (prev.size === 0) {
      return { selectedArtists: [artist] };
    }

    if (prev.has(artist)) {
      prev.delete(artist);
    } else {
      prev.add(artist);
    }
    return { selectedArtists: Array.from(prev) };
  }),

  setGalleryScrollPosition: (pos) => set({ galleryScrollPosition: pos }),

  setCurrentView: (view) => set({ currentView: view }),

  toggleTheme: () => set(state => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),

  updateModelParams: (params) => set(state => ({
    modelParams: { ...state.modelParams, ...params }
  })),

  deleteTask: async (imageId) => {
    try {
      await axios.delete(`${API_Base}/tasks/${imageId}`);

      set((s) => ({
        images: s.images.filter((i) => i.id !== imageId),
        selectedImageId: s.selectedImageId === imageId ? null : s.selectedImageId,
      }));
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  },

  setClusterParams: (params) => set(state => ({
    clusterParams: { ...state.clusterParams, ...params }
  })),

  fetchTasks: async () => {
    try {
      const res = await axios.get(`${API_Base}/tasks`);
      const tasks = res.data.map((t: any) => {
        // Map backend task to frontend StickerImage
        const filename = t.image_path.split('/').pop();
        return {
          id: t.task_id,
          file: null, // Not available from backend fetch
          previewUrl: `${API_Base}/static/uploads/${filename}`,
          originalUrl: `${API_Base}/static/uploads/${filename}`,
          status: t.status,
          resultUrls: (t.result_paths || []).map((item: any) => ({
            ...item,
            path: item.path?.startsWith('http') ? item.path : `${API_Base}${item.path}`
          })),
          overlayUrl: t.overlay_path ? `${API_Base}${t.overlay_path}` : undefined,
          error: t.error,
          priority: 2, // Default
          // hash: undefined // We lose hash on reload, but that's ok

          metadata: t.metadata,
          createdAt: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
        };
      });
      set({ images: tasks });
    } catch (e) {
      console.error("Failed to fetch tasks", e);
    }
  },

  uploadImages: async (files: File[]) => {
    // 1. Upload files
    // 2. Create tasks with Priority 2 (Low/Batch) by default
    // 3. Add to store

    // We'll upload sequentially or in parallel. Parallel is better.
    const uploads = files.map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      // Pass relative path if available (for directory uploads)
      const relativePath = (file as any).webkitRelativePath;
      if (relativePath) {
        formData.append('relative_path', relativePath);
      }

      try {
        const uploadRes = await axios.post(`${API_Base}/upload`, formData);
        const { path, url, hash, metadata } = uploadRes.data;

        // Create Task - pass hash to attempt reuse
        const taskRes = await axios.post(`${API_Base}/segment/task`, {
          image_path: path,
          priority: 2, // Default batch priority
          file_hash: hash,
          metadata: metadata
        });

        // If reused, status might be completed already
        const initialStatus = taskRes.data.reused && taskRes.data.status === 'completed' ? 'completed' : 'pending';

        return {
          id: taskRes.data.task_id,
          file: file,
          previewUrl: URL.createObjectURL(file),
          originalUrl: `${API_Base}${url}`,
          status: initialStatus,
          resultUrls: [],
          priority: 2,
          hash: hash,
          metadata: metadata,
          createdAt: Date.now(),
        } as StickerImage;
      } catch (err) {
        console.error("Upload failed", err);
        return null;
      }
    });

    const results = await Promise.all(uploads);
    const validResults = results.filter(r => r !== null) as StickerImage[];

    set(state => {
      const newSelectedId = state.selectedImageId || (validResults[0] ? validResults[0].id : null);
      return {
        images: [...state.images, ...validResults],
        selectedImageId: newSelectedId,
        // Switch to editor view if we just selected an image
        currentView: newSelectedId ? 'editor' : state.currentView
      };
    });

    // If we just selected one, prioritize it
    const { selectedImageId, images } = get();

    if (selectedImageId && validResults.length > 0) {
      get().updatePriority(selectedImageId, 0);
      startPreFetchLogic(selectedImageId, images);
    }
  },

  selectImage: (id: string) => {
    set({ selectedImageId: id, currentView: id ? 'editor' : 'home' });
    if (!id) return;

    // Prioritize selected + Next 5
    get().updatePriority(id, 0); // High

    const { images } = get();
    startPreFetchLogic(id, images);
  },

  updatePriority: async (id: string, priority: number) => {
    // Optimistic update
    set(state => ({
      images: state.images.map(img => img.id === id ? { ...img, priority } : img)
    }));

    try {
      await axios.post(`${API_Base}/segment/priority`, { task_id: id, priority });
    } catch (e) {
      console.error("Priority update failed", e);
    }
  },

  checkStatus: async () => {
    const { images } = get();
    // Only check pending/processing

    // Only check pending/processing
    const active = images.filter(i => i.status !== 'completed' && i.status !== 'failed');

    if (active.length > 0) {
      const checks = active.map(async (img) => {
        try {
          const res = await axios.get(`${API_Base}/results/${img.id}`);
          const data = res.data;

          if (data.status !== img.status) {
            const resultUrls = (data.result_paths || []).map((item: any) => ({
              ...item,
              path: item.path.startsWith('http') ? item.path : `${API_Base}${item.path}`
            }));
            const overlayUrl = data.overlay_path ? (data.overlay_path.startsWith('http') ? data.overlay_path : `${API_Base}${data.overlay_path}`) : undefined;

            return { id: img.id, status: data.status, resultUrls, overlayUrl };
          }
        } catch (e) {
          // ignore
        }
        return null;
      });

      const updates = await Promise.all(checks);
      const updatesMap = new Map();
      updates.forEach(u => { if (u) updatesMap.set(u.id, u); });

      if (updatesMap.size > 0) {
        set(state => ({
          images: state.images.map(img => {
            const u = updatesMap.get(img.id);
            return u ? { ...img, status: u.status, resultUrls: u.resultUrls, overlayUrl: u.overlayUrl } : img;
          })
        }));
      }
    }

    // Check clustering status
    // We check if:
    // 1. We are explicitly loading (manual trigger)
    // 2. OR we have images and they are all done (potential auto-trigger)
    // 3. OR backend reports running (captured in previous check?)

    const { clusterData, fetchClusters } = get();
    // Always poll clustering status if we have images, to catch auto-trigger
    if (images.length > 0) {
      try {
        const res = await axios.get(`${API_Base}/cluster/status`);
        const status = res.data;

        // If running, ensure we are in loading state
        if (status.status === 'running') {
          set(state => ({
            clusterData: {
              ...state.clusterData,
              loading: true,
              progress: status
            }
          }));
        } else if (clusterData.loading && status.status === 'completed') {
          // Just finished
          set(state => ({
            clusterData: {
              ...state.clusterData,
              loading: false,
              progress: status
            }
          }));
          await fetchClusters();
        } else if (clusterData.loading && status.status === 'failed') {
          set(state => ({
            clusterData: { ...state.clusterData, loading: false, progress: status }
          }));
        }
      } catch (e) { /* ignore */ }
    }

    // Poll segmentation status
    try {
      const res = await axios.get(`${API_Base}/segment/status`);
      set({ segmentationProgress: res.data });
    } catch (e) { /* ignore */ }
  },

  regenerateTask: async (taskId: string) => {
    const { images, modelParams } = get();
    const img = images.find(i => i.id === taskId);
    if (!img) return;

    const urlObj = new URL(img.originalUrl);
    const relativePath = urlObj.pathname;

    try {
      // Set status to pending/processing immediately
      set(state => ({
        images: state.images.map(i => i.id === taskId ? { ...i, status: 'processing', resultUrls: [] } : i)
      }));

      // Trigger "fake" async duplicate call prevention? 
      // No, backend generates new ID.

      const res = await axios.post(`${API_Base}/segment/task`, {
        image_path: relativePath,
        priority: 0,
        iou_threshold: modelParams.iouThreshold,
        score_threshold: modelParams.scoreThreshold,
        file_hash: img.hash // Pass hash for reuse check
      });

      const newTaskId = res.data.task_id;

      set(state => ({
        selectedImageId: state.selectedImageId === taskId ? newTaskId : state.selectedImageId,
        images: state.images.map(i => i.id === taskId ? {
          ...i,
          id: newTaskId,
          status: 'pending',
          resultUrls: []
        } : i)
      }));

    } catch (e) {
      console.error("Regenerate failed", e);
      set(state => ({
        images: state.images.map(i => i.id === taskId ? { ...i, status: 'failed' } : i)
      }));
    }
  },

  triggerClustering: async () => {
    const { clusterParams } = get();
    set(state => ({
      clusterData: {
        ...state.clusterData,
        loading: true,
        progress: { status: 'starting', total: 0, current: 0, estimated_remaining: 0 }
      }
    }));

    try {
      const res = await axios.post(`${API_Base}/cluster`, {
        min_cluster_size: clusterParams.minClusterSize,
        min_samples: clusterParams.minSamples,
        cluster_selection_epsilon: clusterParams.clusterSelectionEpsilon
      });
      if (res.data.status === 'started' || res.data.status === 'already_running') {
        // Poll will handle update
      } else {
        // Direct result (fallback)
        set({
          clusterData: {
            groups: res.data.groups || [],
            ungrouped: res.data.ungrouped || [],
            total_grouped: res.data.total_grouped || 0,
            total_ungrouped: res.data.total_ungrouped || 0,
            loading: false,
            cached: true,
            progress: { status: 'completed', total: 0, current: 0, estimated_remaining: 0 }
          }
        });
      }
    } catch (e) {
      console.error("Clustering failed", e);
      set(state => ({
        clusterData: { ...state.clusterData, loading: false }
      }));
    }
  },

  fetchClusters: async () => {
    try {
      const res = await axios.get(`${API_Base}/clusters`);
      // Always update state if we have valid data
      if (res.data.groups || res.data.ungrouped || res.data.cached) {
        set({
          clusterData: {
            groups: res.data.groups || [],
            ungrouped: res.data.ungrouped || [],
            total_grouped: res.data.total_grouped || 0,
            total_ungrouped: res.data.total_ungrouped || 0,
            loading: false,
            cached: true,
            progress: { status: 'completed', total: 0, current: 0, estimated_remaining: 0 },
            embedding_map: res.data.embedding_map || []
          }
        });
      }
    } catch (e) {
      console.error("Fetch clusters failed", e);
    }
  },

  // Static mode: Load from bundled data.json
  initStatic: async () => {
    if (!STATIC_MODE) return;

    try {
      const res = await fetch('./data.json');
      const data = await res.json();

      set({
        clusterData: {
          groups: data.groups || [],
          ungrouped: data.ungrouped || [],
          total_grouped: data.total_grouped || 0,
          total_ungrouped: data.total_ungrouped || 0,
          loading: false,
          cached: true,
          progress: { status: 'completed', total: 0, current: 0, estimated_remaining: 0 },
          embedding_map: data.embedding_map || [],
          task_metadata: data.task_metadata || {}
        },
        currentView: 'home', // Start on home view (gallery)
        // Load tasks/images into state for the home view
        images: transformStaticTasks(data.task_metadata, data.groups, data.ungrouped, data.tasks)
      });
    } catch (e) {
      console.error("Failed to load static data", e);
    }
  }
}));

// Helper to reconstruct image list from static data
function transformStaticTasks(_taskMeta: any, _groups: any[], _ungrouped: string[], tasks: any[]): StickerImage[] {
  // In static mode, we reconstruct images from the exported tasks list
  if (!tasks || !Array.isArray(tasks)) return [];

  return tasks
    .filter(task => task.result_paths && task.result_paths.length > 0) // Only show images WITH stickers
    .map(task => {
      // Original path: /static/uploads/filename
      const originalName = task.image_path ? task.image_path.split('/').pop() : 'unknown.jpg';
      const originalUrl = `./static/uploads/${originalName}`; // Relative path

      const results = task.result_paths?.map((r: any) => ({
        path: `.${r.path}`, // Prepend . for relative path
        score: r.score || 1,
        box: r.box || [0, 0, 0, 0]
      })) || [];

      return {
        id: task.id || originalName, // Fallback ID
        file: null, // Static mode has no File objects
        previewUrl: originalUrl,
        originalUrl: originalUrl,
        status: 'completed',
        resultUrls: results,
        metadata: task.metadata,
        priority: 2, // Default for static
        createdAt: task.created_at || Date.now()
      };
    });
}

// Helper logic for 'Next 5'
function startPreFetchLogic(currentId: string, images: StickerImage[]) {
  const idx = images.findIndex(i => i.id === currentId);
  if (idx === -1) return;

  for (let i = 1; i <= 5; i++) {
    if (idx + i < images.length) {
      const nextImg = images[idx + i];
      if (nextImg.priority !== 1 && nextImg.priority !== 0 && nextImg.status === 'pending') {
        axios.post(`${API_Base}/segment/priority`, { task_id: nextImg.id, priority: 1 });
      }
    }
  }
}
