import React, { useEffect, useState } from 'react';
import '../styles/login-light-background.css';

interface ParticleType {
  id: number;
  x: number;
  y: number;
  size: 'small' | 'medium' | 'large';
  tx: number;
  ty: number;
  delay: number;
}

/**
 * LoginLightBackground Component
 *
 * Creates a light-themed animated background for the login page featuring:
 * - Soft gradient mesh animations
 * - Floating logo watermarks
 * - Subtle particles
 * - Neural network lines
 * - Glassmorphism effects
 */
const LoginLightBackground: React.FC = () => {
  const [particles, setParticles] = useState<ParticleType[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Generate random particles
    const newParticles: ParticleType[] = [];
    const particleCount = 25; // Subtle count for light theme

    for (let i = 0; i < particleCount; i++) {
      const sizes = ['small', 'medium', 'large'] as const;
      const sizeIndex = Math.floor(Math.random() * 3);

      newParticles.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: sizes[sizeIndex],
        tx: (Math.random() - 0.5) * 150,
        ty: (Math.random() - 0.5) * 150,
        delay: Math.random() * 2,
      });
    }

    setParticles(newParticles);
    setMounted(true);
  }, []);

  return (
    <>
      <div className="light-login-background">
        {/* Gradient Mesh */}
        <div className="gradient-mesh-light"></div>

        {/* Soft Wave Gradients */}
        <div className="wave-light-1"></div>
        <div className="wave-light-2"></div>
        <div className="wave-light-3"></div>

        {/* Neural Network Lines */}
        <div className="neural-network-light">
          <div className="neural-line-light"></div>
          <div className="neural-line-light"></div>
          <div className="neural-line-light"></div>
          <div className="neural-line-light"></div>
        </div>

        {/* Floating Particles */}
        <div className="particle-container-light">
          {mounted &&
            particles.map((particle) => (
              <div
                key={particle.id}
                className={`particle-light particle-${particle.size}-light`}
                style={{
                  left: `${particle.x}%`,
                  top: `${particle.y}%`,
                  '--tx': `${particle.tx}px`,
                  '--ty': `${particle.ty}px`,
                  animationDelay: `${particle.delay}s`,
                } as React.CSSProperties & { '--tx': string; '--ty': string }}
              ></div>
            ))}
        </div>

        {/* Logo Watermarks */}
        <div className="logo-watermarks-light">
          <div className="logo-watermark-light">
            <img src="/logo-icon.svg" alt="SciSynthesis" loading="lazy" />
          </div>
          <div className="logo-watermark-light">
            <img src="/logo-icon.svg" alt="SciSynthesis" loading="lazy" />
          </div>
          <div className="logo-watermark-light">
            <img src="/logo-icon.svg" alt="SciSynthesis" loading="lazy" />
          </div>
        </div>

        {/* Shimmer Sweep */}
        <div className="shimmer-light"></div>

        {/* Card Glow Layer */}
        <div className="light-card-glow"></div>
      </div>

      {/* Main Logo Glow (Behind Card) */}
      <div className="logo-glow-light">
        <img src="/logo-icon.svg" alt="SciSynthesis Watermark" loading="lazy" />
      </div>
    </>
  );
};

export default LoginLightBackground;
