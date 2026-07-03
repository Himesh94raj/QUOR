import React from "react";

interface QuorLogoProps {
  size?: number;
  className?: string;
  withBackground?: boolean;
}

export const QuorLogo: React.FC<QuorLogoProps> = ({
  size = 36,
  className = "",
  withBackground = false
}) => {
  const svgContent = (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full select-none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Sky Blue to Deep Purple/Indigo Gradient from the user's logo */}
        <linearGradient id="quor-glowing-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00d2ff" /> {/* Electric Cyan / Sky Blue */}
          <stop offset="50%" stopColor="#3b82f6" /> {/* Royal Blue */}
          <stop offset="100%" stopColor="#9d1cff" /> {/* Rich Purple / Magenta */}
        </linearGradient>

        {/* Glowing border gradient for the card */}
        <linearGradient id="quor-border-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00d2ff" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#9d1cff" stopOpacity="0.8" />
        </linearGradient>

        {/* Soft glow filter for premium look */}
        <filter id="quor-neon-glow" x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Futuristic Q Ring */}
      <circle
        cx="48"
        cy="48"
        r="26"
        stroke="url(#quor-glowing-gradient)"
        strokeWidth="11"
        fill="none"
        filter="url(#quor-neon-glow)"
      />

      {/* Perfect Q Tail at 45 degrees, matching the thickness and position in the logo */}
      <path
        d="M 62 62 L 78 78"
        stroke="url(#quor-glowing-gradient)"
        strokeWidth="11"
        strokeLinecap="square"
        filter="url(#quor-neon-glow)"
      />
    </svg>
  );

  if (withBackground) {
    return (
      <div 
        style={{ width: size, height: size }} 
        className={`bg-[#060814] relative rounded-2xl flex items-center justify-center p-2 shadow-2xl transition-all duration-300 group hover:scale-105 ${className}`}
      >
        {/* Glow border using absolute overlay */}
        <div 
          className="absolute inset-0 rounded-2xl border" 
          style={{
            borderImageSource: "linear-gradient(135deg, #00d2ff 0%, #3b82f6 50%, #9d1cff 100%)",
            borderImageSlice: 1,
            opacity: 0.65
          }}
        />
        <div className="relative w-full h-full flex items-center justify-center">
          {svgContent}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: size, height: size }} className={`flex items-center justify-center ${className}`}>
      {svgContent}
    </div>
  );
};
