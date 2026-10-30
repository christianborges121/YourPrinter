import React, { useState, useEffect } from 'react';
import {
  Settings,
  Server,
  Video,
  Check,
  AlertCircle,
  RefreshCw,
  Printer,
  Trash2,
  AlertTriangle,
  Plus,
  EyeOff,
  Bell,
  Layers,
  Send,
} from 'lucide-react';
import {
  getServerUrl,
  setServerUrl,
  getCameraContinuous,
  setCameraContinuous,
} from '../../services/config';
import { usePrinter } from '../../context/PrinterContext';
import { Modal } from '../common/Modal';
import { Logo } from '../common/Logo';
import { AddPrinterModal } from '../modals/AddPrinterModal';
import { api } from '../../services/api';
import type { PrinterContext, SpoolmanConfigData } from '../../types';

export const SettingsScreen: React.FC = () => {
  const { contexts, deletePrinter, refreshAll, togglePrinterDisabled, isPrinterDisabled, activeContextId } = usePrinter();

  const [url, setUrl] = useState<string>(getServerUrl());
  const [continuous, setContinuous] = useState<boolean>(getCameraContinuous());
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Discord Notifications State
  const [discordEnabled, setDiscordEnabled] = useState<boolean>(false);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState<string>('');
  const [discordIncludeSnapshots, setDiscordIncludeSnapshots] = useState<boolean>(true);
  const [discordIntervalMinutes, setDiscordIntervalMinutes] = useState<number>(5);
  const [testingDiscord, setTestingDiscord] = useState<boolean>(false);
  const [discordTestResult, setDiscordTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Spoolman State
  const [spoolmanConfig, setSpoolmanConfig] = useState<SpoolmanConfigData | null>(null);
  const [loadingSpoolman, setLoadingSpoolman] = useState<boolean>(false);

  // Custom Camera Stream State
  const [selectedCamPrinterName, setSelectedCamPrinterName] = useState<string>('');
  const [customCamEnabled, setCustomCamEnabled] = useState<boolean>(false);
  const [customCamUrl, setCustomCamUrl] = useState<string>('');

  // Add printer modal state
  const [isAddPrinterOpen, setIsAddPrinterOpen] = useState<boolean>(false);

  // Printer deletion state
  const [printerToDelete, setPrinterToDelete] = useState<PrinterContext | null>(null);
  const [confirmInput, setConfirmInput] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    // Load Discord Config
    api.getDiscordConfig()
      .then((res) => {
        if (res && res.success !== false) {
          setDiscordEnabled(Boolean(res.enabled));
          setDiscordWebhookUrl(res.webhookUrl || '');
          setDiscordIncludeSnapshots(res.includeCameraSnapshots ?? true);
          setDiscordIntervalMinutes(res.updateIntervalMinutes || 5);
        }
      })
      .catch(() => {
        // ignore initial discord fetch error
      });

    // Load Spoolman Config
    setLoadingSpoolman(true);
    api.getSpoolmanConfig()
      .then((cfg) => {
        setSpoolmanConfig(cfg);
      })
      .catch(() => {
        setSpoolmanConfig(null);
      })
      .finally(() => {
        setLoadingSpoolman(false);
      });
  }, [activeContextId]);

  const currentCamPrinter =
    contexts.find((c) => c.name === selectedCamPrinterName) ||
    contexts.find((c) => c.contextId === activeContextId) ||
    contexts[0];

  useEffect(() => {
    if (contexts.length > 0 && !selectedCamPrinterName) {
      const initialPrinter = contexts.find((c) => c.contextId === activeContextId) || contexts[0];
      if (initialPrinter) {
        setSelectedCamPrinterName(initialPrinter.name);
        setCustomCamEnabled(Boolean(initialPrinter.printerDetails?.customCameraEnabled));
        setCustomCamUrl(initialPrinter.printerDetails?.customCameraUrl || '');
      }
    }
  }, [contexts, activeContextId, selectedCamPrinterName]);

  const handleSave = async () => {
    setServerUrl(url);
    setCameraContinuous(continuous);

    // Save Custom Camera Settings for Selected Printer
    if (currentCamPrinter) {
      try {
        await api.updatePrinterSettings(currentCamPrinter.name, {
          customCameraEnabled: customCamEnabled,
          customCameraUrl: customCamUrl.trim(),
        });
      } catch {
        // ignore
      }
    }

    // Save Discord Config
    try {
      await api.updateDiscordConfig({
        enabled: discordEnabled,
        webhookUrl: discordWebhookUrl,
        includeCameraSnapshots: discordIncludeSnapshots,
        updateIntervalMinutes: Number(discordIntervalMinutes),
      });
    } catch {
      // ignore
    }

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      window.location.reload();
    }, 800);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/api/auth/status`, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        setTestResult({ ok: true, message: `Successfully connected to YourPrinter server (${res.status} OK)` });
      } else {
        setTestResult({ ok: false, message: `Server replied with HTTP ${res.status}` });
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: `Failed to connect: ${e.message || 'Network error'}` });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleTestDiscord = async () => {
    if (!discordWebhookUrl.trim()) {
      setDiscordTestResult({ ok: false, message: 'Please enter a Discord Webhook URL first.' });
      return;
    }
    setTestingDiscord(true);
    setDiscordTestResult(null);
    try {
      const res = await api.testDiscordWebhook({
        webhookUrl: discordWebhookUrl.trim(),
        includeCameraSnapshots: discordIncludeSnapshots,
        contextId: activeContextId || undefined,
      });
      if (res.success) {
        setDiscordTestResult({ ok: true, message: 'Test notification & snapshot successfully delivered to Discord!' });
      } else {
        setDiscordTestResult({ ok: false, message: res.error || 'Failed to send Discord webhook' });
      }
    } catch (e: any) {
      setDiscordTestResult({ ok: false, message: e.message || 'Webhook network request failed' });
    } finally {
      setTestingDiscord(false);
    }
  };

  const handleDeletePrinter = async () => {
    if (!printerToDelete) return;
    if (confirmInput.trim().toLowerCase() !== printerToDelete.name.trim().toLowerCase()) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await deletePrinter(printerToDelete.name);
      if (res.success) {
        setPrinterToDelete(null);
        setConfirmInput('');
        await refreshAll();
      } else {
        setDeleteError(res.error || 'Failed to remove printer');
      }
    } catch (e: any) {
      setDeleteError(e?.message || 'Error deleting printer');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[#00AE42]/15 text-[#00AE42] border border-[#00AE42]/30">
          <Settings size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#F3F4F6]">App Settings</h1>
          <p className="text-xs text-[#94A3B8]">
            Configure fleet printers, network endpoints, notifications, camera streaming, and filament services
          </p>
        </div>
      </div>

      {/* Fleet Printers Management Card */}
      <div className="p-5 rounded-xl bg-[#1E1E1E] border border-[#2E2E2E] flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#2E2E2E]">
          <div className="flex items-center gap-2">
            <Printer size={16} className="text-[#00AE42]" />
            <h3 className="text-sm font-bold text-[#F3F4F6]">Configured Fleet Printers</h3>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-[#94A3B8]">
              {contexts.length} {contexts.length === 1 ? 'Printer' : 'Printers'}
            </span>
            <button
              type="button"
              onClick={() => setIsAddPrinterOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-xs font-semibold text-white shadow-sm transition-colors cursor-pointer"
            >
              <Plus size={13} />
              <span>Add Printer</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {contexts.length === 0 ? (
            <div className="p-4 text-center text-xs text-[#94A3B8] bg-[#262626] rounded-lg">
              No printers registered. Use "Add Printer" above to register a printer.
            </div>
          ) : (
            contexts.map((ctx) => {
              const disabled = isPrinterDisabled(ctx);
              return (
                <div
                  key={ctx.contextId || ctx.name}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border gap-3 transition-colors ${
                    disabled
                      ? 'bg-[#1A1A1A] border-[#2A2A2A] opacity-80'
                      : 'bg-[#262626] border-[#2E2E2E]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        disabled
                          ? 'bg-[#6B7280]'
                          : ctx.isConnected
                          ? 'bg-[#00AE42] shadow-[0_0_6px_#00AE42]'
                          : 'bg-[#94A3B8]'
                      }`}
                    />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold truncate ${disabled ? 'text-[#94A3B8] line-through' : 'text-[#F3F4F6]'}`}>
                          {ctx.name}
                        </span>
                        {disabled && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#374151] text-[#9CA3AF]">
                            <EyeOff size={10} /> Hidden
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#94A3B8] truncate">
                        {ctx.model || 'Flashforge 3D Printer'} • {ctx.printerDetails?.ipAddress || 'IP unassigned'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    {/* Enable / Disable Radio Button */}
                    <button
                      type="button"
                      onClick={() => togglePrinterDisabled(ctx)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer select-none ${
                        disabled
                          ? 'bg-[#1E1E1E] border-[#383838] text-[#94A3B8] hover:border-[#4B5563]'
                          : 'bg-[#00AE42]/15 border-[#00AE42]/40 text-[#00AE42] hover:bg-[#00AE42]/25'
                      }`}
                      title={disabled ? 'Enable printer visibility' : 'Hide printer from UI'}
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors ${
                          disabled ? 'border-[#6B7280]' : 'border-[#00AE42] bg-[#00AE42]/20'
                        }`}
                      >
                        {!disabled && <span className="w-1.5 h-1.5 rounded-full bg-[#00AE42]" />}
                      </span>
                      <span>{disabled ? 'Disabled' : 'Enabled'}</span>
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setPrinterToDelete(ctx);
                        setConfirmInput('');
                        setDeleteError(null);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E1E1E] hover:bg-[#EF4444]/20 text-[#94A3B8] hover:text-[#EF4444] border border-[#2E2E2E] hover:border-[#EF4444]/40 text-xs font-semibold transition-all shrink-0 cursor-pointer"
                      title={`Remove ${ctx.name} from fleet`}
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Discord Webhook Notifications Card */}
      <div className="p-5 rounded-xl bg-[#1E1E1E] border border-[#2E2E2E] flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#2E2E2E]">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-[#5865F2]" />
            <h3 className="text-sm font-bold text-[#F3F4F6]">Discord Webhook Notifications</h3>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
            discordEnabled
              ? 'bg-[#00AE42]/15 text-[#00AE42] border-[#00AE42]/30'
              : 'bg-[#262626] text-[#94A3B8] border-[#383838]'
          }`}>
            {discordEnabled ? 'ACTIVE' : 'DISABLED'}
          </span>
        </div>

        {/* Enable Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[#F3F4F6]">Enable Discord Status Updates</span>
            <span className="text-[11px] text-[#94A3B8]">
              Receive rich embed alerts for print completions, failures, and periodic status
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDiscordEnabled(!discordEnabled)}
            className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none p-0.5 ${
              discordEnabled ? 'bg-[#5865F2]' : 'bg-[#383838]'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                discordEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Webhook URL Input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-[#94A3B8]">Discord Webhook URL</label>
          <input
            type="password"
            value={discordWebhookUrl}
            onChange={(e) => setDiscordWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="w-full bg-[#262626] border border-[#2E2E2E] focus:border-[#5865F2] rounded-lg px-3.5 py-2 text-xs font-mono text-[#F3F4F6] outline-none"
          />
        </div>

        {/* Include Camera Snapshot Toggle */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[#F3F4F6]">Attach Camera Snapshots</span>
            <span className="text-[11px] text-[#94A3B8]">
              Include live printer camera frame in Discord notifications
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDiscordIncludeSnapshots(!discordIncludeSnapshots)}
            className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none p-0.5 ${
              discordIncludeSnapshots ? 'bg-[#00AE42]' : 'bg-[#383838]'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                discordIncludeSnapshots ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Periodic Update Interval */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[#F3F4F6]">Periodic Status Interval</span>
            <span className="text-[11px] text-[#94A3B8]">Send progress updates every N minutes during printing</span>
          </div>
          <select
            value={discordIntervalMinutes}
            onChange={(e) => setDiscordIntervalMinutes(Number(e.target.value))}
            className="bg-[#262626] border border-[#2E2E2E] text-xs text-[#F3F4F6] rounded-lg px-3 py-1.5 outline-none"
          >
            <option value={1}>1 Minute</option>
            <option value={5}>5 Minutes</option>
            <option value={10}>10 Minutes</option>
            <option value={15}>15 Minutes</option>
            <option value={30}>30 Minutes</option>
          </select>
        </div>

        {/* Test Webhook Button & Feedback */}
        <div className="flex flex-col gap-2 pt-2 border-t border-[#2E2E2E]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleTestDiscord}
              disabled={testingDiscord || !discordWebhookUrl.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Send size={13} className={testingDiscord ? 'animate-spin' : ''} />
              <span>{testingDiscord ? 'Sending Test...' : 'Send Test Notification'}</span>
            </button>
          </div>

          {discordTestResult && (
            <div
              className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium ${
                discordTestResult.ok
                  ? 'bg-[#00AE42]/10 border border-[#00AE42]/30 text-[#00AE42]'
                  : 'bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444]'
              }`}
            >
              {discordTestResult.ok ? <Check size={14} /> : <AlertCircle size={14} />}
              <span>{discordTestResult.message}</span>
            </div>
          )}
        </div>
      </div>

      {/* Spoolman Filament Integration Card */}
      <div className="p-5 rounded-xl bg-[#1E1E1E] border border-[#2E2E2E] flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#2E2E2E]">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-[#F59E0B]" />
            <h3 className="text-sm font-bold text-[#F3F4F6]">Spoolman Filament Inventory</h3>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
            spoolmanConfig?.enabled
              ? 'bg-[#00AE42]/15 text-[#00AE42] border-[#00AE42]/30'
              : 'bg-[#262626] text-[#94A3B8] border-[#383838]'
          }`}>
            {loadingSpoolman ? 'CHECKING...' : spoolmanConfig?.enabled ? 'CONNECTED' : 'STANDBY'}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-[#D1D5DB] leading-relaxed">
            Spoolman synchronizes physical filament spool weights, materials, and colors with YourPrinter.
            Especially recommended for single-extruder printers (e.g. Flashforge Creator 5 Pro, Adventurer 5M) without AMS.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            <div className="p-3 bg-[#262626] border border-[#2E2E2E] rounded-lg flex flex-col gap-1">
              <span className="text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">Spoolman Endpoint</span>
              <span className="text-xs font-mono text-[#F3F4F6] truncate">
                {spoolmanConfig?.serverUrl || 'Configured via backend'}
              </span>
            </div>

            <div className="p-3 bg-[#262626] border border-[#2E2E2E] rounded-lg flex flex-col gap-1">
              <span className="text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">Consumption Tracking</span>
              <span className="text-xs font-semibold text-[#00AE42] capitalize">
                By {spoolmanConfig?.updateMode || 'Weight (Grams)'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Server Base URL Card */}
      <div className="p-5 rounded-xl bg-[#1E1E1E] border border-[#2E2E2E] flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[#2E2E2E]">
          <Server size={16} className="text-[#00AE42]" />
          <h3 className="text-sm font-bold text-[#F3F4F6]">YourPrinter Server Endpoint</h3>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-[#94A3B8]">Server Base URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3080"
            className="w-full bg-[#262626] border border-[#2E2E2E] focus:border-[#00AE42] rounded-lg px-3.5 py-2 text-xs sm:text-sm font-mono text-[#F3F4F6] outline-none"
          />

          {/* Quick preset buttons */}
          <div className="flex flex-wrap gap-2 mt-1">
            <button
              type="button"
              onClick={() => setUrl('http://localhost:3080')}
              className="text-[11px] font-mono px-2 py-1 rounded bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] text-[#D1D5DB]"
            >
              Port 3080 (Modern WebUI)
            </button>
            <button
              type="button"
              onClick={() => setUrl(typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3080')}
              className="text-[11px] font-mono px-2 py-1 rounded bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] text-[#D1D5DB]"
            >
              Current Origin ({typeof window !== 'undefined' ? window.location.origin : 'localhost'})
            </button>
          </div>
        </div>

        {/* Connection test */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] text-xs font-semibold text-[#D1D5DB] transition-colors"
          >
            <RefreshCw size={13} className={testingConnection ? 'animate-spin text-[#00AE42]' : ''} />
            <span>Test Connection</span>
          </button>

          {testResult && (
            <div
              className={`flex items-center gap-1.5 text-xs font-medium ${
                testResult.ok ? 'text-[#00AE42]' : 'text-[#EF4444]'
              }`}
            >
              {testResult.ok ? <Check size={14} /> : <AlertCircle size={14} />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>
      </div>

      {/* Camera & Streaming Preferences */}
      <div className="p-5 rounded-xl bg-[#1E1E1E] border border-[#2E2E2E] flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[#2E2E2E]">
          <Video size={16} className="text-[#3B82F6]" />
          <h3 className="text-sm font-bold text-[#F3F4F6]">Camera Stream Preferences</h3>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[#F3F4F6]">
              Continuous Live Streaming by Default
            </span>
            <span className="text-[11px] text-[#94A3B8]">
              Disable the 30-second bandwidth conservation timeout
            </span>
          </div>

          <button
            type="button"
            onClick={() => setContinuous(!continuous)}
            className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none p-0.5 ${
              continuous ? 'bg-[#00AE42]' : 'bg-[#383838]'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                continuous ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Custom Stream URL Configuration (Useful for CFW, Crowsnest, or non-standard ports) */}
        <div className="pt-3 border-t border-[#2E2E2E] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-[#F3F4F6]">Custom Camera Stream URL</span>
              <span className="text-[11px] text-[#94A3B8]">
                Override default RTSP/MJPEG stream (essential for CFW / Klipper / Crowsnest)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCustomCamEnabled(!customCamEnabled)}
              className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none p-0.5 ${
                customCamEnabled ? 'bg-[#3B82F6]' : 'bg-[#383838]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  customCamEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {customCamEnabled && (
            <div className="flex flex-col gap-2.5 p-3.5 bg-[#181818] rounded-lg border border-[#2E2E2E]">
              {contexts.length > 1 && (
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#94A3B8] font-semibold">Target Printer</label>
                  <select
                    value={selectedCamPrinterName}
                    onChange={(e) => {
                      const chosenName = e.target.value;
                      setSelectedCamPrinterName(chosenName);
                      const chosen = contexts.find((c) => c.name === chosenName);
                      if (chosen?.printerDetails) {
                        setCustomCamEnabled(Boolean(chosen.printerDetails.customCameraEnabled));
                        setCustomCamUrl(chosen.printerDetails.customCameraUrl || '');
                      }
                    }}
                    className="bg-[#262626] border border-[#2E2E2E] text-xs text-[#F3F4F6] rounded-lg px-3 py-1.5 outline-none"
                  >
                    {contexts.map((ctx) => (
                      <option key={ctx.contextId} value={ctx.name}>
                        {ctx.name} ({ctx.printerDetails?.printerModel || 'Printer'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#94A3B8] font-semibold">Stream URL (MJPEG / RTSP / HTTP)</label>
                <input
                  type="text"
                  value={customCamUrl}
                  onChange={(e) => setCustomCamUrl(e.target.value)}
                  placeholder="http://192.168.1.50:8080/?action=stream"
                  className="w-full bg-[#262626] border border-[#2E2E2E] focus:border-[#3B82F6] rounded-lg px-3 py-1.5 text-xs font-mono text-[#F3F4F6] outline-none"
                />
              </div>

              {/* Quick Preset Buttons for Creator 5 Pro / CFW */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[10px] text-[#94A3B8]">Presets:</span>
                {(() => {
                  const ip = currentCamPrinter?.printerDetails?.ipAddress || currentCamPrinter?.printerDetails?.IPAddress;
                  if (!ip) {
                    return <span className="text-[10px] text-[#6B7280]">Select a connected printer to see IP presets</span>;
                  }
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => setCustomCamUrl(`http://${ip}:8080/?action=stream`)}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] text-[#D1D5DB]"
                      >
                        Port 8080 (MJPEG)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomCamUrl(`http://${ip}/webcam/?action=stream`)}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] text-[#D1D5DB]"
                      >
                        /webcam/ (Crowsnest)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomCamUrl(`rtsp://${ip}:8554/live`)}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] text-[#D1D5DB]"
                      >
                        Port 8554 (RTSP Stock)
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between pt-2">
        {savedSuccess ? (
          <span className="text-xs text-[#00AE42] font-semibold flex items-center gap-1.5">
            <Check size={16} /> Saved! Reloading app...
          </span>
        ) : (
          <span />
        )}

        <button
          onClick={handleSave}
          className="px-6 py-2.5 rounded-xl bg-[#00AE42] hover:bg-[#009638] text-white text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer"
        >
          Save & Apply
        </button>
      </div>

      {/* Brand & System Info */}
      <div className="flex items-center justify-center gap-3 pt-6 text-center border-t border-[#2E2E2E]">
        <Logo size={28} />
        <div className="flex flex-col text-left">
          <span className="text-xs font-bold text-[#F3F4F6]">YourPrinter</span>
          <span className="text-[10px] text-[#94A3B8]">
            v1.0.7 • Mobile Parity Edition (React + Vite + Tailwind)
          </span>
        </div>
      </div>

      {/* Delete Confirmation Modal Requiring Printer Name */}
      <Modal
        isOpen={printerToDelete !== null}
        onClose={() => {
          if (!isDeleting) {
            setPrinterToDelete(null);
            setConfirmInput('');
            setDeleteError(null);
          }
        }}
        title={
          <div className="flex items-center gap-2 text-[#EF4444]">
            <AlertTriangle size={18} />
            <span>Confirm Printer Deletion</span>
          </div>
        }
        maxWidth="max-w-md"
      >
        {printerToDelete && (
          <div className="p-5 flex flex-col gap-4">
            <p className="text-xs text-[#D1D5DB] leading-relaxed">
              You are about to remove <strong className="text-white">"{printerToDelete.name}"</strong> from YourPrinter. This will erase saved connection details and telemetry for this printer.
            </p>

            <div className="flex flex-col gap-1.5 bg-[#121212] p-3 rounded-lg border border-[#2E2E2E]">
              <label className="text-xs text-[#94A3B8]">
                To confirm, type <span className="font-mono font-bold text-white bg-[#262626] px-1.5 py-0.5 rounded select-all border border-[#383838]">{printerToDelete.name}</span> below:
              </label>
              <input
                type="text"
                autoFocus
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={printerToDelete.name}
                className="w-full bg-[#1E1E1E] border border-[#2E2E2E] focus:border-[#EF4444] rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    confirmInput.trim().toLowerCase() === printerToDelete.name.trim().toLowerCase() &&
                    !isDeleting
                  ) {
                    void handleDeletePrinter();
                  }
                }}
              />
            </div>

            {deleteError && (
              <p className="text-xs text-[#EF4444] font-medium bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-lg p-2.5">
                {deleteError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2E2E2E]">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setPrinterToDelete(null);
                  setConfirmInput('');
                  setDeleteError(null);
                }}
                className="px-4 py-2 rounded-lg bg-[#262626] hover:bg-[#383838] text-xs font-semibold text-[#D1D5DB] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting || confirmInput.trim().toLowerCase() !== printerToDelete.name.trim().toLowerCase()}
                onClick={handleDeletePrinter}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  confirmInput.trim().toLowerCase() === printerToDelete.name.trim().toLowerCase()
                    ? 'bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-md cursor-pointer'
                    : 'bg-[#2E2E2E] text-[#94A3B8] opacity-40 cursor-not-allowed'
                }`}
              >
                <Trash2 size={13} />
                <span>{isDeleting ? 'Deleting...' : 'Permanently Delete'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Printer Modal */}
      <AddPrinterModal
        isOpen={isAddPrinterOpen}
        onClose={() => setIsAddPrinterOpen(false)}
      />
    </div>
  );
};
