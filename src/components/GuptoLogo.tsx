import React from 'react';

interface GuptoLogoProps {
  size?: number;
  className?: string;
}

export const GuptoLogo: React.FC<GuptoLogoProps> = ({ size = 40, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
      <linearGradient id="glowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
      </linearGradient>
      <radialGradient id="innerGlow" cx="50%" cy="35%" r="50%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
        <stop offset="100%" stopColor="rgba(0,0,0,0)" />
      </radialGradient>
    </defs>

    {/* Background rounded square */}
    <rect width="40" height="40" rx="10" fill="url(#bgGrad)" />
    <rect width="40" height="40" rx="10" fill="url(#innerGlow)" />

    {/* Stylised G letter + chat bubble hybrid */}
    {/* Outer arc of G */}
    <path
      d="M20 7C13.373 7 8 12.373 8 19C8 25.627 13.373 31 20 31C23.2 31 26.1 29.8 28.3 27.8L28.3 21H21V24H25.1C24 25.6 22.1 26.5 20 26.5C15.86 26.5 12.5 23.14 12.5 19C12.5 14.86 15.86 11.5 20 11.5C22.2 11.5 24.2 12.4 25.6 13.9L28.7 10.8C26.6 8.7 23.4 7 20 7Z"
      fill="white"
      opacity="0.95"
    />
    {/* Horizontal bar of G */}
    <rect x="21" y="21" width="7" height="3" rx="1.5" fill="white" opacity="0.95" />

    {/* Small chat bubble dot bottom right */}
    <circle cx="31" cy="31" r="4" fill="white" opacity="0.9" />
    <circle cx="31" cy="31" r="2" fill="url(#bgGrad)" />
    <circle cx="31" cy="31" r="0.8" fill="white" opacity="0.9" />
  </svg>
);

// Larger version for hero/display use
export const GuptoLogoLarge: React.FC<{ size?: number }> = ({ size = 64 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="bgGradL" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
      <radialGradient id="shineL" cx="35%" cy="25%" r="55%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
        <stop offset="100%" stopColor="rgba(0,0,0,0)" />
      </radialGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <rect width="64" height="64" rx="16" fill="url(#bgGradL)" />
    <rect width="64" height="64" rx="16" fill="url(#shineL)" />

    {/* Abstract anonymous figure / ghost + G fusion */}
    {/* Head circle */}
    <circle cx="32" cy="22" r="9" fill="none" stroke="white" strokeWidth="2.5" />
    {/* Eyes */}
    <circle cx="28.5" cy="21" r="1.5" fill="white" />
    <circle cx="35.5" cy="21" r="1.5" fill="white" />
    {/* Body — ghost shape */}
    <path
      d="M23 31V44C23 44 25.5 42 28 44C30.5 46 33.5 46 36 44C38.5 42 41 44 41 44V31C41 27.686 38.314 25 35 25H29C25.686 25 23 27.686 23 31Z"
      fill="white"
      opacity="0.9"
    />
    {/* Chat bubble accent */}
    <circle cx="47" cy="47" r="6" fill="white" opacity="0.9" />
    <circle cx="47" cy="47" r="3.5" fill="url(#bgGradL)" />
    <circle cx="47" cy="47" r="1.5" fill="white" />
    {/* Small dots on ghost body for depth */}
    <circle cx="29" cy="35" r="1" fill="url(#bgGradL)" />
    <circle cx="35" cy="35" r="1" fill="url(#bgGradL)" />
  </svg>
);
