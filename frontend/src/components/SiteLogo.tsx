import React from 'react';
import { Link } from 'react-router-dom';

interface SiteLogoProps {
  size?: 'sm' | 'md' | 'lg';
  linked?: boolean;
  centered?: boolean;
  theme?: 'light' | 'dark';
}

const SiteLogo: React.FC<SiteLogoProps> = ({
  size = 'md',
  linked = true,
  centered = false,
  theme = 'light',
}) => {
  const cfg = {
    sm: { name: 'text-lg',   sub: 'text-[9px]'  },
    md: { name: 'text-xl',   sub: 'text-[10px]' },
    lg: { name: 'text-3xl',  sub: 'text-[11px]' },
  }[size];

  const sciColor      = theme === 'dark' ? 'text-white'    : 'text-slate-800';
  const synthColor    = theme === 'dark' ? 'text-gray-400' : 'text-gray-400';
  const subColor      = theme === 'dark' ? 'text-gray-500' : 'text-gray-400';

  const cfg2 = {
    sm: { imgSize: 32 },
    md: { imgSize: 40 },
    lg: { imgSize: 56 },
  }[size];

  const content = (
    <div className={`flex items-center gap-3 ${centered ? 'flex-col text-center' : ''}`}>
      {/* SVG logo mark */}
      <img
        src="/logo-icon.svg"
        alt="SciSynthesis"
        width={cfg2.imgSize}
        height={cfg2.imgSize}
        className="flex-shrink-0"
      />

      {/* Text */}
      <div className={`flex flex-col ${centered ? 'items-center' : 'items-start'}`}>
        <p className={`${cfg.name} tracking-tight leading-none`}>
          <span className={`font-extrabold ${sciColor}`}>Sci</span>
          <span className={`font-light ${synthColor}`}>Synthesis</span>
        </p>
        <p className={`${cfg.sub} ${subColor} font-semibold uppercase tracking-[0.22em] mt-1`}>
          AI Research Platform
        </p>
      </div>
    </div>
  );

  if (!linked) return content;

  return (
    <Link to="/" className="hover:opacity-75 transition-opacity">
      {content}
    </Link>
  );
};

export default SiteLogo;
