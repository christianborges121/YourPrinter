import React, { useState, useEffect } from 'react';
import { Search, Disc, Check, RefreshCw, AlertCircle, Layers } from 'lucide-react';
import { Modal } from '../common/Modal';
import { api } from '../../services/api';
import { usePrinter } from '../../context/PrinterContext';
import type { SpoolmanSpoolSummary } from '../../types';

interface SpoolSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SpoolSelectModal: React.FC<SpoolSelectModalProps> = ({ isOpen, onClose }) => {
  const { activeContextId, activeSpool, refreshStatus } = usePrinter();
  const [search, setSearch] = useState<string>('');
  const [spools, setSpools] = useState<SpoolmanSpoolSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSelecting, setIsSelecting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSpools = async (searchTerm = '') => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.searchSpoolmanSpools(searchTerm);
      if (res.success && res.spools) {
        setSpools(res.spools);
      } else {
        setSpools([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to connect to Spoolman server');
      setSpools([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSpools(search);
    }
  }, [isOpen]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    fetchSpools(val);
  };

  const handleSelectSpool = async (spool: SpoolmanSpoolSummary) => {
    setIsSelecting(spool.id);
    setError(null);
    try {
      const res = await api.selectSpoolmanSpool(spool.id, activeContextId || undefined);
      if (res.success) {
        await refreshStatus();
        onClose();
      } else {
        setError('Failed to assign spool to printer');
      }
    } catch (err: any) {
      setError(err?.message || 'Error assigning spool');
    } finally {
      setIsSelecting(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-[#00AE42]" />
          <span>Select Spoolman Spool</span>
        </div>
      }
      maxWidth="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        {/* Search Bar */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by filament, vendor, or material..."
            className="w-full bg-[#262626] border border-[#2E2E2E] focus:border-[#00AE42] rounded-xl pl-9.5 pr-4 py-2 text-xs sm:text-sm text-[#F3F4F6] outline-none transition-colors"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-[#EF4444]/10 border border-[#EF4444]/25 rounded-xl text-xs text-[#EF4444]">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Spool List */}
        <div className="max-h-80 overflow-y-auto flex flex-col gap-2 pr-1">
          {isLoading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-2 text-xs text-[#94A3B8]">
              <RefreshCw size={20} className="animate-spin text-[#00AE42]" />
              <span>Loading Spoolman inventory...</span>
            </div>
          ) : spools.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
              <Disc size={32} className="text-[#94A3B8]" />
              <span className="text-sm font-semibold text-[#F3F4F6]">No Spools Found</span>
              <span className="text-xs text-[#94A3B8]">
                {search ? 'No spools match your query.' : 'Ensure Spoolman server is configured and spools are created.'}
              </span>
            </div>
          ) : (
            spools.map((spool) => {
              const isCurrent = activeSpool?.id === spool.id;
              const isSelected = isSelecting === spool.id;
              const colorHex = spool.colorHex || '#808080';

              return (
                <div
                  key={spool.id}
                  onClick={() => !isSelected && handleSelectSpool(spool)}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                    isCurrent
                      ? 'bg-[#00AE42]/10 border-[#00AE42]'
                      : 'bg-[#262626]/60 border-[#2E2E2E] hover:border-[#383838] hover:bg-[#262626]'
                  }`}
                >
                  {/* Swatch & Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className="w-8 h-8 rounded-full border border-white/20 shrink-0 shadow-inner flex items-center justify-center"
                      style={{ backgroundColor: colorHex }}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-[#1E1E1E] border border-white/20" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-[#F3F4F6] truncate">{spool.name}</h4>
                        {spool.material && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#1E1E1E] text-[#94A3B8] border border-[#2E2E2E]">
                            {spool.material}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#00AE42]/20 text-[#00AE42]">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-[#94A3B8] mt-0.5">
                        {spool.vendor && <span>{spool.vendor}</span>}
                        {spool.vendor && <span>•</span>}
                        <span>{Math.round(spool.remainingWeight)}g left</span>
                        {spool.remainingLength > 0 && (
                          <>
                            <span>•</span>
                            <span>{Math.round(spool.remainingLength)}m</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Select button */}
                  <button
                    disabled={isSelected || isCurrent}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all shrink-0 ${
                      isCurrent
                        ? 'bg-[#00AE42]/20 text-[#00AE42]'
                        : 'bg-[#00AE42] hover:bg-[#009638] text-white shadow-sm'
                    }`}
                  >
                    {isSelected ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : isCurrent ? (
                      <Check size={12} />
                    ) : null}
                    <span>{isSelected ? 'Setting...' : isCurrent ? 'Selected' : 'Assign'}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-[#2E2E2E]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#262626] hover:bg-[#383838] text-xs font-semibold text-[#D1D5DB] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
