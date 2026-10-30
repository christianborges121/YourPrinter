import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PrinterProvider, usePrinter } from './context/PrinterContext';
import { Header } from './components/common/Header';
import { BottomNav } from './components/common/BottomNav';
import { DashboardScreen } from './components/dashboard/DashboardScreen';
import { FleetScreen } from './components/fleet/FleetScreen';
import { FilesScreen } from './components/files/FilesScreen';
import { SettingsScreen } from './components/settings/SettingsScreen';
import { WatchdogModal } from './components/modals/WatchdogModal';
import { CameraHudModal } from './components/modals/CameraHudModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import type { NavTab } from './types';

const AppContent: React.FC = () => {
  const {
    contexts,
    activeContextId,
    selectPrinterByIndex,
  } = usePrinter();

  const [activeTab, setActiveTab] = useState<NavTab>('device');
  const [watchdogModalOpen, setWatchdogModalOpen] = useState(false);
  const [cameraHudOpen, setCameraHudOpen] = useState(false);

  const suppressUrlPushRef = useRef(false);
  const initialRoutedRef = useRef(false);

  // Parse path into NavTab and optional 0-based printer index
  const parseRoute = useCallback(
    (pathname: string): { tab: NavTab; printerIndex: number | null } => {
      const raw = pathname.replace(/\/+$/, '') || '/';
      if (raw === '/dashboard') {
        return { tab: 'fleet', printerIndex: null };
      }
      if (raw === '/settings') {
        return { tab: 'settings', printerIndex: null };
      }
      if (raw === '/files') {
        return { tab: 'files', printerIndex: null };
      }
      const printerMatch = raw.match(/^\/printers(?:\/(\d+))?$/);
      if (printerMatch) {
        const idx = printerMatch[1] !== undefined ? parseInt(printerMatch[1], 10) : null;
        return { tab: 'device', printerIndex: idx };
      }
      // Root / empty: nothing defaults to dashboard -> device
      return { tab: 'device', printerIndex: null };
    },
    []
  );

  // Sync tab and printer index when browser back/forward buttons are clicked
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const { tab, printerIndex } = parseRoute(window.location.pathname);
      suppressUrlPushRef.current = true;
      setActiveTab(tab);
      if (printerIndex !== null && printerIndex >= 0 && printerIndex < contexts.length) {
        selectPrinterByIndex(printerIndex);
      }
      setTimeout(() => {
        suppressUrlPushRef.current = false;
      }, 50);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [parseRoute, contexts, selectPrinterByIndex]);

  // Handle initial page load and context hydration
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { tab, printerIndex } = parseRoute(window.location.pathname);
    setActiveTab(tab);

    const activeIdx = Math.max(
      contexts.findIndex((c) => c.contextId === activeContextId),
      0
    );

    if (window.location.pathname === '/' || window.location.pathname === '') {
      // Rule: nothing defaults to dashboard. Root routes to /printers/0 (or active index)
      const defaultPath = `/printers/${activeIdx}`;
      window.history.replaceState({ path: defaultPath }, '', defaultPath);
    } else if (tab === 'device' && printerIndex !== null && printerIndex >= 0 && contexts.length > 0) {
      if (printerIndex < contexts.length && contexts[printerIndex]?.contextId !== activeContextId) {
        selectPrinterByIndex(printerIndex);
      }
    }
    initialRoutedRef.current = true;
  }, [contexts, activeContextId, parseRoute, selectPrinterByIndex]);

  // Keep URL aligned when printer is changed on the device tab
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeTab === 'device' && !suppressUrlPushRef.current && contexts.length > 0) {
      const activeIdx = Math.max(
        contexts.findIndex((c) => c.contextId === activeContextId),
        0
      );
      const targetPath = `/printers/${activeIdx}`;
      if (window.location.pathname.startsWith('/printers') && window.location.pathname !== targetPath) {
        window.history.replaceState({ path: targetPath }, '', targetPath);
      }
    }
  }, [activeContextId, activeTab, contexts]);

  // Tab change handler syncing URL
  const handleTabChange = (newTab: NavTab) => {
    setActiveTab(newTab);
    if (suppressUrlPushRef.current || typeof window === 'undefined') return;

    let targetPath = '/printers/0';
    if (newTab === 'fleet') {
      targetPath = '/dashboard';
    } else if (newTab === 'settings') {
      targetPath = '/settings';
    } else if (newTab === 'files') {
      targetPath = '/files';
    } else if (newTab === 'device') {
      const activeIdx = Math.max(
        contexts.findIndex((c) => c.contextId === activeContextId),
        0
      );
      targetPath = `/printers/${activeIdx}`;
    }

    if (window.location.pathname !== targetPath) {
      window.history.pushState({ path: targetPath }, '', targetPath);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-[#F3F4F6] flex flex-col selection:bg-[#00AE42] selection:text-white">
      {/* Top Header Bar */}
      <Header
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenWatchdog={() => setWatchdogModalOpen(true)}
      />

      {/* Main View Area with Error Boundary */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full">
        <ErrorBoundary
          fallbackTitle={`Error displaying ${activeTab.toUpperCase()} view`}
          onReset={() => handleTabChange('device')}
        >
          {activeTab === 'device' && (
            <DashboardScreen
              onOpenHud={() => setCameraHudOpen(true)}
              onOpenWatchdog={() => setWatchdogModalOpen(true)}
            />
          )}
          {activeTab === 'fleet' && <FleetScreen onNavigateTab={handleTabChange} />}
          {activeTab === 'files' && <FilesScreen />}
          {activeTab === 'settings' && <SettingsScreen />}
        </ErrorBoundary>
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (<= 768px) */}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Global Modals */}
      <WatchdogModal
        isOpen={watchdogModalOpen}
        onClose={() => setWatchdogModalOpen(false)}
      />

      <CameraHudModal
        isOpen={cameraHudOpen}
        onClose={() => setCameraHudOpen(false)}
      />
    </div>
  );
};

export function App() {
  return (
    <PrinterProvider>
      <AppContent />
    </PrinterProvider>
  );
}

export default App;
