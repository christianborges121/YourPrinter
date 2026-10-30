import React, { useState, useEffect } from 'react';
import {
  Folder,
  Clock,
  HardDrive,
  Play,
  RefreshCw,
  FileCode,
  Layers,
  Scale,
  Search,
  CheckSquare,
  Square,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';
import { api } from '../../services/api';
import type { WebUIJobFile } from '../../types';
import { Modal } from '../common/Modal';
import {
  getPrintHistory,
  getPrintHistoryStats,
  seedHistoryFromRecentJobs,
  clearPrintHistory,
  removePrintHistoryItem,
  type PrintHistoryItem,
} from '../../services/printHistory';

export const FilesScreen: React.FC = () => {
  const { activeContextId, activeContext } = usePrinter();
  const [tab, setTab] = useState<'recent' | 'local' | 'history'>('recent');
  const [recentFiles, setRecentFiles] = useState<WebUIJobFile[]>([]);
  const [localFiles, setLocalFiles] = useState<WebUIJobFile[]>([]);
  const [historyItems, setHistoryItems] = useState<PrintHistoryItem[]>([]);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'completed' | 'cancelled' | 'failed'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFileForPrint, setSelectedFileForPrint] = useState<WebUIJobFile | null>(null);
  const [autoBedLeveling, setAutoBedLeveling] = useState<boolean>(true);
  const [isStartingPrint, setIsStartingPrint] = useState<boolean>(false);

  const loadFiles = async () => {
    setIsLoading(true);
    try {
      const [recentRes, localRes] = await Promise.allSettled([
        api.getRecentJobs(activeContextId || undefined),
        api.getLocalJobs(activeContextId || undefined),
      ]);

      let loadedRecent: WebUIJobFile[] = [];
      if (recentRes.status === 'fulfilled' && recentRes.value.files) {
        loadedRecent = recentRes.value.files;
        setRecentFiles(loadedRecent);
      }
      if (localRes.status === 'fulfilled' && localRes.value.files) {
        setLocalFiles(localRes.value.files);
      }

      // Seed history from recent files if empty
      if (loadedRecent.length > 0) {
        seedHistoryFromRecentJobs(loadedRecent, activeContext?.name || 'Printer', activeContextId || undefined);
      }
      setHistoryItems(getPrintHistory());
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [activeContextId]);

  const activeFileList = (tab === 'recent' ? recentFiles : localFiles).filter((f) => {
    if (!searchQuery.trim()) return true;
    const name = (f.displayName || f.filename).toLowerCase();
    return name.includes(searchQuery.toLowerCase().trim());
  });

  const filteredHistory = historyItems.filter((item) => {
    if (historyStatusFilter !== 'all' && item.status !== historyStatusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = (item.displayName || item.filename).toLowerCase().includes(q);
      const matchPrinter = (item.printerName || '').toLowerCase().includes(q);
      return matchName || matchPrinter;
    }
    return true;
  });

  const historyStats = getPrintHistoryStats(historyItems);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '--';
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  const formatDate = (isoString?: string): string => {
    if (!isoString) return '--';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const handleStartPrint = async () => {
    if (!selectedFileForPrint || isStartingPrint) return;
    setIsStartingPrint(true);
    try {
      await api.startJob(selectedFileForPrint.filename, activeContextId || undefined, autoBedLeveling);
      setSelectedFileForPrint(null);
    } finally {
      setIsStartingPrint(false);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm('Are you sure you want to clear your local print history?')) {
      clearPrintHistory();
      setHistoryItems([]);
    }
  };

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removePrintHistoryItem(id);
    setHistoryItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-10">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#00AE42]/15 text-[#00AE42] border border-[#00AE42]/30">
            <Folder size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#F3F4F6]">Device Files</h1>
            <p className="text-xs text-[#94A3B8]">
              Manage print files and analytics for {activeContext?.name || 'Selected Printer'}
            </p>
          </div>
        </div>

        <button
          onClick={loadFiles}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#262626] border border-[#2E2E2E] hover:border-[#383838] text-xs font-semibold text-[#D1D5DB] hover:text-white transition-colors"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin text-[#00AE42]' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Tabs & Search Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-[#2E2E2E] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTab('recent')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all ${
              tab === 'recent'
                ? 'bg-[#00AE42]/15 border-[#00AE42]/40 text-[#00AE42]'
                : 'bg-[#262626] border-[#2E2E2E] text-[#94A3B8] hover:text-[#F3F4F6]'
            }`}
          >
            <Clock size={14} />
            <span>Recent Prints ({recentFiles.length})</span>
          </button>

          <button
            onClick={() => setTab('local')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all ${
              tab === 'local'
                ? 'bg-[#00AE42]/15 border-[#00AE42]/40 text-[#00AE42]'
                : 'bg-[#262626] border-[#2E2E2E] text-[#94A3B8] hover:text-[#F3F4F6]'
            }`}
          >
            <HardDrive size={14} />
            <span>Local Storage ({localFiles.length})</span>
          </button>

          <button
            onClick={() => setTab('history')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all ${
              tab === 'history'
                ? 'bg-[#00AE42]/15 border-[#00AE42]/40 text-[#00AE42]'
                : 'bg-[#262626] border-[#2E2E2E] text-[#94A3B8] hover:text-[#F3F4F6]'
            }`}
          >
            <BarChart3 size={14} />
            <span>History & Analytics ({historyItems.length})</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tab === 'history' ? 'Search history...' : 'Search print files...'}
            className="w-full sm:w-60 bg-[#262626] border border-[#2E2E2E] focus:border-[#00AE42] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#F3F4F6] outline-none transition-colors"
          />
        </div>
      </div>

      {/* Tab: Print History & Analytics */}
      {tab === 'history' ? (
        <div className="flex flex-col gap-5">
          {/* Farm Analytics Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">Total Prints</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#F3F4F6]">{historyStats.totalPrints}</span>
                <span className="text-xs text-[#94A3B8]">jobs</span>
              </div>
            </div>

            <div className="p-4 bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">Success Rate</span>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${historyStats.successRatePercent >= 80 ? 'text-[#00AE42]' : 'text-[#F59E0B]'}`}>
                  {historyStats.successRatePercent}%
                </span>
                <span className="text-xs text-[#94A3B8]">{historyStats.completedCount} finished</span>
              </div>
            </div>

            <div className="p-4 bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">Cumulative Time</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#3B82F6]">
                  {formatDuration(historyStats.totalDurationSeconds)}
                </span>
              </div>
            </div>

            <div className="p-4 bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">Filament Used</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#A855F7]">
                  {(historyStats.totalFilamentMeters).toFixed(1)} m
                </span>
                <span className="text-xs text-[#94A3B8]">
                  ~{((historyStats.totalFilamentMeters * 3) / 1000).toFixed(2)} kg
                </span>
              </div>
            </div>
          </div>

          {/* Filter Bar & Clear History Action */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {(['all', 'completed', 'cancelled', 'failed'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setHistoryStatusFilter(filter)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize border transition-all ${
                    historyStatusFilter === filter
                      ? 'bg-[#00AE42]/20 border-[#00AE42] text-[#00AE42]'
                      : 'bg-[#262626] border-[#2E2E2E] text-[#94A3B8] hover:text-[#F3F4F6]'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {historyItems.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#94A3B8] hover:text-[#EF4444] transition-colors"
                title="Clear local print history"
              >
                <Trash2 size={13} />
                <span>Clear History</span>
              </button>
            )}
          </div>

          {/* History List */}
          {filteredHistory.length === 0 ? (
            <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl p-10 flex flex-col items-center justify-center text-center gap-2">
              <Clock size={36} className="text-[#94A3B8]" />
              <span className="text-sm font-semibold text-[#F3F4F6]">No Print History Found</span>
              <span className="text-xs text-[#94A3B8]">
                {searchQuery || historyStatusFilter !== 'all'
                  ? 'No jobs match your filter criteria.'
                  : 'Completed or cancelled print jobs will appear here automatically.'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredHistory.map((item) => {
                const isCompleted = item.status === 'completed';
                const isCancelled = item.status === 'cancelled';

                return (
                  <div
                    key={item.id}
                    className="p-3.5 bg-[#1E1E1E] border border-[#2E2E2E] hover:border-[#383838] rounded-xl flex items-center justify-between gap-4 transition-all"
                  >
                    {/* Item Details */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-[#262626] border border-[#2E2E2E] flex items-center justify-center shrink-0">
                        {isCompleted ? (
                          <CheckCircle2 size={20} className="text-[#00AE42]" />
                        ) : isCancelled ? (
                          <RotateCcw size={20} className="text-[#F59E0B]" />
                        ) : (
                          <XCircle size={20} className="text-[#EF4444]" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-[#F3F4F6] truncate">
                            {item.displayName || item.filename}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                              isCompleted
                                ? 'bg-[#00AE42]/15 text-[#00AE42] border border-[#00AE42]/30'
                                : isCancelled
                                ? 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30'
                                : 'bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30'
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#94A3B8] mt-1">
                          <span>{item.printerName}</span>
                          <span>•</span>
                          <span>{formatDate(item.endTime)}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock size={11} /> {formatDuration(item.durationSeconds)}
                          </span>
                          {item.filamentMeters !== undefined && item.filamentMeters > 0 && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Scale size={11} /> {item.filamentMeters.toFixed(1)}m
                              </span>
                            </>
                          )}
                          {item.layers !== undefined && item.layers > 0 && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Layers size={11} /> {item.layers} layers
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions: Print Again & Delete */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() =>
                          setSelectedFileForPrint({
                            filename: item.filename,
                            displayName: item.displayName,
                          } as WebUIJobFile)
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-white text-xs font-semibold shadow-sm transition-colors"
                        title="Print this file again"
                      >
                        <Play size={13} />
                        <span>Print Again</span>
                      </button>

                      <button
                        onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                        className="p-1.5 text-[#94A3B8] hover:text-[#EF4444] rounded-lg hover:bg-[#262626] transition-colors"
                        title="Remove from history"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* File List for Recent / Local */
        activeFileList.length === 0 ? (
          <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl p-10 flex flex-col items-center justify-center text-center gap-2">
            <FileCode size={36} className="text-[#94A3B8]" />
            <span className="text-sm font-semibold text-[#F3F4F6]">
              {searchQuery ? 'No matching files found' : 'No G-code Files Found'}
            </span>
            <span className="text-xs text-[#94A3B8]">
              {searchQuery
                ? 'Try adjusting your search terms.'
                : tab === 'recent'
                ? 'Completed or recent prints will appear here.'
                : 'Files stored on the printer flash memory will appear here.'}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {activeFileList.map((file, idx) => (
              <div
                key={file.filename || idx}
                className="p-3.5 bg-[#1E1E1E] border border-[#2E2E2E] hover:border-[#383838] rounded-xl flex items-center justify-between gap-4 transition-all"
              >
                {/* File Icon & Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-[#262626] border border-[#2E2E2E] flex items-center justify-center shrink-0">
                    <FileCode size={20} className="text-[#00AE42]" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-[#F3F4F6] truncate">
                      {file.displayName || file.filename}
                    </h4>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#94A3B8] mt-0.5">
                      <span>{formatFileSize(file.size)}</span>
                      {file.printTime && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {formatDuration(file.printTime)}
                        </span>
                      )}
                      {file.filamentLength && (
                        <span className="flex items-center gap-1">
                          <Scale size={11} /> {(file.filamentLength / 1000).toFixed(1)}m
                        </span>
                      )}
                      {file.layerHeight && (
                        <span className="flex items-center gap-1">
                          <Layers size={11} /> {file.layerHeight}mm
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Start Print Action */}
                <button
                  onClick={() => setSelectedFileForPrint(file)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-white text-xs font-semibold shadow-sm transition-colors shrink-0"
                >
                  <Play size={13} />
                  <span className="hidden sm:inline">Print Now</span>
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Start Print Confirmation Modal with Auto Bed Leveling */}
      {selectedFileForPrint && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedFileForPrint(null)}
          title="Confirm Start Print"
          maxWidth="max-w-md"
        >
          <div className="flex flex-col gap-4">
            <div className="p-3 bg-[#262626] border border-[#2E2E2E] rounded-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#1E1E1E] flex items-center justify-center text-[#00AE42]">
                <FileCode size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-[#F3F4F6] truncate">
                  {selectedFileForPrint.displayName || selectedFileForPrint.filename}
                </h4>
                <p className="text-xs text-[#94A3B8]">Target: {activeContext?.name || 'Printer'}</p>
              </div>
            </div>

            {/* Print Options */}
            <div className="p-3 bg-[#262626]/60 border border-[#2E2E2E] rounded-xl flex flex-col gap-3">
              <span className="text-xs font-semibold text-[#F3F4F6]">Print Options</span>

              <label
                onClick={() => setAutoBedLeveling(!autoBedLeveling)}
                className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-[#D1D5DB]"
              >
                {autoBedLeveling ? (
                  <CheckSquare size={16} className="text-[#00AE42]" />
                ) : (
                  <Square size={16} className="text-[#94A3B8]" />
                )}
                <span>Auto Bed Leveling (ABL Calibration)</span>
              </label>
            </div>

            <div className="p-3 bg-[#F59E0B]/10 border border-[#F59E0B]/25 rounded-xl flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-[#F59E0B] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#FCD34D] leading-tight">
                Please ensure the build plate is clean, properly aligned, and clear of any previous prints before starting.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2E2E2E]">
              <button
                onClick={() => setSelectedFileForPrint(null)}
                className="px-4 py-2 rounded-lg bg-[#262626] hover:bg-[#383838] text-xs font-semibold text-[#D1D5DB] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartPrint}
                disabled={isStartingPrint}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-xs font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
              >
                <Play size={14} className={isStartingPrint ? 'animate-spin' : ''} />
                <span>{isStartingPrint ? 'Starting...' : 'Start Printing'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
