"use client";

import { useEffect, useState } from "react";

interface SplashScreenProps {
  /** Called once the entrance + hold + exit sequence finishes */
  onFinish?: () => void;
  /** Total time the splash stays mounted, in ms */
  duration?: number;
  /** Background color behind the mark */
  background?: string;
}

/**
 * Full-screen splash with a stroke-draw animation of the brand mark.
 * The path draws in, holds, then draws back out on a loop while mounted;
 * the whole screen fades out once `duration` elapses.
 */
export function SplashScreen({
  onFinish,
  duration = 2600,
  background = "#f6f7fa",
}: SplashScreenProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => setExiting(true), duration - 400);
    const doneTimer = setTimeout(() => onFinish?.(), duration);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [duration, onFinish]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background,
        opacity: exiting ? 0 : 1,
        transition: "opacity 380ms ease",
        zIndex: 9999,
      }}
    >
      <svg
        viewBox="0 0 344.6 295.68"
        width="140"
        height="120"
        style={{ overflow: "visible" }}
      >
        <path
          d="M423.09,393.22H376.85a1.93,1.93,0,0,1-1.73-1.08l-26.69-54.4a1.93,1.93,0,0,0-1.74-1.08H181.82a1.93,1.93,0,0,0-1.74,1.1l-26.16,54.37a1.94,1.94,0,0,1-1.75,1.09H105.36a1.94,1.94,0,0,1-1.75-2.77l25.91-53.79,18.53-38.45a1.93,1.93,0,0,1,1.74-1.1H332.86l-.34-.68-11.38-22.82-54.89-110a1.93,1.93,0,0,0-3.46,0L224.1,241.13a1.91,1.91,0,0,1-1.73,1.07H178.1a1.93,1.93,0,0,1-1.74-2.77l56.73-117.79a1.93,1.93,0,0,1,1.74-1.1h59.38a2,2,0,0,1,1.75,1.1l72.86,152,10.94,22.82.32.68,19,39.55,25.79,53.79A1.93,1.93,0,0,1,423.09,393.22Z"
          transform="translate(-91.92 -109.04)"
          style={{
            fill: "none",
            stroke: "#424962",
            strokeWidth: 23,
            strokeLinecap: "round",
            strokeDasharray: 1400,
            strokeDashoffset: 1400,
            animation: "splash-draw 2.2s ease-in-out infinite",
          }}
        />
        <line
          x1="131.65"
          y1="133.16"
          x2="83.1"
          y2="133.16"
          style={{
            fill: "none",
            stroke: "#424962",
            strokeWidth: 23,
            strokeDasharray: 60,
            strokeDashoffset: 60,
            animation: "splash-draw-line 2.2s ease-in-out infinite",
          }}
        />
      </svg>

      <style>{`
        @keyframes splash-draw {
          0% { stroke-dashoffset: 1400; }
          55% { stroke-dashoffset: 0; }
          85% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -1400; }
        }
        @keyframes splash-draw-line {
          0%, 45% { stroke-dashoffset: 60; }
          70%, 85% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -60; }
        }
        @media (prefers-reduced-motion: reduce) {
          svg path, svg line {
            animation: none !important;
            stroke-dashoffset: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
