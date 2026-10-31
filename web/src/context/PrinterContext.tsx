import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type {
  ActiveSpoolData,
  FleetOverviewPrinter,
  MaterialStationStatus,
  PrinterContext,
  PrinterFeatures,
  PrinterNetworkCapabilities,
  PrinterStatusData,
} from '../types';
import { api } from '../services/api';
import { wsClient } from '../services/websocket';
import { getSavedContextId, setSavedContextId, getDisabledPrinterIds, setDisabledPrinterIds } from '../services/config';
import { addPrintHistoryItem } from '../services/printHistory';

interface PrinterContextType {
  contexts: PrinterContext[];
  visibleContexts: PrinterContext[];
  activeContextId: string | null;
  activeContext: PrinterContext | null;
  status: PrinterStatusData | null;
  features: PrinterFeatures | null;
  capabilities: PrinterNetworkCapabilities | undefined;
  materialStation: MaterialStationStatus | null;
  activeSpool: ActiveSpoolData | null;
  fleetPrinters: FleetOverviewPrinter[];
  visibleFleetPrinters: FleetOverviewPrinter[];
  disabledPrinterIds: string[];
  serverConnected: boolean;
  isLoading: boolean;

  togglePrinterDisabled: (identifierOrPrinter: { contextId?: string | null; id?: string | null; name?: string } | string) => void;
  isPrinterDisabled: (identifierOrPrinter?: { contextId?: string | null; id?: string | null; name?: string } | string | null) => boolean;
  switchContext: (contextId: string) => Promise<boolean>;
  selectPrinterByIndex: (index: number) => Promise<boolean>;
  refreshStatus: () => Promise<void>;
  refreshFleet: () => Promise<void>;
  refreshAll: () => Promise<void>;

  pausePrint: () => Promise<boolean>;
  resumePrint: () => Promise<boolean>;
  cancelPrint: () => Promise<boolean>;
  homeAxes: () => Promise<boolean>;
  setLed: (on: boolean) => Promise<boolean>;
  setBedTemp: (temp: number) => Promise<boolean>;
  setExtruderTemp: (temp: number, toolIndex?: number) => Promise<boolean>;
  setChamberTemp: (temp: number) => Promise<boolean>;
  setFiltration: (mode: 'off' | 'internal' | 'external') => Promise<boolean>;
  setCoolingFanSpeed: (percent: number) => boolean | Promise<boolean>;
  loadSlot: (slotId: number) => Promise<boolean>;
  unloadMaterial: () => Promise<boolean>;
  updateWatchdog: (config: {
    threshold?: number;
    auto_pause_enabled?: boolean;
    check_interval_sec?: number;
    consecutive_required?: number;
  }) => Promise<boolean>;
  jogAxis: (axis: string, distance: number) => boolean;
  extrudeFilament: (amountMm: number) => boolean;
  retractFilament: (amountMm: number) => boolean;
  homeSpecific: (axis: 'all' | 'xy' | 'z') => boolean;
  addPrinter: (details: {
    name: string;
    ipAddress: string;
    serialNumber?: string;
    checkCode?: string;
    printerModel?: string;
    connectNow?: boolean;
  }) => Promise<{ success: boolean; message?: string; error?: string; connectionError?: string }>;
  deletePrinter: (identifier: string) => Promise<{ success: boolean; message?: string; error?: string }>;
}

const PrinterStateContext = createContext<PrinterContextType | null>(null);

export const PrinterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [contexts, setContexts] = useState<PrinterContext[]>([]);
  const [activeContextId, setActiveContextId] = useState<string | null>(getSavedContextId());
  const [status, setStatus] = useState<PrinterStatusData | null>(null);
  const [features, setFeatures] = useState<PrinterFeatures | null>(null);
  const [materialStation, setMaterialStation] = useState<MaterialStationStatus | null>(null);
  const [activeSpool, setActiveSpool] = useState<ActiveSpoolData | null>(null);
  const [fleetPrinters, setFleetPrinters] = useState<FleetOverviewPrinter[]>([]);
  const [disabledPrinterIds, setDisabledPrinterIdsState] = useState<string[]>(() => getDisabledPrinterIds());
  const [serverConnected, setServerConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const activeContextIdRef = useRef(activeContextId);
  activeContextIdRef.current = activeContextId;

  const isPrinterDisabled = useCallback(
    (identifierOrPrinter?: { contextId?: string | null; id?: string | null; name?: string } | string | null): boolean => {
      if (!identifierOrPrinter) return false;
      if (typeof identifierOrPrinter === 'string') {
        const clean = identifierOrPrinter.trim();
        if (!clean) return false;
        return disabledPrinterIds.includes(clean);
      }
      const name = identifierOrPrinter.name?.trim();
      const id = identifierOrPrinter.contextId?.trim() || (identifierOrPrinter as any).id?.trim();
      return Boolean(
        (name && disabledPrinterIds.includes(name)) ||
        (id && disabledPrinterIds.includes(id))
      );
    },
    [disabledPrinterIds]
  );

  const togglePrinterDisabled = useCallback(
    (identifierOrPrinter: { contextId?: string | null; id?: string | null; name?: string } | string) => {
      const key =
        typeof identifierOrPrinter === 'string'
          ? identifierOrPrinter.trim()
          : (identifierOrPrinter.name?.trim() || identifierOrPrinter.contextId?.trim() || (identifierOrPrinter as any).id?.trim() || '');

      if (!key) return;

      setDisabledPrinterIdsState((prev) => {
        const cleanPrev = prev.filter(
          (id) => typeof id === 'string' && id.trim().length > 0 && id !== 'undefined' && id !== 'null'
        );
        const isCurrentlyDisabled = cleanPrev.includes(key);
        const next = isCurrentlyDisabled
          ? cleanPrev.filter((id) => id !== key)
          : [...cleanPrev, key];
        setDisabledPrinterIds(next);
        return next;
      });
    },
    []
  );

  const visibleContexts = contexts.filter((c) => !isPrinterDisabled(c));

  const visibleFleetPrinters = fleetPrinters.filter((p) => !isPrinterDisabled(p));

  const activeContext =
    visibleContexts.find((c) => c.contextId === activeContextId) ||
    visibleContexts[0] ||
    contexts.find((c) => c.contextId === activeContextId) ||
    contexts[0] ||
    null;

  // Auto-switch away from disabled context if active
  useEffect(() => {
    if (visibleContexts.length > 0 && activeContextId) {
      const isCurrentDisabled =
        disabledPrinterIds.includes(activeContextId) ||
        !visibleContexts.some((c) => c.contextId === activeContextId);
      if (isCurrentDisabled && visibleContexts[0]) {
        setActiveContextId(visibleContexts[0].contextId);
        setSavedContextId(visibleContexts[0].contextId);
      }
    }
  }, [disabledPrinterIds, visibleContexts, activeContextId]);

  // Fetch Printer Status, Features, Station, and Spool
  const refreshStatus = useCallback(async () => {
    const currentId = activeContextIdRef.current;
    try {
      const [statusRes, featuresRes, stationRes, spoolRes] = await Promise.allSettled([
        api.getPrinterStatus(currentId || undefined),
        api.getPrinterFeatures(currentId || undefined),
        api.getMaterialStation(currentId || undefined),
        api.getActiveSpool(currentId || undefined),
      ]);

      if (statusRes.status === 'fulfilled' && statusRes.value.status) {
        const rawStatus = statusRes.value.status;
        const rawProg = rawStatus.progress;
        const normProg = typeof rawProg === 'number' && rawProg > 0 && rawProg <= 1.0 ? rawProg * 100 : rawProg;
        setStatus({
          ...rawStatus,
          progress: normProg,
        });
      }
      if (featuresRes.status === 'fulfilled' && featuresRes.value.features) {
        setFeatures(featuresRes.value.features);
      }
      if (stationRes.status === 'fulfilled' && stationRes.value.status) {
        setMaterialStation(stationRes.value.status);
      }
      if (spoolRes.status === 'fulfilled' && spoolRes.value.spool) {
        setActiveSpool(spoolRes.value.spool);
      }
    } catch {
      // Telemetry fetch failed
    }
  }, []);

  // Fetch Fleet Overview
  const refreshFleet = useCallback(async () => {
    try {
      const res = await api.getPrintersOverview();
      if (res.success && res.printers) {
        setFleetPrinters(res.printers);
      }
    } catch {
      // fleet overview error
    }
  }, []);

  // Fetch Contexts and initial active
  const refreshContexts = useCallback(async () => {
    try {
      const res = await api.getContexts();
      if (res.contexts) {
        const normalized = res.contexts.map((c: any) => ({
          ...c,
          contextId: c.contextId || c.id || c.name,
          isConnected: c.isConnected ?? c.isActive ?? true,
        }));
        setContexts(normalized);
        const resolvedActive =
          activeContextIdRef.current && normalized.some((c: any) => c.contextId === activeContextIdRef.current)
            ? activeContextIdRef.current
            : res.activeContextId || (normalized[0]?.contextId ?? null);

        if (resolvedActive) {
          setActiveContextId(resolvedActive);
          setSavedContextId(resolvedActive);
        }
      }
    } catch {
      // Context fetch failed
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.allSettled([refreshContexts(), refreshFleet()]);
      await refreshStatus();
    } finally {
      setIsLoading(false);
    }
  }, [refreshContexts, refreshFleet, refreshStatus]);

  // Initial load and WebSocket connection
  useEffect(() => {
    refreshAll();
    wsClient.connect();

    const unbindStatus = wsClient.onStatus((wsStatus) => {
      const rawProg = wsStatus.progress;
      const normProg = typeof rawProg === 'number' && rawProg > 0 && rawProg <= 1.0 ? rawProg * 100 : rawProg;
      setStatus({
        ...wsStatus,
        progress: normProg,
      });
    });

    const unbindSpool = wsClient.onSpool((spool) => {
      setActiveSpool(spool);
    });

    const unbindConnection = wsClient.onConnection((connected) => {
      setServerConnected(connected);
      if (connected) {
        refreshAll();
      }
    });

    // Regular polling fallback every 5s if WebSocket is idle
    const pollInterval = window.setInterval(() => {
      refreshStatus();
      refreshFleet();
    }, 5000);

    return () => {
      unbindStatus();
      unbindSpool();
      unbindConnection();
      clearInterval(pollInterval);
      wsClient.disconnect();
    };
  }, [refreshAll, refreshStatus, refreshFleet]);

  // Track print completion for print history
  const activeJobTrackerRef = useRef<{
    jobName: string;
    startTime: number;
    wasPrinting: boolean;
  }>({ jobName: '', startTime: 0, wasPrinting: false });

  useEffect(() => {
    if (!status) return;
    const stateStr = (status.printerState || '').toLowerCase();
    const isPrinting = /print|busy|running/i.test(stateStr);

    if (isPrinting && status.jobName) {
      if (!activeJobTrackerRef.current.wasPrinting || activeJobTrackerRef.current.jobName !== status.jobName) {
        activeJobTrackerRef.current = {
          jobName: status.jobName,
          startTime: Date.now(),
          wasPrinting: true,
        };
      }
    } else if (activeJobTrackerRef.current.wasPrinting && !isPrinting) {
      const isCompleted = /complet|finish|done/i.test(stateStr) || status.progress >= 99;
      const isCancelled = /cancel|abort|stop/i.test(stateStr);
      const isFailed = /fail|error/i.test(stateStr);

      if (isCompleted || isCancelled || isFailed || stateStr === 'idle' || stateStr === 'ready') {
        const durationSec = Math.max(1, Math.round((Date.now() - activeJobTrackerRef.current.startTime) / 1000));
        addPrintHistoryItem({
          filename: activeJobTrackerRef.current.jobName,
          displayName: activeJobTrackerRef.current.jobName.replace(/\.(gcode|3mf|gx|g)$/i, ''),
          printerName: activeContext?.name || 'Flashforge Printer',
          contextId: activeContextId || undefined,
          startTime: new Date(activeJobTrackerRef.current.startTime).toISOString(),
          endTime: new Date().toISOString(),
          durationSeconds: durationSec,
          filamentMeters: status.estimatedLength,
          filamentGrams: status.estimatedWeight,
          layers: status.totalLayers,
          status: isCancelled ? 'cancelled' : isFailed ? 'failed' : 'completed',
        });
        activeJobTrackerRef.current.wasPrinting = false;
      }
    }
  }, [status, activeContext?.name, activeContextId]);

  // Context Switch
  const switchContext = useCallback(
    async (contextId: string): Promise<boolean> => {
      try {
        const res = await api.switchContext(contextId);
        if (res.success) {
          setActiveContextId(contextId);
          setSavedContextId(contextId);
          await refreshStatus();
          return true;
        }
      } catch {
        // failed to switch context
      }
      return false;
    },
    [refreshStatus]
  );

  // 0-based index printer switcher e.g. /printers/0, /printers/1
  const selectPrinterByIndex = useCallback(
    async (index: number): Promise<boolean> => {
      try {
        const res = await api.selectPrinter(index);
        if (res.success) {
          const targetContext = contexts[index];
          if (targetContext) {
            setActiveContextId(targetContext.contextId);
            setSavedContextId(targetContext.contextId);
          }
          await refreshAll();
          return true;
        }
      } catch {
        // failed
      }
      return false;
    },
    [contexts, refreshAll]
  );

  // Actions
  const pausePrint = useCallback(async () => {
    const res = await api.pauseJob(activeContextId || undefined);
    if (res.success) await refreshStatus();
    return res.success;
  }, [activeContextId, refreshStatus]);

  const resumePrint = useCallback(async () => {
    const res = await api.resumeJob(activeContextId || undefined);
    if (res.success) await refreshStatus();
    return res.success;
  }, [activeContextId, refreshStatus]);

  const cancelPrint = useCallback(async () => {
    const res = await api.cancelJob(activeContextId || undefined);
    if (res.success) await refreshStatus();
    return res.success;
  }, [activeContextId, refreshStatus]);

  const homeAxes = useCallback(async () => {
    const res = await api.homeAxes(activeContextId || undefined);
    return res.success;
  }, [activeContextId]);

  const setLed = useCallback(async (on: boolean) => {
    const res = await api.setLed(on, activeContextId || undefined);
    return res.success;
  }, [activeContextId]);

  const setBedTemp = useCallback(
    async (temp: number) => {
      const res = await api.setBedTemp(temp, activeContextId || undefined);
      if (res.success) await refreshStatus();
      return res.success;
    },
    [activeContextId, refreshStatus]
  );

  const setExtruderTemp = useCallback(
    async (temp: number, toolIndex = 0) => {
      const res = await api.setExtruderTemp(temp, toolIndex, activeContextId || undefined);
      if (res.success) await refreshStatus();
      return res.success;
    },
    [activeContextId, refreshStatus]
  );

  const setChamberTemp = useCallback(
    async (temp: number) => {
      const res = await api.setChamberTemp(temp, activeContextId || undefined);
      if (res.success) await refreshStatus();
      return res.success;
    },
    [activeContextId, refreshStatus]
  );

  const setFiltration = useCallback(
    async (mode: 'off' | 'internal' | 'external') => {
      // Optimistically update filtration mode immediately
      const mappedMode: 'none' | 'internal' | 'external' = mode === 'off' ? 'none' : mode;
      setStatus((prev) => (prev ? { ...prev, filtrationMode: mappedMode } : prev));
      const res = await api.setFiltration(mode, activeContextId || undefined);
      if (res.success) await refreshStatus();
      return res.success;
    },
    [activeContextId, refreshStatus]
  );

  const setCoolingFanSpeed = useCallback(
    async (percent: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(percent)));
      // Optimistically update telemetry fanSpeed
      setStatus((prev) => (prev ? { ...prev, coolingFanSpeed: clamped, fanSpeed: clamped } : prev));
      try {
        const res = await api.setFanSpeed(clamped, activeContextId || undefined);
        if (res.success) {
          await refreshStatus();
          return true;
        }
      } catch {
        // Fall back to WebSocket G-code for printers with legacy TCP
      }
      if (clamped === 0) {
        return wsClient.executeGcode('M107');
      }
      const pwm = Math.round((clamped / 100) * 255);
      return wsClient.executeGcode(`M106 S${pwm}`);
    },
    [activeContextId, refreshStatus]
  );

  const loadSlot = useCallback(
    async (slotId: number) => {
      const res = await api.loadMaterialSlot(slotId, activeContextId || undefined);
      if (res.success) {
        setTimeout(refreshStatus, 1000);
      }
      return res.success;
    },
    [activeContextId, refreshStatus]
  );

  const unloadMaterial = useCallback(async () => {
    const res = await api.unloadMaterial(activeContextId || undefined);
    if (res.success) {
      setTimeout(refreshStatus, 1000);
    }
    return res.success;
  }, [activeContextId, refreshStatus]);

  const updateWatchdog = useCallback(
    async (config: {
      threshold?: number;
      auto_pause_enabled?: boolean;
      check_interval_sec?: number;
      consecutive_required?: number;
    }) => {
      const res = await api.updateWatchdogConfig(config, activeContextId || undefined);
      if (res.success) await refreshStatus();
      return res.success;
    },
    [activeContextId, refreshStatus]
  );

  const jogAxis = useCallback((axis: string, distance: number) => {
    // Relative motion G-code: G91; G1 <axis><distance> F3000; G90
    const gcode = `G91\nG1 ${axis}${distance} F3000\nG90`;
    return wsClient.executeGcode(gcode);
  }, []);

  const extrudeFilament = useCallback((amountMm: number) => {
    return wsClient.executeGcode(`G91\nG1 E${amountMm} F300\nG90`);
  }, []);

  const retractFilament = useCallback((amountMm: number) => {
    return wsClient.executeGcode(`G91\nG1 E-${amountMm} F300\nG90`);
  }, []);

  const homeSpecific = useCallback((axis: 'all' | 'xy' | 'z') => {
    const cmd = axis === 'xy' ? 'G28 X Y' : axis === 'z' ? 'G28 Z' : 'G28';
    return wsClient.executeGcode(cmd);
  }, []);

  const addPrinter = useCallback(
    async (details: {
      name: string;
      ipAddress: string;
      serialNumber?: string;
      checkCode?: string;
      printerModel?: string;
      connectNow?: boolean;
    }) => {
      const res = await api.addPrinter(details);
      await refreshAll();
      return res;
    },
    [refreshAll]
  );

  const deletePrinter = useCallback(
    async (identifier: string) => {
      const res = await api.deletePrinter(identifier);
      await refreshAll();
      return res;
    },
    [refreshAll]
  );

  return (
    <PrinterStateContext.Provider
      value={{
        contexts,
        visibleContexts,
        activeContextId,
        activeContext,
        status,
        features,
        capabilities: features?.capabilities,
        materialStation,
        activeSpool,
        fleetPrinters,
        visibleFleetPrinters,
        disabledPrinterIds,
        serverConnected,
        isLoading,
        togglePrinterDisabled,
        isPrinterDisabled,
        switchContext,
        selectPrinterByIndex,
        refreshStatus,
        refreshFleet,
        refreshAll,
        pausePrint,
        resumePrint,
        cancelPrint,
        homeAxes,
        setLed,
        setBedTemp,
        setExtruderTemp,
        setChamberTemp,
        setFiltration,
        setCoolingFanSpeed,
        loadSlot,
        unloadMaterial,
        updateWatchdog,
        jogAxis,
        extrudeFilament,
        retractFilament,
        homeSpecific,
        addPrinter,
        deletePrinter,
      }}
    >
      {children}
    </PrinterStateContext.Provider>
  );
};

export const usePrinter = (): PrinterContextType => {
  const context = useContext(PrinterStateContext);
  if (!context) {
    throw new Error('usePrinter must be used within a PrinterProvider');
  }
  return context;
};
