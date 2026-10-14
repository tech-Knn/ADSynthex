import React from 'react';

export default function AsxLogo({ size = 32 }: { size?: number }) {
  const uid = React.useId();
  const gradId = `asx-hex-${uid}`;
  const strokeId = `asx-hex-stroke-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="AdSyntheX"
    >
      <defs>
        <linearGradient id={gradId} x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id={strokeId} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      {/* Hexagon container */}
      <path
        d="M16 2 L28 9 L28 23 L16 30 L4 23 L4 9 Z"
        fill={`url(#${gradId})`}
        stroke={`url(#${strokeId})`}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* "A" mark — white strokes */}
      <path
        d="M10 23 L16 9 L22 23"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12.6 18 L19.4 18"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
