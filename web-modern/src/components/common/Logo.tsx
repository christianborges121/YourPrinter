import React from 'react';

interface LogoProps {
  size?: number;
  showBadge?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 32, showBadge = true, className = '' }) => {
  const badgeBorderRadius = (size * 26) / 120;

  const content = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="overflow-visible"
    >
      {/* 1. Vertical Spine: (54, 25) -> (54, 95) */}
      <line
        x1="54"
        y1="25"
        x2="54"
        y2="95"
        stroke="#00AE42"
        strokeWidth={10.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 2. Y Left Branch: (29, 25) -> (54, 55) */}
      <line
        x1="29"
        y1="25"
        x2="54"
        y2="55"
        stroke="#00AE42"
        strokeWidth={10.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 3. P Loop: (54, 25) -> (77, 25) -> curve -> (77, 55) -> (54, 55) */}
      <path
        d="M 54 25 L 77 25 C 96 25 96 55 77 55 L 54 55"
        stroke="#00AE42"
        strokeWidth={10.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (showBadge) {
    return (
      <div
        className={`flex items-center justify-center shrink-0 border border-[#1E293B] shadow-[0_0_12px_rgba(0,174,66,0.18)] ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: `${badgeBorderRadius}px`,
          backgroundColor: '#0B0F19',
        }}
      >
        <div style={{ transform: 'scale(0.85)' }}>{content}</div>
      </div>
    );
  }

  return <div className={`inline-flex shrink-0 ${className}`}>{content}</div>;
};
