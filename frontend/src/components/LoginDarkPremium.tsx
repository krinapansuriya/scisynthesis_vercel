import React, { useEffect, useState } from 'react';
import '../styles/login-dark-premium.css';

/**
 * LoginDarkPremium Component
 *
 * Premium dark-themed login background featuring:
 * - Rotating animated SciSynthesis logo orbs
 * - Black & grey gradient background
 * - Hexagonal geometric patterns
 * - Electric glow effects
 * - Tech-inspired aesthetic
 */
const LoginDarkPremium: React.FC = () => {
  const [particles, setParticles] = useState<Array<{ id: number; tx: number; ty: number }>>([]);

  useEffect(() => {
    // Generate particles with random movement vectors
    const newParticles = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      tx: (Math.random() - 0.5) * 200,
      ty: (Math.random() - 0.5) * 200,
    }));

    setParticles(newParticles);
  }, []);

  return (
    <>
      {/* Main background container */}
      <div className="dark-premium-background">
        {/* Hexagonal grid pattern */}
        <div className="hexagon-grid"></div>

        {/* Logo orbs (rotating) */}
        <div className="logo-orb-container">
          {/* Large orb - top left */}
          <div className="logo-orb-lg">
            <img src="/logo-icon.svg" alt="SciSynthesis" loading="lazy" />
          </div>

          {/* Medium orb - bottom right */}
          <div className="logo-orb-md">
            <img src="/logo-icon.svg" alt="SciSynthesis" loading="lazy" />
          </div>

          {/* Small orb - right center */}
          <div className="logo-orb-sm">
            <img src="/logo-icon.svg" alt="SciSynthesis" loading="lazy" />
          </div>
        </div>

        {/* Geometric lines */}
        <div className="geometric-lines">
          <div className="geo-line"></div>
          <div className="geo-line"></div>
          <div className="geo-line"></div>
          <div className="geo-line"></div>
          <div className="geo-line"></div>
        </div>

        {/* Glowing particles */}
        <div>
          {particles.map((p) => (
            <div
              key={p.id}
              className="particle-tech"
              style={{
                '--tx': `${p.tx}px`,
                '--ty': `${p.ty}px`,
              } as React.CSSProperties & { '--tx': string; '--ty': string }}
            ></div>
          ))}
        </div>

        {/* Central glow vortex */}
        <div className="glow-vortex"></div>

        {/* Corner accent glows */}
        <div className="corner-glow-tl"></div>
        <div className="corner-glow-br"></div>

        {/* Data streams */}
        <div className="data-stream"></div>
        <div className="data-stream"></div>
        <div className="data-stream"></div>
      </div>

      {/* Card border glow effect */}
      <div className="card-border-glow"></div>
    </>
  );
};

export default LoginDarkPremium;
