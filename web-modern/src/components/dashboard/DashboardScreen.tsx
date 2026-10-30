import React from 'react';
import { CameraCard } from './CameraCard';
import { JobProgressCard } from './JobProgressCard';
import { TemperatureCard } from './TemperatureCard';
import { ControlPanelCard } from './ControlPanelCard';
import { AmsSpoolCard } from './AmsSpoolCard';
import { WatchdogAlertBanner } from './WatchdogAlertBanner';

interface DashboardScreenProps {
  onOpenHud: () => void;
  onOpenWatchdog: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ onOpenHud, onOpenWatchdog }) => {
  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto pb-12">
      {/* Auto-Pause Defect Alert Banner (if defect triggered) */}
      <WatchdogAlertBanner onInspect={onOpenWatchdog} />

      {/* Grid Layout: Responsive 2-column or 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (Main Feed & Job Progress): 7 cols on desktop */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* Card 1: Live Camera Card */}
          <CameraCard onOpenHud={onOpenHud} onOpenWatchdog={onOpenWatchdog} />

          {/* Card 2: Job Progress Card */}
          <JobProgressCard />

          {/* Card 5: Multi-Material AMS Spool Card */}
          <AmsSpoolCard />
        </div>

        {/* Right Column (Controls & Temperatures): 5 cols on desktop */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          {/* Card 3: Temperature Card */}
          <TemperatureCard />

          {/* Card 4: Hardware Controls Card */}
          <ControlPanelCard />
        </div>
      </div>
    </div>
  );
};
