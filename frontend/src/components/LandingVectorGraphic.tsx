import React, { useState } from 'react';
import { formatSigned } from '@/utils/format';

/**
 * Interactive conceptual diagram illustrating how vector steering shifts an
 * original 384D embedding (v₀) along a learned concept direction (c) controlled by λ.
 */
export const LandingVectorGraphic: React.FC = () => {
  const [lambda, setLambda] = useState<number>(0.65);

  // Pure geometric schematic coordinates inside SVG viewBox (0..420 x 0..280)
  const originX = 165;
  const originY = 172;
  const dirX = 115;
  const dirY = -88;

  const steeredX = originX + lambda * dirX;
  const steeredY = originY + lambda * dirY;
  const isNeutral = Math.abs(lambda) < 0.01;

  return (
    <div className="rounded-2xl border border-border bg-background-surface shadow-editorial-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border-subtle bg-background-secondary/50">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-teal" />
          <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-text-secondary font-medium">
            Conceptual Vector Geometry
          </span>
        </div>
        <span className="text-[11px] font-mono text-brand-navy bg-background-surface border border-border px-2.5 py-0.5 rounded-full">
          v&apos; = normalize(v₀ + {formatSigned(lambda, 2)} · c)
        </span>
      </div>

      <div className="p-5 pb-3">
        <svg
          viewBox="0 0 420 260"
          role="img"
          aria-label="Diagram illustrating original sentence vector moving along a semantic concept axis as lambda changes"
          className="w-full h-auto rounded-xl border border-border-subtle bg-background"
        >
          {/* Subtle coordinate grid */}
          <defs>
            <pattern id="vectiq-grid" width="28" height="28" patternUnits="userSpaceOnUse">
              <path
                d="M 28 0 L 0 0 0 28"
                fill="none"
                stroke="#EAE7DF"
                strokeWidth="0.8"
              />
            </pattern>
            <marker
              id="vectiq-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#B45309" />
            </marker>
          </defs>
          <rect width="420" height="260" fill="url(#vectiq-grid)" />

          {/* Semantic neighborhood rings */}
          <circle
            cx={originX}
            cy={originY}
            r="74"
            fill="rgba(62, 92, 138, 0.05)"
            stroke="#CBD5E1"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <circle
            cx="326"
            cy="64"
            r="48"
            fill="rgba(15, 118, 110, 0.05)"
            stroke="#99F6E4"
            strokeDasharray="3 3"
            strokeWidth="1"
          />

          {/* Reference corpus cluster dots */}
          <circle cx="94" cy="196" r="4" fill="#94A3B8" opacity="0.65" />
          <circle cx="118" cy="214" r="4.5" fill="#94A3B8" opacity="0.7" />
          <circle cx="132" cy="148" r="4" fill="#3E5C8A" opacity="0.5" />
          <circle cx="204" cy="195" r="4" fill="#3E5C8A" opacity="0.45" />
          <circle cx="316" cy="52" r="4.5" fill="#0F766E" opacity="0.55" />
          <circle cx="344" cy="78" r="4" fill="#0F766E" opacity="0.6" />
          <circle cx="298" cy="84" r="4" fill="#0F766E" opacity="0.45" />
          <circle cx="52" cy="236" r="4" fill="#64748B" opacity="0.55" />

          {/* Concept axis full dashed line */}
          <line
            x1={originX - dirX}
            y1={originY - dirY}
            x2={originX + dirX * 1.15}
            y2={originY + dirY * 1.15}
            stroke="#CBD5E1"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Axis pole annotations */}
          <text
            x="40"
            y="246"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
            fill="#64748B"
          >
            -1.0 Opposing Pole
          </text>
          <text
            x="275"
            y="36"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
            fill="#0F766E"
          >
            +1.0 Target Concept
          </text>

          {/* Movement vector line */}
          {!isNeutral && (
            <line
              x1={originX}
              y1={originY}
              x2={steeredX}
              y2={steeredY}
              stroke="#B45309"
              strokeWidth="2.2"
              strokeDasharray="5 3"
              markerEnd="url(#vectiq-arrow)"
            />
          )}

          {/* Original embedding anchor */}
          <circle
            cx={originX}
            cy={originY}
            r="8"
            fill="#1B2E4B"
            stroke="#FFFFFF"
            strokeWidth="2.5"
          />
          <text
            x={originX - 24}
            y={originY + 23}
            fontSize="11"
            fontWeight="600"
            fontFamily="Inter, sans-serif"
            fill="#1B2E4B"
          >
            Original (v₀)
          </text>

          {/* Steered embedding marker */}
          {!isNeutral && (
            <g transform={`translate(${steeredX}, ${steeredY})`}>
              <polygon
                points="0,-9 9,0 0,9 -9,0"
                fill="#0F766E"
                stroke="#FFFFFF"
                strokeWidth="2.2"
              />
              <text
                x="13"
                y="4"
                fontSize="11"
                fontWeight="600"
                fontFamily="Inter, sans-serif"
                fill="#0F766E"
              >
                Steered (λ={formatSigned(lambda, 2)})
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Interactive preview slider */}
      <div className="px-5 py-4 bg-background-secondary/40 border-t border-border-subtle space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="landing-schematic-slider"
            className="text-xs font-medium text-text-primary"
          >
            Preview Steering Shift (λ)
          </label>
          <div className="flex items-center gap-1.5">
            {[-0.8, 0, 0.8].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setLambda(preset)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-mono border transition-colors ${
                  Math.abs(lambda - preset) < 0.03
                    ? 'bg-brand-navy text-white border-brand-navy'
                    : 'bg-background-surface text-text-secondary border-border hover:border-brand-slate/60'
                }`}
              >
                {preset > 0 ? `+${preset}` : preset === 0 ? '0.0' : preset}
              </button>
            ))}
          </div>
        </div>
        <input
          id="landing-schematic-slider"
          type="range"
          min={-1}
          max={1}
          step={0.05}
          value={lambda}
          onChange={(e) => setLambda(parseFloat(e.target.value))}
          className="studio-range"
        />
        <p className="text-[11px] text-text-muted leading-relaxed">
          Interactive schematic only. Open <span className="font-medium text-brand-navy">Vector Steering</span> to run real 384D model inference on the FastAPI backend.
        </p>
      </div>
    </div>
  );
};
