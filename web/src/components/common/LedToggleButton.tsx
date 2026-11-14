import React from 'react';
import { Lightbulb, LightbulbOff } from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';

/**
 * Shared chamber lighting toggle button synchronized directly with PrinterContext status.ledState
 * so all instances across Camera and Hardware Controls remain identically in sync.
 */
export const LedToggleButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { activeContext, status, features, capabilities, setLed } = usePrinter();

  const modelStr = (activeContext?.model || '').toLowerCase();
  const nameStr = (activeContext?.name || '').toLowerCase();
  const isCreator5 =
    modelStr.includes('creator') ||
    nameStr.includes('creator') ||
    (modelStr.includes('ad5x') && nameStr.includes('c5'));
  const hasLedControl = isCreator5 ? true : (capabilities?.hasLedControl ?? (features?.hasLED ?? true));

  if (!hasLedControl) {
    return null;
  }

  const isLedOn = Boolean(status?.ledState);

  return (
    <button
      type="button"
      onClick={() => void setLed(!isLedOn)}
      aria-label={isLedOn ? 'Turn Chamber Light Off' : 'Turn Chamber Light On'}
      aria-pressed={isLedOn}
      title={isLedOn ? 'Chamber Light: ON (Click to turn off)' : 'Chamber Light: OFF (Click to turn on)'}
      className={`p-1.5 rounded-lg border transition-all ${
        isLedOn
          ? 'bg-[#F59E0B]/20 border-[#F59E0B]/50 text-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.25)]'
          : 'bg-[#262626] border-[#2E2E2E] text-[#64748B] hover:text-[#94A3B8]'
      } ${className}`}
    >
      {isLedOn ? <Lightbulb size={15} /> : <LightbulbOff size={15} />}
    </button>
  );
};
