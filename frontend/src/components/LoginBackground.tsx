import React, { useEffect, useState } from 'react';
import '../styles/login-background.css';

interface ParticleType {
  id: number;
  x: number;
  y: number;
  size: 'small' | 'medium' | 'large';
  tx: number;
  ty: number;
  delay: number;
}

const LoginBackground: React.FC = () => {
  const [particles, setParticles] = useState<ParticleType[]>([]);

  useEffect(() => {
    // Generate random particles
    const newParticles: ParticleType[] = [];
    const particleCount = 40;

    for (let i = 0; i < particleCount; i++) {
      const sizes = ['small', 'medium', 'large'] as const;
      const sizeIndex = Math.floor(Math.random() * 3);

      newParticles.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: sizes[sizeIndex],
        tx: (Math.random() - 0.5) * 200,
        ty: (Math.random() - 0.5) * 200,
        delay: Math.random() * 3,
      });
    }

    setParticles(newParticles);
  }, []);

  return (
    <>
      <div className="login-background-container">
        {/* Main gradient mesh */}
        <div className="gradient-mesh"></div>

        {/* Animated wave gradients */}
        <div className="wave-gradient-1"></div>
        <div className="wave-gradient-2"></div>
        <div className="wave-gradient-3"></div>

        {/* Neural network lines */}
        <div className="neural-network">
          <div className="neural-line"></div>
          <div className="neural-line"></div>
          <div className="neural-line"></div>
          <div className="neural-line"></div>
          <div className="neural-line"></div>
        </div>

        {/* Floating particles */}
        <div className="particle-container">
          {particles.map((particle) => (
            <div
              key={particle.id}
              className={`particle particle-${particle.size}`}
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

        {/* Glow effect behind card */}
        <div className="card-glow"></div>
      </div>
    </>
  );
};

export default LoginBackground;
