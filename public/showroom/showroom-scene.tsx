"use client";

import { Suspense, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

const DURATION = 0.7;

const MAIN = { scale: [4, 5] as [number, number], position: [0, 0, 0] as [number, number, number] };
const PEEK = { scale: [0.9, 1.15] as [number, number], position: [1.7, -1.15, -2.6] as [number, number, number] };
const EXIT = { scale: [3.6, 4.4] as [number, number], position: [-1.3, 0.5, 2.8] as [number, number, number] };

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [THREE.MathUtils.lerp(a[0], b[0], t), THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(a[2], b[2], t)];
}

function Photo({
  progressRef,
  role,
}: {
  progressRef: React.RefObject<number>;
  role: "current" | "next";
}) {
  const texture = useTexture("/showroom/placeholder.PNG");
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;
    const p = progressRef.current;

    if (role === "current") {
      const [x, y, z] = lerp3(MAIN.position, EXIT.position, p);
      mesh.position.set(x, y, z);
      mesh.scale.set(
        THREE.MathUtils.lerp(MAIN.scale[0], EXIT.scale[0], p),
        THREE.MathUtils.lerp(MAIN.scale[1], EXIT.scale[1], p),
        1,
      );
      material.opacity = 1 - p;
    } else {
      const [x, y, z] = lerp3(PEEK.position, MAIN.position, p);
      mesh.position.set(x, y, z);
      mesh.scale.set(
        THREE.MathUtils.lerp(PEEK.scale[0], MAIN.scale[0], p),
        THREE.MathUtils.lerp(PEEK.scale[1], MAIN.scale[1], p),
        1,
      );
      material.opacity = THREE.MathUtils.lerp(0.55, 1, p);
    }
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={materialRef} map={texture} transparent />
    </mesh>
  );
}

function SceneInner({
  progressRef,
  animatingRef,
  directionRef,
  onAdvance,
}: {
  progressRef: React.RefObject<number>;
  animatingRef: React.RefObject<boolean>;
  directionRef: React.RefObject<1 | -1>;
  onAdvance: (direction: 1 | -1) => void;
}) {
  useFrame((_, delta) => {
    if (!animatingRef.current) return;
    progressRef.current = Math.min(1, progressRef.current + delta / DURATION);
    if (progressRef.current >= 1) {
      animatingRef.current = false;
      progressRef.current = 0;
      onAdvance(directionRef.current);
    }
  });

  return (
    <>
      <Photo role="current" progressRef={progressRef} />
      <Photo role="next" progressRef={progressRef} />
    </>
  );
}

export interface ShowroomSceneHandle {
  advance: (direction?: 1 | -1) => void;
}

export const ShowroomScene = forwardRef<ShowroomSceneHandle, { onAdvance: (direction: 1 | -1) => void }>(
  function ShowroomScene({ onAdvance }, ref) {
    const progressRef = useRef(0);
    const animatingRef = useRef(false);
    const directionRef = useRef<1 | -1>(1);
    const containerRef = useRef<HTMLDivElement>(null);

    function trigger(direction: 1 | -1) {
      if (animatingRef.current) return;
      directionRef.current = direction;
      animatingRef.current = true;
    }

    useImperativeHandle(ref, () => ({ advance: (direction = 1) => trigger(direction) }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      function onWheel(e: WheelEvent) {
        if (Math.abs(e.deltaY) < 4) return;
        e.preventDefault();
        trigger(e.deltaY > 0 ? 1 : -1);
      }
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, []);

    return (
      <div ref={containerRef} className="absolute inset-0">
        <Canvas camera={{ position: [0, 0, 5.5], fov: 45 }}>
          <Suspense fallback={null}>
            <SceneInner
              progressRef={progressRef}
              animatingRef={animatingRef}
              directionRef={directionRef}
              onAdvance={onAdvance}
            />
          </Suspense>
        </Canvas>
      </div>
    );
  },
);