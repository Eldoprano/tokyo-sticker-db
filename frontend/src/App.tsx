import { useEffect, useRef } from 'react';
import { DropZone } from './components/DropZone';
import { Gallery } from './components/Gallery';
import { ImageViewer } from './components/ImageViewer';
import { useStore, STATIC_MODE } from './store';
import { Github } from 'lucide-react';

import { GlobalGallery } from './components/GlobalGallery';
import { GroupedGallery } from './components/GroupedGallery';
import { EmbeddingMap } from './components/EmbeddingMap';

const GITHUB_REPO_URL = 'https://github.com/Eldoprano/tokyo-sticker-db';

function App() {
  const { checkStatus, fetchTasks, initStatic, currentView, setCurrentView, clusterData } = useStore();
  const clusterLoading = clusterData.loading;
  const clusterCurrent = clusterData.progress?.current || 0;
  const clusterTotal = clusterData.progress?.total || 0;
  const clusterEstimate = clusterData.progress?.estimated_remaining || 0;
  const isSystemReady = true;

  // Initial fetch - static or dynamic
  useEffect(() => {
    if (STATIC_MODE) {
      initStatic();
    } else {
      fetchTasks();
    }
  }, [fetchTasks, initStatic]);

  // Polling for status updates (only in dynamic mode)
  useEffect(() => {
    if (STATIC_MODE) return;
    const interval = setInterval(() => {
      checkStatus();
    }, 2000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  // Set dark theme on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  // Scroll persistence for Home View
  const { galleryScrollPosition, setGalleryScrollPosition } = useStore();
  const homeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Restore scroll position when entering home view
    if (currentView === 'home' && homeContainerRef.current) {
      homeContainerRef.current.scrollTop = galleryScrollPosition;
    }
  }, [currentView, galleryScrollPosition]);

  return (
    <div className="h-screen bg-bg-dark text-text-primary transition-colors duration-300 font-sans flex flex-col overflow-hidden">
      {/* Header */}
      <header className="glass-panel mx-6 mt-6 p-4 flex justify-between items-center shrink-0 z-50">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('home')}>
          <div className="w-10 h-10 bg-accent-primary/20 rounded-2xl flex items-center justify-center shadow-lg overflow-hidden">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" className="w-6 h-6 text-accent-primary fill-current">
              {/* !Font Awesome Free v7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. */}
              <path d="M160 544C124.7 544 96 515.3 96 480L96 160C96 124.7 124.7 96 160 96L480 96C515.3 96 544 124.7 544 160L544 373.5C544 390.5 537.3 406.8 525.3 418.8L418.7 525.3C406.7 537.3 390.4 544 373.4 544L160 544zM485.5 368L392 368C378.7 368 368 378.7 368 392L368 485.5L485.5 368z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">TOKYO STICKER DB</h1>
            <p className="text-xs text-text-secondary uppercase tracking-widest">A work in progress</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Navigation actions */}
          <button
            onClick={() => setCurrentView('global')}
            className={`text-sm font-bold px-4 py-2 rounded-full transition-colors ${currentView === 'global' ? 'bg-white text-black' : 'hover:bg-white/10'}`}
          >
            ALL STICKERS
          </button>
          <button
            onClick={() => setCurrentView('grouped')}
            className={`text-sm font-bold px-4 py-2 rounded-full transition-colors ${currentView === 'grouped' ? 'bg-white text-black' : 'hover:bg-white/10'}`}
          >
            GROUPED
          </button>

          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            title="View on GitHub"
          >
            <Github size={20} />
          </a>

          {/* Clustering Progress - hide in static mode */}
          {!STATIC_MODE && clusterLoading && (
            <div className="flex flex-col w-40 gap-1 mr-2 px-3 py-1 bg-bg-dark/30 rounded-lg border border-white/5">
              <div className="flex justify-between text-[10px] font-bold text-accent-primary uppercase tracking-wider">
                <span>Clustering</span>
                <span>{clusterEstimate > 0 ? `${Math.ceil(clusterEstimate)}s` : '...'}</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-primary transition-all duration-300 ease-out"
                  style={{ width: `${(clusterCurrent / (clusterTotal || 1)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* System status - hide in static mode */}
          {!STATIC_MODE && (
            <div className="flex items-center gap-2 text-sm font-medium px-3 py-1 bg-bg-dark/50 rounded-full border border-white/5">
              <div className={`w-2 h-2 rounded-full ${isSystemReady ? 'bg-accent-primary animate-pulse' : 'bg-red-500'}`} />
              {isSystemReady ? 'SYSTEM ONLINE' : 'OFFLINE'}
            </div>
          )}
        </div>
      </header>

      {/* Main Content Router */}
      <main className="flex-1 flex flex-col gap-6 p-6 min-h-0 overflow-hidden">
        {currentView === 'global' ? (
          <GlobalGallery />
        ) : currentView === 'grouped' ? (
          <GroupedGallery />
        ) : currentView === 'embedding-map' ? (
          <EmbeddingMap />
        ) : currentView === 'home' ? (
          <div
            ref={homeContainerRef}
            onScroll={(e) => setGalleryScrollPosition(e.currentTarget.scrollTop)}
            className="flex-1 flex flex-col min-h-0 overflow-auto"
          >
            {!STATIC_MODE && <DropZone />}
            <Gallery />
          </div>
        ) : (
          // Editor View
          <>
            <div className="shrink-0">
              <Gallery compact />
            </div>
            <ImageViewer />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
