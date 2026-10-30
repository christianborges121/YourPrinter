import React, { useState } from 'react';
import {
  Layers,
  Printer as PrinterIcon,
  Folder,
  Settings as SettingsIcon,
  ShieldCheck,
  ShieldAlert,
  Shield,
  ChevronDown,
  Wifi,
  WifiOff,
  RefreshCw,
  Info,
  Plus,
} from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';
import { Logo } from './Logo';
import { DeviceInfoModal } from '../modals/DeviceInfoModal';
import { AddPrinterModal } from '../modals/AddPrinterModal';
import type { NavTab } from '../../types';

interface HeaderProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onOpenWatchdog: () => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange, onOpenWatchdog }) => {
  const {
    contexts,
    visibleContexts,
    activeContextId,
    activeContext,
    status,
    serverConnected,
    switchContext,
    selectPrinterByIndex,
    refreshAll,
  } = usePrinter();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeviceInfoOpen, setIsDeviceInfoOpen] = useState(false);
  const [isAddPrinterOpen, setIsAddPrinterOpen] = useState(false);

  const watchdog = status?.watchdog;
  const isWatchdogAlert = watchdog?.auto_pause_triggered || (watchdog?.confidence ?? 0) >= (watchdog?.threshold ?? 0.2);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshAll();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const navItems = [
    { id: 'fleet' as NavTab, label: 'Fleet', icon: Layers },
    { id: 'device' as NavTab, label: 'Device', icon: PrinterIcon },
    { id: 'files' as NavTab, label: 'Files', icon: Folder },
    { id: 'settings' as NavTab, label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[#1E1E1E]/95 backdrop-blur-md border-b border-[#2E2E2E]">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        {/* Left: Brand Logo & Title (Click to navigate to Fleet) */}
        <button
          onClick={() => onTabChange('fleet')}
          className="flex items-center gap-3 shrink-0 group text-left cursor-pointer transition-opacity hover:opacity-90 focus:outline-none"
          title="Go to Fleet Dashboard"
        >
          <Logo size={34} />
          <div className="hidden sm:flex flex-col">
            <span className="font-bold text-base tracking-tight text-[#F3F4F6] group-hover:text-white transition-colors">
              YourPrinter
            </span>
            <span className="text-[11px] text-[#94A3B8] group-hover:text-[#D1D5DB] transition-colors">
              Your Way
            </span>
          </div>
        </button>

        {/* Center: Printer Context Switcher */}
        <div className="relative flex-1 max-w-xs sm:max-w-sm">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#262626] border border-[#2E2E2E] hover:border-[#383838] transition-all text-left"
          >
            <div className="flex items-center gap-2 truncate">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  activeContext?.isConnected
                    ? 'bg-[#00AE42] shadow-[0_0_6px_#00AE42]'
                    : 'bg-[#94A3B8]'
                }`}
              />
              <span className="font-medium text-xs sm:text-sm text-[#F3F4F6] truncate">
                {activeContext?.name || 'Select Printer'}
              </span>
              {activeContext?.model && (
                <span className="hidden md:inline-block text-[10px] text-[#94A3B8] bg-[#1E1E1E] px-1.5 py-0.5 rounded border border-[#2E2E2E] truncate">
                  {activeContext.model}
                </span>
              )}
            </div>
            <ChevronDown size={14} className="text-[#94A3B8] shrink-0" />
          </button>

          {/* Dropdown Menu supporting 0-based indices (/printers/0, /printers/1) & contextId */}
          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
              <div className="absolute left-0 right-0 mt-1.5 py-1.5 bg-[#262626] border border-[#2E2E2E] rounded-xl shadow-xl z-50 overflow-hidden max-h-72 overflow-y-auto">
                <div className="px-3 py-1 text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">
                  Configured Printers
                </div>
                {visibleContexts.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-[#94A3B8]">No active printers</div>
                ) : (
                  visibleContexts.map((ctx) => {
                    const originalIdx = contexts.findIndex((c) => c.contextId === ctx.contextId);
                    const isSelected = ctx.contextId === activeContextId;
                    return (
                      <button
                        key={ctx.contextId}
                        onClick={async () => {
                          setDropdownOpen(false);
                          if (originalIdx >= 0) {
                            await selectPrinterByIndex(originalIdx);
                          }
                          await switchContext(ctx.contextId);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs sm:text-sm transition-colors ${
                          isSelected ? 'bg-[#00AE42]/15 text-[#00AE42]' : 'text-[#D1D5DB] hover:bg-[#1E1E1E]'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              ctx.isConnected ? 'bg-[#00AE42]' : 'bg-[#94A3B8]'
                            }`}
                          />
                          <span className="font-medium truncate">{ctx.name}</span>
                          {originalIdx >= 0 && (
                            <span className="text-[10px] text-[#94A3B8]">#{originalIdx}</span>
                          )}
                        </div>
                        <span className="text-[11px] text-[#94A3B8] truncate ml-2">
                          {ctx.model}
                        </span>
                      </button>
                    );
                  })
                )}

                <div className="pt-1 mt-1 border-t border-[#383838]">
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      setIsAddPrinterOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-[#00AE42] hover:bg-[#1E1E1E] transition-colors"
                  >
                    <Plus size={14} />
                    <span>Add New Printer...</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Section: Desktop Navigation & AI Watchdog Pill */}
        <div className="flex items-center gap-2">
          {/* Desktop Nav Items */}
          <nav className="hidden md:flex items-center gap-1 bg-[#262626] p-1 rounded-lg border border-[#2E2E2E]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[#00AE42] text-white shadow-sm'
                      : 'text-[#D1D5DB] hover:text-white hover:bg-[#1E1E1E]'
                  }`}
                >
                  <Icon size={14} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Persistent AI Watchdog Guard button/pill */}
          <button
            onClick={onOpenWatchdog}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              !watchdog || !watchdog.online
                ? 'bg-[#262626] border-[#2E2E2E] text-[#94A3B8] hover:text-[#F3F4F6]'
                : isWatchdogAlert
                ? 'bg-[#EF4444]/20 border-[#EF4444] text-[#EF4444] animate-pulse'
                : 'bg-[#00AE42]/15 border-[#00AE42]/40 text-[#00AE42] hover:bg-[#00AE42]/25'
            }`}
            title="AI Watchdog Defect Guard"
          >
            {isWatchdogAlert ? (
              <ShieldAlert size={14} className="text-[#EF4444]" />
            ) : watchdog?.online ? (
              <ShieldCheck size={14} className="text-[#00AE42]" />
            ) : (
              <Shield size={14} className="text-[#94A3B8]" />
            )}
            <span className="hidden sm:inline">
              {watchdog?.online ? 'AI Guard' : 'AI Offline'}
            </span>
            <span
              className={`text-[10px] px-1 py-0.2 rounded ${
                isWatchdogAlert
                  ? 'bg-[#EF4444] text-white font-bold'
                  : 'bg-[#1E1E1E] text-[#D1D5DB]'
              }`}
            >
              {watchdog?.online ? `${Math.round((watchdog.confidence || 0) * 100)}%` : '--'}
            </span>
          </button>

          {/* Device & Lifetime Telemetry Info Button */}
          <button
            onClick={() => setIsDeviceInfoOpen(true)}
            className="p-2 rounded-lg bg-[#262626] border border-[#2E2E2E] text-[#94A3B8] hover:text-[#00AE42] hover:border-[#00AE42]/40 transition-colors"
            title="Device Hardware & Lifetime Telemetry"
          >
            <Info size={14} />
          </button>

          {/* Quick Refresh */}
          <button
            onClick={handleRefresh}
            className={`p-2 rounded-lg bg-[#262626] border border-[#2E2E2E] text-[#94A3B8] hover:text-[#F3F4F6] transition-colors ${
              isRefreshing ? 'animate-spin text-[#00AE42]' : ''
            }`}
            title="Refresh All Telemetry"
          >
            <RefreshCw size={14} />
          </button>

          {/* Server Connection Status Dot */}
          <div
            className="flex items-center justify-center p-2 rounded-lg bg-[#262626] border border-[#2E2E2E]"
            title={serverConnected ? 'Server Online' : 'Server Reconnecting'}
          >
            {serverConnected ? (
              <Wifi size={14} className="text-[#00AE42]" />
            ) : (
              <WifiOff size={14} className="text-[#EF4444] animate-pulse" />
            )}
          </div>
        </div>
      </div>
    </header>

      {/* Modals */}
      <DeviceInfoModal
        isOpen={isDeviceInfoOpen}
        onClose={() => setIsDeviceInfoOpen(false)}
      />
      <AddPrinterModal
        isOpen={isAddPrinterOpen}
        onClose={() => setIsAddPrinterOpen(false)}
      />
    </>
  );
};
