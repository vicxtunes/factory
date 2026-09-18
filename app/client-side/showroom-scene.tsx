"use client";

import { Suspense, forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

// How much of one wheel "notch" (~100px of deltaY in most browsers) moves
// the reel — small on purpose so a normal scroll gesture glides through a
// fraction of a card instead of snapping a whole card at a time.
const WHEEL_SENSITIVITY = 0.0022;
// Touch drags cover far less distance than a wheel gesture does (a full
// swipe is maybe 150-250px), so this is tuned higher than wheel sensitivity
// — a comfortable swipe should get most of the way through a card.
const TOUCH_SENSITIVITY = 0.0035;
// Exponential-decay rate the displayed scroll position chases the target
// at (THREE.MathUtils.damp). This — not a fixed-duration tween — is what
// makes the motion track continuous scroll input instead of playing a
// fixed slideshow transition every time a wheel event fires.
const DAMPING = 4.5;

// World-space layout for the two photo planes, with a lot of room between
// them so the depth reads as real space, not a cramped swap: MAIN is the
// current product, front and center; PEEK is the next one, small and far
// back in the corner ("taking over the floor" starts from there); EXIT is
// where the outgoing current photo flies off to — bigger and past the
// camera, so it reads as walking past it rather than just fading. Because
// the two planes just lerp between fixed poses on `frac`, scrolling
// backwards runs the exact same motion in reverse for free.
//
// NOTE: scale[1] (height) is now treated as the target *height* the plane
// aims for; actual width is derived from the texture's own aspect ratio in
// Photo's useFrame, so nothing is ever stretched. scale[0] is kept only as
// a fallback for the initial frame before the texture's dimensions are
// known.
const MAIN = { scale: [4, 5] as [number, number], position: [0, 0, 0] as [number, number, number], rotY: 0 };
const PEEK = { scale: [0.75, 0.95] as [number, number], position: [2.8, -1.7, -7.5] as [number, number, number], rotY: -0.4 };
const EXIT = { scale: [4.8, 5.8] as [number, number], position: [-2.5, 1, 7.5] as [number, number, number], rotY: 0.35 };

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [THREE.MathUtils.lerp(a[0], b[0], t), THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(a[2], b[2], t)];
}

function Photo({
  fracRef,
  role,
  imageUrl,
}: {
  fracRef: React.RefObject<number>;
  role: "current" | "next";
  imageUrl: string;
}) {
  const texture = useTexture(imageUrl);
  const viewport = useThree((s) => s.viewport);
  const camera = useThree((s) => s.camera);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // The texture's real aspect ratio (width / height). useTexture suspends
  // until the image is loaded, so image dimensions are populated by the
  // time this runs. Some browsers expose naturalWidth/naturalHeight only,
  // so check both. Falls back to 1 (square) if neither is available.
  const texAspect = useMemo(() => {
    const img = texture.image as
      | { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number }
      | undefined;
    const w = img?.width ?? img?.naturalWidth;
    const h = img?.height ?? img?.naturalHeight;
    return w && h ? w / h : 1;
  }, [texture]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;
    const t = fracRef.current;
    const from = role === "current" ? MAIN : PEEK;
    const to = role === "current" ? EXIT : MAIN;

    const [x, y, z] = lerp3(from.position, to.position, t);
    // A little idle bob even at rest (t fixed) — keeps the scene visibly
    // alive between scrolls instead of reading as a static photo, which is
    // also the easiest way to tell at a glance that this really is a live
    // WebGL scene and not a swapped-out static image.
    const bob = role === "current" ? Math.sin(clock.elapsedTime * 1.1) * 0.06 : 0;
    mesh.position.set(x, y + bob, z);

    // --- Aspect-preserving, viewport-fitting scale ---
    //
    // Treat scale[1] as the *height* to aim for at this progress; width
    // follows from the texture's own aspect ratio, so a landscape photo
    // stays landscape and a portrait one stays portrait — never squashed.
    let h = THREE.MathUtils.lerp(from.scale[1], to.scale[1], t);
    let w = h * texAspect;

    // Fit inside the camera's visible area at this plane's depth. Skip
    // when the plane is at or behind the camera (during the EXIT flight) —
    // clamping there would divide by ~0 and produce garbage scale values.
    const camZ = camera.position.z;
    const dist = camZ - z;
    if (dist > 0.5) {
      const depth = dist / camZ;
      const visibleH = viewport.height * depth;
      const visibleW = viewport.width * depth;
      const margin = 0.9; // small breathing room from the edges
      const maxH = visibleH * margin;
      const maxW = visibleW * margin;
      if (w > maxW) {
        w = maxW;
        h = w / texAspect;
      }
      if (h > maxH) {
        h = maxH;
        w = h * texAspect;
      }
    }

    mesh.scale.set(w, h, 1);
    mesh.rotation.y = THREE.MathUtils.lerp(from.rotY, to.rotY, t);
    material.opacity = role === "current" ? 1 - t : THREE.MathUtils.lerp(0.5, 1, t);
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={materialRef} map={texture} transparent />
    </mesh>
  );
}

function SceneInner({
  displayRef,
  targetRef,
  fracRef,
  lastIndexRef,
  onAdvance,
  currentImage,
  nextImage,
}: {
  displayRef: React.RefObject<number>;
  targetRef: React.RefObject<number>;
  fracRef: React.RefObject<number>;
  lastIndexRef: React.RefObject<number>;
  onAdvance: (direction: 1 | -1) => void;
  currentImage: string;
  nextImage: string;
}) {
  useFrame((_, delta) => {
    displayRef.current = THREE.MathUtils.damp(displayRef.current, targetRef.current, DAMPING, delta);
    fracRef.current = displayRef.current - Math.floor(displayRef.current);

    const base = Math.floor(displayRef.current);
    while (base > lastIndexRef.current) {
      lastIndexRef.current += 1;
      onAdvance(1);
    }
    while (base < lastIndexRef.current) {
      lastIndexRef.current -= 1;
      onAdvance(-1);
    }
  });

  return (
    <>
      <Photo role="current" fracRef={fracRef} imageUrl={currentImage} />
      <Photo role="next" fracRef={fracRef} imageUrl={nextImage} />
    </>
  );
}

export interface ShowroomSceneHandle {
  advance: (direction?: 1 | -1) => void;
}

// The scroll-driven zoom itself, continuously scrubbed rather than an
// auto-timed snap: `targetRef` accumulates raw scroll/click input, and a
// damped `displayRef` chases it every frame (THREE.MathUtils.damp), so the
// "next" photo's slide from its back-corner peek to center stage — and the
// outgoing "current" photo's flight past the camera — track the input
// directly instead of playing a fixed slideshow transition on every wheel
// tick. This component only owns the motion; which image is "current" vs
// "next" is the parent's job (originally cycling between different
// products in the shuffled Free Walk deck, now cycling through one
// product's own photos — see product-showcase.tsx), driven by onAdvance
// whenever the scroll position crosses a whole-image boundary.
export const ShowroomScene = forwardRef<
  ShowroomSceneHandle,
  { onAdvance: (direction: 1 | -1) => void; currentImage: string; nextImage: string }
>(function ShowroomScene({ onAdvance, currentImage, nextImage }, ref) {
  const displayRef = useRef(0);
  const targetRef = useRef(0);
  const fracRef = useRef(0);
  const lastIndexRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    advance: (direction = 1) => {
      targetRef.current += direction;
    },
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      targetRef.current += e.deltaY * WHEEL_SENSITIVITY;
    }

    // Single-finger drag: swipe left (finger moving left, x decreasing)
    // advances forward, swipe right goes back — a horizontal drag rather
    // than vertical, so it doesn't fight the browser's own vertical
    // gestures (pull-to-refresh, address-bar hide/show, page scroll),
    // which were eating one direction of a vertical drag before it ever
    // reached this handler. Only the first touch point is tracked, so a
    // second finger (pinch) doesn't fight the first.
    let lastTouchX: number | null = null;
    function onTouchStart(e: TouchEvent) {
      lastTouchX = e.touches[0]?.clientX ?? null;
    }
    function onTouchMove(e: TouchEvent) {
      const x = e.touches[0]?.clientX;
      if (lastTouchX == null || x == null) return;
      e.preventDefault();
      targetRef.current += (lastTouchX - x) * TOUCH_SENSITIVITY;
      lastTouchX = x;
    }
    function onTouchEnd() {
      lastTouchX = null;
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 touch-none">
      <Canvas camera={{ position: [0, 0, 7], fov: 42 }}>
        <Suspense fallback={null}>
          <SceneInner
            displayRef={displayRef}
            targetRef={targetRef}
            fracRef={fracRef}
            lastIndexRef={lastIndexRef}
            onAdvance={onAdvance}
            currentImage={currentImage}
            nextImage={nextImage}
          />
        </Suspense>
      </Canvas>
    </div>
  );
});