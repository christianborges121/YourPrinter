import React from 'react';

interface StatusBadgeProps {
  statusText?: string | null;
  isPrinting?: boolean;
  isCompleted?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  statusText = 'Ready',
  isPrinting = false,
  isCompleted = false,
  className = '',
}) => {
  const display = statusText || 'Ready';
  const lower = display.toLowerCase();

  let bgClass = 'bg-[#262626]';
  let fgClass = 'text-[#D1D5DB]';
  let dotClass = 'bg-[#F59E0B]';
  let borderClass = 'border-[#F59E0B]/30';

  if (isCompleted || lower.includes('complete') || lower.includes('finished')) {
    bgClass = 'bg-[#3B82F6]/15';
    fgClass = 'text-[#3B82F6]';
    dotClass = 'bg-[#3B82F6]';
    borderClass = 'border-[#3B82F6]/30';
  } else if (isPrinting || lower.includes('print') || lower.includes('busy') || lower.includes('running')) {
    bgClass = 'bg-[#00AE42]/15';
    fgClass = 'text-[#00AE42]';
    dotClass = 'bg-[#00AE42] shadow-[0_0_8px_#00AE42]';
    borderClass = 'border-[#00AE42]/30';
  } else if (lower.includes('offline') || lower.includes('disconnected')) {
    bgClass = 'bg-[#2E2E2E]';
    fgClass = 'text-[#94A3B8]';
    dotClass = 'bg-[#94A3B8]';
    borderClass = 'border-[#94A3B8]/30';
  } else if (lower.includes('pause')) {
    bgClass = 'bg-[#F59E0B]/15';
    fgClass = 'text-[#F59E0B]';
    dotClass = 'bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]';
    borderClass = 'border-[#F59E0B]/30';
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold select-none ${bgClass} ${fgClass} ${borderClass} ${className}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
      <span className="capitalize truncate">{display}</span>
    </div>
  );
};
