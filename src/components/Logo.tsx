import React from 'react';

interface LogoProps {
  className?: string;
}

export default function Logo({ className = "w-8 h-8" }: LogoProps) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 512 512" 
      className={`${className} rounded-xl shadow-xs shrink-0`}
    >
      <defs>
        <linearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
        <linearGradient id="logoAccent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e0e7ff" />
          <stop offset="100%" stopColor="#c7d2fe" />
        </linearGradient>
      </defs>

      <rect width="512" height="512" rx="112" fill="url(#logoBg)" />

      <g>
        <rect x="116" y="186" width="280" height="190" rx="28" fill="#ffffff" />
        <path d="M126 146 L186 106 H386 L326 146 Z" fill="url(#logoAccent)" />
        <path d="M146 146 h220 v20 H146 z" fill="#ffffff" />
        
        <path d="M190 106 L170 146" stroke="#4338ca" strokeWidth="8" strokeLinecap="round" />
        <path d="M250 106 L230 146" stroke="#4338ca" strokeWidth="8" strokeLinecap="round" />
        <path d="M310 106 L290 146" stroke="#4338ca" strokeWidth="8" strokeLinecap="round" />

        <circle cx="256" cy="281" r="44" fill="#4f46e5" />
        <polygon points="246,261 278,281 246,301" fill="#ffffff" />
      </g>
    </svg>
  );
}

