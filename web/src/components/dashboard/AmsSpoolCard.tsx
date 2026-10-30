import React, { useState } from 'react';
import { Layers, ArrowDown, ArrowUp, RefreshCw, Disc, Plus, Edit2, X } from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';
import { api } from '../../services/api';
import type { MaterialSlot } from '../../types';
import { SpoolSelectModal } from '../modals/SpoolSelectModal';

export const AmsSpoolCard: React.FC = () => {
  const { materialStation, activeSpool, activeContext, features, capabilities, status, loadSlot, unloadMaterial, refreshStatus } =
    usePrinter();
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [spoolModalOpen, setSpoolModalOpen] = useState<boolean>(false);
  const [isClearingSpool, setIsClearingSpool] = useState<boolean>(false);

  // Determine if this machine has real multi-material hardware (AMS/AD5X Material Station)
  const hasHardwareAms = Boolean((capabilities?.hasMaterialStation ?? features?.hasMaterialStation) && materialStation?.connected);

  const slots: MaterialSlot[] =
    materialStation?.slots && materialStation.slots.length > 0
      ? materialStation.slots
      : [];

  const isMultiHead =
    (status?.toolTemps && status.toolTemps.length > 1) ||
    /creator\s*(5|pro|4)/i.test(`${activeContext?.model || ''} ${activeContext?.name || ''}`);

  const handleLoad = async (slotId: number) => {
    if (busySlot !== null) return;
    setBusySlot(slotId);
    try {
      await loadSlot(slotId);
    } finally {
      setTimeout(() => setBusySlot(null), 1500);
    }
  };

  const handleUnload = async () => {
    if (busySlot !== null) return;
    setBusySlot(999);
    try {
      await unloadMaterial();
    } finally {
      setTimeout(() => setBusySlot(null), 1500);
    }
  };

  const handleClearSpool = async () => {
    if (isClearingSpool) return;
    setIsClearingSpool(true);
    try {
      await api.clearSpoolmanSpool(activeContext?.contextId || undefined);
      await refreshStatus();
    } finally {
      setIsClearingSpool(false);
    }
  };

  // If machine does NOT have hardware AMS (e.g. Flashforge Creator 5 Pro, Adventurer 5M):
  // Render dedicated Spoolman Active Filament tracker card
  if (!hasHardwareAms && slots.length === 0) {
    const spoolColor = activeSpool?.colorHex || '#00AE42';
    const remainingWeight = activeSpool ? Math.max(0, Math.round(activeSpool.remainingWeight)) : 0;
    const remainingPercent = Math.min(100, Math.round((remainingWeight / 1000) * 100));

    return (
      <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl p-5 shadow-sm flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#2E2E2E]">
          <div className="flex items-center gap-2">
            <Disc size={16} className="text-[#00AE42]" />
            <span className="text-sm font-semibold text-[#F3F4F6]">Active Filament & Spool</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refreshStatus()}
              className="p-1 text-[#94A3B8] hover:text-[#F3F4F6] transition-colors"
              title="Refresh Spool Data"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Spool Info Body */}
        {activeSpool ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 p-4 rounded-xl bg-[#262626]/70 border border-[#2E2E2E]">
              {/* Spool Visual */}
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 border border-white/20 shadow-inner relative"
                style={{ backgroundColor: spoolColor }}
              >
                <div className="w-5 h-5 rounded-full bg-[#1E1E1E] border border-white/20 flex items-center justify-center">
                  <Disc size={12} className="text-white/40" />
                </div>
              </div>

              {/* Spool Metadata */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-[#F3F4F6] truncate">{activeSpool.name}</h4>
                  {activeSpool.material && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#1E1E1E] text-[#00AE42] border border-[#00AE42]/30">
                      {activeSpool.material}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8] mt-1">
                  {activeSpool.vendor && <span>{activeSpool.vendor}</span>}
                  {activeSpool.vendor && <span>•</span>}
                  <span className="font-mono text-[11px] uppercase">{activeSpool.colorHex}</span>
                  {activeSpool.remainingLength > 0 && (
                    <>
                      <span>•</span>
                      <span>~{Math.round(activeSpool.remainingLength)}m remaining</span>
                    </>
                  )}
                </div>

                {/* Remaining Weight Bar */}
                <div className="flex flex-col gap-1 mt-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#94A3B8]">Remaining Weight</span>
                    <span className="font-bold text-[#F3F4F6]">{remainingWeight}g / 1000g ({remainingPercent}%)</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#1E1E1E] overflow-hidden border border-[#2E2E2E]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${remainingPercent}%`,
                        backgroundColor: remainingPercent > 20 ? spoolColor : '#EF4444',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSpoolModalOpen(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] text-xs font-semibold text-[#D1D5DB] hover:text-white transition-colors"
              >
                <Edit2 size={13} className="text-[#00AE42]" />
                <span>Switch Spool</span>
              </button>

              <button
                onClick={handleClearSpool}
                disabled={isClearingSpool}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#262626] hover:bg-[#EF4444]/20 border border-[#2E2E2E] hover:border-[#EF4444]/40 text-xs font-semibold text-[#94A3B8] hover:text-[#EF4444] transition-colors"
                title="Unassign current spool"
              >
                <X size={13} />
                <span>Clear</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-[#262626]/40 border border-[#2E2E2E] flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#1E1E1E] border border-[#2E2E2E] flex items-center justify-center text-[#94A3B8]">
              <Disc size={24} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#F3F4F6]">No Active Spool Assigned</h4>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">
                Assign a filament spool from Spoolman to monitor weight and consumption.
              </p>
            </div>
            <button
              onClick={() => setSpoolModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <Plus size={13} />
              <span>Assign Spoolman Spool</span>
            </button>
          </div>
        )}

        {/* Modal */}
        <SpoolSelectModal isOpen={spoolModalOpen} onClose={() => setSpoolModalOpen(false)} />
      </div>
    );
  }

  // Hardware AMS Multi-Material View
  return (
    <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-xl p-5 shadow-sm flex flex-col gap-4">
      {/* Header Row */}
      <div className="flex items-center justify-between pb-2 border-b border-[#2E2E2E]">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-[#00AE42]" />
          <span className="text-sm font-semibold text-[#F3F4F6]">
            {isMultiHead ? 'Multi-Head Toolheads' : 'Multi-Material Spool Station'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#00AE42]/15 text-[#00AE42] border border-[#00AE42]/30">
            {materialStation?.overallStatus ? materialStation.overallStatus.toUpperCase() : 'READY'}
          </span>
          <button
            onClick={() => refreshStatus()}
            className="p-1 text-[#94A3B8] hover:text-[#F3F4F6] transition-colors"
            title="Refresh Spools"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Slots Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {slots.map((slot, index) => {
          const slotNum = slot.slotId >= 1 ? slot.slotId : index + 1;
          const isActive = slot.isActive;
          const isEmpty = slot.isEmpty;
          const colorHex = slot.materialColor || (isEmpty ? '#333333' : '#00AE42');
          const isSlotBusy = busySlot === slot.slotId;

          return (
            <div
              key={slot.slotId || index}
              className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                isActive
                  ? 'bg-[#00AE42]/10 border-[#00AE42] shadow-[0_0_12px_rgba(0,174,66,0.15)]'
                  : 'bg-[#262626]/70 border-[#2E2E2E] hover:border-[#383838]'
              }`}
            >
              {/* Slot Header Badge */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] bg-[#1E1E1E] px-1.5 py-0.5 rounded border border-[#2E2E2E]">
                  {isMultiHead ? `Tool T${index}` : `Slot ${slotNum}`}
                </span>
                {isActive && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-[#00AE42]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00AE42] animate-pulse" />
                    Active
                  </span>
                )}
              </div>

              {/* Spool Disc Visualization with Hub */}
              <div className="flex items-center gap-3 my-2">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-white/20 shadow-inner relative"
                  style={{ backgroundColor: colorHex }}
                >
                  <div className="w-3.5 h-3.5 rounded-full bg-[#1E1E1E] border border-white/20 flex items-center justify-center">
                    <Disc size={10} className="text-white/40" />
                  </div>
                </div>

                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-[#F3F4F6] truncate">
                    {isEmpty ? 'Empty Slot' : slot.materialType || 'PLA'}
                  </span>
                  <span className="text-[10px] text-[#94A3B8] font-mono uppercase">
                    {isEmpty ? 'No Filament' : colorHex}
                  </span>
                  {slot.remainingPercent !== undefined && (
                    <span className="text-[10px] text-[#D1D5DB] font-semibold mt-0.5">
                      {Math.round(slot.remainingPercent)}% left
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons: Load / Unload */}
              {!isMultiHead && (
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-[#2E2E2E]/60">
                  <button
                    onClick={() => handleLoad(slot.slotId)}
                    disabled={isActive || isEmpty || isSlotBusy}
                    className="flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded bg-[#1E1E1E] hover:bg-[#383838] border border-[#2E2E2E] text-[10px] font-semibold text-[#D1D5DB] disabled:opacity-40 transition-colors"
                  >
                    <ArrowDown size={11} className="text-[#00AE42]" />
                    <span>{isSlotBusy ? 'Loading...' : 'Load'}</span>
                  </button>
                  <button
                    onClick={handleUnload}
                    disabled={!isActive || isSlotBusy}
                    className="flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded bg-[#1E1E1E] hover:bg-[#383838] border border-[#2E2E2E] text-[10px] font-semibold text-[#D1D5DB] disabled:opacity-40 transition-colors"
                  >
                    <ArrowUp size={11} className="text-[#F59E0B]" />
                    <span>Unload</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Spoolman Active Spool Details (if connected) */}
      {activeSpool && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#262626]/40 border border-[#2E2E2E] mt-1">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-4 h-4 rounded-full shrink-0 border border-white/20"
              style={{ backgroundColor: activeSpool.colorHex }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-[#F3F4F6] truncate">
                Spoolman: {activeSpool.vendor ? `${activeSpool.vendor} ` : ''}
                {activeSpool.name}
              </div>
              <div className="text-[11px] text-[#94A3B8]">
                {activeSpool.material || 'PLA'} • {Math.round(activeSpool.remainingWeight)}g remaining
              </div>
            </div>
          </div>

          <button
            onClick={() => setSpoolModalOpen(true)}
            className="text-xs font-semibold text-[#00AE42] hover:underline shrink-0"
          >
            Change
          </button>
        </div>
      )}

      {/* Modal */}
      <SpoolSelectModal isOpen={spoolModalOpen} onClose={() => setSpoolModalOpen(false)} />
    </div>
  );
};
