"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { ChatIcon } from "./chat/icons";
import { AccountsIcon, ClientsIcon, DashboardIcon, OrdersIcon, PaymentIcon, ProductsIcon } from "./icons";

// Lays real content over the laptop/phone bezel art in public/devices/ so a
// component can be eyeballed at a device size, not just a narrow browser
// window. Screen rects (and, for the phone, its corner radius) were
// measured off each SVG's own white screen shape, as a % of its viewBox,
// so they track the art exactly:
//   laptop.svg: viewBox 0 0 520 301, screen rect x=61 y=20 w=398 h=248, square corners
//   mobile.svg: viewBox 0 0 213.04 429.61, screen path bbox ≈ x=12 y=10.13 w=189 h=409.35, corner radius 24.06
// The radius is reapplied in real px (screenWidthPx * radiusUnits/widthUnits)
// so it stays circular — and matches the art — at whatever size the frame
// renders at, not just at the SVG's own pixel dimensions.
//
// Children are laid out at `viewportWidth` real CSS px — the width a real
// laptop/phone browser window would give them — then uniformly scaled down
// to whatever size the screen rect renders at, via a measured
// scale = screenPixelWidth / viewportWidth. That's what makes this "exactly
// how it would show": the component never sees a fake narrow container, it
// gets the real width and we shrink the result, like a thumbnail of an
// actual browser tab.
//
// The screen clips with `overflow: hidden`, not `auto`: browsers size the
// scrollable overflow of a transformed child off its *pre-scale* box, so a
// native scrollbar here would be sized for the unscaled content and show up
// even when the shrunk result visually fits — i.e. a scrollbar to nowhere.
// The scaled page is exactly one screen tall (the device's 100vh), so the
// nav chrome spans top to bottom; content taller than that is cropped, like
// a screenshot.
//
// `chrome` (on by default) frames `children` with inert nav chrome matching
// the real dashboard — a left sidebar for laptop, a bottom bar for mobile —
// so the preview reads as a page inside the app, not a component floating
// on white. It's a visual stand-in, not the real DashboardSidebar/HomeBar:
// those use next/link and a real logout action, which would actually
// navigate away from — or sign out of — the Design Room if clicked inside
// a "pretend" preview. The icons are the real ones; the nav itself is not.
//
// This is a Design Room tool for previewing components at a size, not a
// component the app itself renders — it doesn't belong in a real page.

const FRAMES = {
  laptop: {
    src: "/devices/laptop.svg",
    aspect: 520 / 301,
    screen: { left: (61 / 520) * 100, top: (20 / 301) * 100, width: (398 / 520) * 100, height: (248 / 301) * 100 },
    screenWidthUnits: 398,
    cornerRadiusUnits: 0,
  },
  mobile: {
    src: "/devices/mobile.svg",
    aspect: 213.04 / 429.61,
    screen: { left: (12 / 213.04) * 100, top: (10.13 / 429.61) * 100, width: (189 / 213.04) * 100, height: (409.35 / 429.61) * 100 },
    screenWidthUnits: 189,
    cornerRadiusUnits: 24.06,
  },
} as const;

export type Device = keyof typeof FRAMES;

/** Real-world browser width (css px) each device defaults to when `viewportWidth` is omitted. */
const DEFAULT_VIEWPORT_WIDTH: Record<Device, number> = {
  laptop: 1440,
  mobile: 375,
};

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", Icon: DashboardIcon },
  { key: "orders", label: "Orders", Icon: OrdersIcon },
  { key: "clients", label: "Clients", Icon: ClientsIcon },
  { key: "products", label: "Products", Icon: ProductsIcon },
  { key: "payments", label: "Payments", Icon: PaymentIcon },
  { key: "accounts", label: "Accounts", Icon: AccountsIcon },
  { key: "chat", label: "Chat", Icon: ChatIcon },
];

function SidebarChrome({ active = "dashboard" }: { active?: string }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-16 shrink-0 items-center border-b border-border px-5 text-sm font-semibold">AMING</div>
      <nav className="space-y-1 px-3 py-4">
        {NAV_ITEMS.map(({ key, label, Icon }) => (
          <div key={key} className={`menu-item ${key === active ? "menu-item-active" : "menu-item-inactive"}`}>
            <Icon className={`h-5 w-5 ${key === active ? "menu-item-icon-active" : "menu-item-icon-inactive"}`} />
            {label}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function HomeBarChrome({ active = "dashboard" }: { active?: string }) {
  const tabs = NAV_ITEMS.slice(0, 4);
  return (
    <div className="flex h-16 shrink-0 items-center justify-around border-t border-border bg-surface">
      {tabs.map(({ key, label, Icon }) => (
        <div key={key} className="flex flex-1 flex-col items-center justify-center gap-0.5">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full ${key === active ? "bg-brand-500 text-white" : "text-muted"}`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className={`text-[0.6rem] ${key === active ? "font-medium text-brand-600 dark:text-brand-400" : "text-muted"}`}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DeviceFrame({
  device,
  viewportWidth,
  chrome = true,
  children,
  className,
}: {
  device: Device;
  /** The real width (css px) `children` are laid out at before being scaled into the screen — e.g. 1440 for a laptop browser, 375 for a phone. Defaults per device. */
  viewportWidth?: number;
  /** Surrounds `children` with inert dashboard nav chrome (sidebar / bottom bar) so it reads as a real page. */
  chrome?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const frame = FRAMES[device];
  const width = viewportWidth ?? DEFAULT_VIEWPORT_WIDTH[device];
  const screenRef = useRef<HTMLDivElement>(null);
  const [screenPx, setScreenPx] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = screenRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScreenPx({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = screenPx !== null ? screenPx.width / width : null;
  // The device's "100vh": the screen's height in the same unscaled css px as
  // `width`, so the page fills the screen top to bottom like a real window.
  const viewportHeight = screenPx !== null && scale !== null ? screenPx.height / scale : null;
  const cornerRadius = screenPx !== null ? (screenPx.width / frame.screenWidthUnits) * frame.cornerRadiusUnits : 0;

  const content = chrome ? (
    device === "laptop" ? (
      <div className="flex h-full">
        <SidebarChrome />
        {/* Matches the real shell's <main> padding (apps/factory/app/dashboard/shell.tsx) at its sm:+ value — Tailwind's sm:/lg: prefixes query the real browser, not this fake viewport, so the breakpoint is hardcoded per device instead. */}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden px-6 py-6">{children}</div>
      </div>
    ) : (
      <div className="flex h-full flex-col">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden px-4 py-6">{children}</div>
        <HomeBarChrome />
      </div>
    )
  ) : (
    children
  );

  return (
    <div className={`relative ${className ?? ""}`} style={{ aspectRatio: frame.aspect }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative bezel art, not an optimizable content image */}
      <img src={frame.src} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />
      <div
        ref={screenRef}
        className="absolute overflow-hidden bg-white"
        style={{
          left: `${frame.screen.left}%`,
          top: `${frame.screen.top}%`,
          width: `${frame.screen.width}%`,
          height: `${frame.screen.height}%`,
          borderRadius: `${cornerRadius}px`,
        }}
      >
        {scale !== null ? (
          <div className="bg-background" style={{ width, height: viewportHeight ?? undefined, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            {content}
          </div>
        ) : null}
      </div>
    </div>
  );
}
