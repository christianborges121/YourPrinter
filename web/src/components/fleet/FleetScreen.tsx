import React, { useState, useEffect } from 'react';
import {
  Layers,
  RefreshCw,
  Printer as PrinterIcon,
  Plus,
  Play,
  Pause,
  Video,
  PlayCircle,
  LayoutGrid,
  List,
  Maximize2,
  Grid2X2,
} from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';
import { FleetPrinterCard, type FleetLayoutMode } from './FleetPrinterCard';
import { AddPrinterModal } from '../modals/AddPrinterModal';
import type { NavTab } from '../../types';

interface FleetScreenProps {
  onNavigateTab: (tab: NavTab) => void;
}

export const FleetScreen: React.FC<FleetScreenProps> = ({ onNavigateTab }) => {
  const { visibleFleetPrinters, switchContext, refreshFleet } = usePrinter();
  const [isAddPrinterOpen, setIsAddPrinterOpen] = useState(false);

  // Overall master camera visibility toggle (defaults to true)
  const [camerasVisible, setCamerasVisible] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('yourprinter_fleet_cameras_visible');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // Configurable preview duration in seconds (10, 20, 30, 60, 120), defaults to 30s
  const [previewDuration, setPreviewDuration] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('yourprinter_preview_duration');
      const num = saved ? parseInt(saved, 10) : 30;
      return [10, 20, 30, 60, 120].includes(num) ? num : 30;
    } catch {
      return 30;
    }
  });

  // Timed preview countdown state (e.g. 30, 29, 28... null when not running)
  const [timedCountdown, setTimedCountdown] = useState<number | null>(null);

  // Global streaming command dispatched to cards
  const [overrideStreaming, setOverrideStreaming] = useState<{
    isStreaming: boolean;
    timestamp: number;
  } | null>(null);

  const [streamAllActive, setStreamAllActive] = useState<boolean>(false);

  // Fleet layout density mode: 'small' | 'medium' | 'large' | 'list', defaults to 'medium'
  const [layoutMode, setLayoutMode] = useState<FleetLayoutMode>(() => {
    try {
      const saved = localStorage.getItem('yourprinter_fleet_layout');
      return saved === 'small' || saved === 'medium' || saved === 'large' || saved === 'list'
        ? saved
        : 'medium';
    } catch {
      return 'medium';
    }
  });

  const handleLayoutChange = (mode: FleetLayoutMode) => {
    setLayoutMode(mode);
    try {
      localStorage.setItem('yourprinter_fleet_layout', mode);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem('yourprinter_fleet_cameras_visible', String(camerasVisible));
    } catch {
      // ignore
    }
  }, [camerasVisible]);

  // Timed preview countdown ticker
  useEffect(() => {
    if (timedCountdown === null) return;

    if (timedCountdown <= 0) {
      // Preview duration ended: automatically pause all cameras
      setTimedCountdown(null);
      setStreamAllActive(false);
      setOverrideStreaming({ isStreaming: false, timestamp: Date.now() });
      return;
    }

    const timer = window.setInterval(() => {
      setTimedCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [timedCountdown]);

  const handleToggleCameras = () => {
    setCamerasVisible((prev) => !prev);
  };

  // Start or cancel timed preview (e.g. 30 seconds video run)
  const handleStartTimedPreview = () => {
    if (timedCountdown !== null) {
      // Cancel active timed preview
      setTimedCountdown(null);
      setStreamAllActive(false);
      setOverrideStreaming({ isStreaming: false, timestamp: Date.now() });
      return;
    }

    if (!camerasVisible) {
      setCamerasVisible(true);
    }

    setStreamAllActive(true);
    setTimedCountdown(previewDuration);
    setOverrideStreaming({ isStreaming: true, timestamp: Date.now() });
  };

  // Stream indefinitely (continuous without timeout)
  const handleStreamAll = () => {
    if (!camerasVisible) {
      setCamerasVisible(true);
    }
    setTimedCountdown(null);
    setStreamAllActive(true);
    setOverrideStreaming({ isStreaming: true, timestamp: Date.now() });
  };

  // Pause all live camera video streams
  const handlePauseAll = () => {
    setTimedCountdown(null);
    setStreamAllActive(false);
    setOverrideStreaming({ isStreaming: false, timestamp: Date.now() });
  };

  const handleSelectPrinter = async (contextId?: string | null) => {
    if (contextId) {
      await switchContext(contextId);
    }
    onNavigateTab('device');
  };

  const containerClass =
    layoutMode === 'list'
      ? 'flex flex-col gap-3'
      : layoutMode === 'small'
      ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'
      : layoutMode === 'large'
      ? 'grid grid-cols-1 lg:grid-cols-2 gap-6'
      : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5';

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">
      {/* Fleet Screen Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#00AE42]/15 text-[#00AE42] border border-[#00AE42]/30">
            <Layers size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#F3F4F6]">Fleet Dashboard</h1>
            <p className="text-xs text-[#94A3B8]">
              Monitor and manage all networked 3D printers in your farm ({visibleFleetPrinters.length} online)
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Master Overall Cameras Toggle */}
          <button
            onClick={handleToggleCameras}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              camerasVisible
                ? 'bg-[#00AE42]/15 border-[#00AE42]/40 text-[#00AE42] hover:bg-[#00AE42]/25'
                : 'bg-[#262626] border-[#2E2E2E] text-[#94A3B8] hover:text-[#F3F4F6]'
            }`}
            title={camerasVisible ? 'Hide all camera previews' : 'Show all camera previews'}
          >
            <Video size={14} className={camerasVisible ? 'text-[#00AE42]' : 'text-[#94A3B8]'} />
            <span>{camerasVisible ? 'Cameras: ON' : 'Cameras: OFF'}</span>
            <span
              className={`w-2 h-2 rounded-full ${
                camerasVisible ? 'bg-[#00AE42] shadow-[0_0_6px_#00AE42]' : 'bg-[#94A3B8]'
              }`}
            />
          </button>

          {/* Multi-Camera Controls: Timed Preview (with configurable duration) | Stream All | Pause All */}
          {camerasVisible && visibleFleetPrinters.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5">
              {/* Timed Preview Box with Configurable Duration Select */}
              <div className="flex items-center bg-[#262626] border border-[#2E2E2E] rounded-lg p-0.5 shadow-sm">
                <button
                  onClick={handleStartTimedPreview}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded transition-colors ${
                    timedCountdown !== null
                      ? 'bg-[#00AE42] text-white shadow-sm animate-pulse'
                      : 'text-[#D1D5DB] hover:text-[#00AE42]'
                  }`}
                  title={`Preview all live video streams for ${previewDuration}s`}
                >
                  <PlayCircle size={14} className={timedCountdown !== null ? 'text-white' : 'text-[#00AE42]'} />
                  <span>
                    {timedCountdown !== null
                      ? `Previewing (${timedCountdown}s)...`
                      : 'Preview'}
                  </span>
                </button>

                <div className="w-[1px] h-3.5 bg-[#2E2E2E] mx-1" />

                {/* Duration Dropdown (10s, 20s, 30s, 60s, 120s) */}
                <select
                  value={previewDuration}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setPreviewDuration(val);
                    try {
                      localStorage.setItem('yourprinter_preview_duration', String(val));
                    } catch {
                      // ignore
                    }
                  }}
                  className="bg-transparent text-xs text-[#94A3B8] hover:text-white px-1.5 py-1 outline-none cursor-pointer font-medium"
                  title="Choose timed video preview duration"
                >
                  <option value={10} className="bg-[#262626] text-white">10s</option>
                  <option value={20} className="bg-[#262626] text-white">20s</option>
                  <option value={30} className="bg-[#262626] text-white">30s</option>
                  <option value={60} className="bg-[#262626] text-white">60s</option>
                  <option value={120} className="bg-[#262626] text-white">120s</option>
                </select>
              </div>

              {/* Stream All & Pause All */}
              <div className="flex items-center bg-[#262626] border border-[#2E2E2E] rounded-lg p-0.5 shadow-sm">
                <button
                  onClick={handleStreamAll}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                    streamAllActive && timedCountdown === null
                      ? 'bg-[#00AE42]/20 text-[#00AE42]'
                      : 'text-[#D1D5DB] hover:text-[#00AE42]'
                  }`}
                  title="Stream live video on all cameras continuously without timer"
                >
                  <Play size={12} />
                  <span>Stream All</span>
                </button>

                <div className="w-[1px] h-3.5 bg-[#2E2E2E]" />

                <button
                  onClick={handlePauseAll}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#D1D5DB] hover:text-[#EF4444] transition-colors"
                  title="Pause all live camera streams"
                >
                  <Pause size={12} />
                  <span>Pause All</span>
                </button>
              </div>
            </div>
          )}

          {/* Fleet Layout Density Selector */}
          <div className="flex items-center bg-[#262626] border border-[#2E2E2E] rounded-lg px-2.5 py-1.5 shadow-sm gap-1.5">
            {layoutMode === 'small' && <Grid2X2 size={13} className="text-[#00AE42]" />}
            {layoutMode === 'medium' && <LayoutGrid size={13} className="text-[#00AE42]" />}
            {layoutMode === 'large' && <Maximize2 size={13} className="text-[#00AE42]" />}
            {layoutMode === 'list' && <List size={13} className="text-[#00AE42]" />}
            <select
              value={layoutMode}
              onChange={(e) => handleLayoutChange(e.target.value as FleetLayoutMode)}
              className="bg-transparent text-xs text-[#F3F4F6] font-semibold outline-none cursor-pointer"
              title="Choose Fleet Layout Density"
            >
              <option value="small" className="bg-[#262626] text-white">Small</option>
              <option value="medium" className="bg-[#262626] text-white">Medium</option>
              <option value="large" className="bg-[#262626] text-white">Large</option>
              <option value="list" className="bg-[#262626] text-white">List</option>
            </select>
          </div>

          {/* Refresh Fleet */}
          <button
            onClick={() => refreshFleet()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#262626] border border-[#2E2E2E] hover:border-[#383838] text-xs font-semibold text-[#D1D5DB] hover:text-white transition-colors"
            title="Refresh Fleet Status"
          >
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>

          {/* Add Printer - Only visible if there are no printers */}
          {visibleFleetPrinters.length === 0 && (
            <button
              onClick={() => setIsAddPrinterOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-xs font-semibold text-white shadow-sm transition-colors"
            >
              <Plus size={14} />
              <span>Add Printer</span>
            </button>
          )}
        </div>
      </div>

      {/* Printer Card Grid */}
      {visibleFleetPrinters.length === 0 ? (
        <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl p-10 flex flex-col items-center justify-center text-center gap-3">
          <PrinterIcon size={44} className="text-[#94A3B8]" />
          <h3 className="text-base font-bold text-[#F3F4F6]">No Printers Connected</h3>
          <p className="text-xs text-[#94A3B8] max-w-sm">
            YourPrinter server is running, but no printers are currently active. Add your printer or enable existing printers in Settings.
          </p>
          <button
            onClick={() => setIsAddPrinterOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 mt-2 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-xs font-semibold text-white shadow-sm transition-colors"
          >
            <Plus size={14} />
            <span>Add Your First Printer</span>
          </button>
        </div>
      ) : (
        <div className={containerClass}>
          {visibleFleetPrinters.map((printer, index) => (
            <FleetPrinterCard
              key={printer.contextId || printer.name || index}
              printer={printer}
              onSelect={() => handleSelectPrinter(printer.contextId)}
              camerasVisible={camerasVisible}
              overrideStreaming={overrideStreaming}
              layoutMode={layoutMode}
            />
          ))}
        </div>
      )}

      {/* Add Printer Modal */}
      <AddPrinterModal
        isOpen={isAddPrinterOpen}
        onClose={() => setIsAddPrinterOpen(false)}
      />
    </div>
  );
};
