"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapboxMap, Marker } from "mapbox-gl";

import { Button } from "@repo/ui/Button";
import { BottomSheet } from "@repo/ui/BottomSheet";

import {
  MAPBOX_TOKEN,
  fetchRoute,
  formatDistance,
  formatDuration,
  googleDirectionsUrl,
  loadMapbox,
  metersBetween,
  type Destination,
  type MapPoint,
  type Route,
} from "./mapbox";

/** A new route is asked for once they've moved this far off the last one's start, or this long has passed (traffic changes). */
const REROUTE_AFTER_METERS = 40;
const REROUTE_AFTER_MS = 60_000;
const ARRIVED_WITHIN_METERS = 40;

const linkClass = "text-sm font-medium text-brand-600 underline";

/**
 * "Directions". To a pin: opens the live map, from wherever this device is.
 * To a place known only by name (a shoot's venue): opens Google Maps, which
 * finds venues our map doesn't.
 */
export function DirectionsButton({
  to,
  name,
  label = "Directions",
  className = "",
}: {
  to: Destination;
  /** What's there, e.g. the studio's name. */
  name: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if ("query" in to) {
    return (
      <a
        href={googleDirectionsUrl(to)}
        target="_blank"
        rel="noreferrer noopener"
        className={`inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border border-gray-300 bg-white px-4 text-sm text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 ${className}`}
      >
        {label}
      </a>
    );
  }
  return (
    <>
      <Button type="button" variant="secondary" className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={`Directions to ${name}`}>
        {open ? <LiveDirections to={to} /> : null}
      </BottomSheet>
    </>
  );
}

/**
 * The way there, live: the route from where this device is now, redrawn as
 * it moves, with the time and distance left and the next turns. Without a
 * map (no Mapbox token, or location not shared) it offers Google Maps.
 */
function LiveDirections({ to: target }: { to: MapPoint }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const me = useRef<Marker | null>(null);
  const [here, setHere] = useState<MapPoint | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [found, setProblem] = useState<string | null>(null);
  const routed = useRef<{ from: MapPoint; at: number } | null>(null);
  const fitted = useRef(false);

  // Where this device is, as it moves.
  useEffect(() => {
    if (!MAPBOX_TOKEN || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setProblem("Allow location for this site to see the way from where you are."),
      { enableHighAccuracy: true, maximumAge: 5_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  // The map, with the destination's pin.
  useEffect(() => {
    if (!MAPBOX_TOKEN || !box.current) return;
    let gone = false;
    void loadMapbox().then((mapboxgl) => {
      if (gone || !box.current) return;
      const m = new mapboxgl.Map({ container: box.current, style: "mapbox://styles/mapbox/streets-v12", center: [target.lng, target.lat], zoom: 14 });
      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      new mapboxgl.Marker({ color: "#f67413" }).setLngLat([target.lng, target.lat]).addTo(m);
      const dot = document.createElement("div");
      dot.className = "size-4 rounded-full border-2 border-white bg-blue-600 shadow";
      me.current = new mapboxgl.Marker({ element: dot });
      m.on("load", () => {
        m.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } });
        m.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#2563eb", "line-width": 5, "line-opacity": 0.85 } });
        if (!gone) map.current = m;
      });
    });
    return () => {
      gone = true;
      map.current?.remove();
      map.current = null;
      me.current = null;
      fitted.current = false;
    };
  }, [target]);

  // The route: asked for at the first fix, then when they've moved on or time has passed.
  useEffect(() => {
    if (!here) return;
    const last = routed.current;
    if (last && metersBetween(last.from, here) < REROUTE_AFTER_METERS && Date.now() - last.at < REROUTE_AFTER_MS) return;
    routed.current = { from: here, at: Date.now() };
    const stop = new AbortController();
    fetchRoute(here, target, stop.signal)
      .then((found) => {
        if (found) setRoute(found);
        else setProblem("We couldn't find a way there by road.");
      })
      .catch(() => {});
    return () => stop.abort();
  }, [here, target]);

  // Drawn: this device's dot, the line, and (the first time) both ends in view.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (here && me.current) me.current.setLngLat([here.lng, here.lat]).addTo(m);
    if (!route) return;
    (m.getSource("route") as GeoJSONSource | undefined)?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.line } });
    if (!fitted.current && route.line.length > 1) {
      fitted.current = true;
      const lngs = route.line.map((p) => p[0]);
      const lats = route.line.map((p) => p[1]);
      m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 48, duration: 600 });
    }
  }, [here, route]);

  const google = (
    <a href={googleDirectionsUrl(target)} target="_blank" rel="noreferrer noopener" className={linkClass}>
      Open in Google Maps
    </a>
  );

  // No map to show: Google Maps does the job.
  if (!MAPBOX_TOKEN) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted">Get turn-by-turn directions from where you are.</p>
        {google}
      </div>
    );
  }

  // Opened by a tap, so this only ever renders in the browser.
  const problem = found ?? (navigator.geolocation ? null : "This device can't share its location.");
  const arrived = !!here && metersBetween(here, target) < ARRIVED_WITHIN_METERS;
  return (
    <div className="space-y-3">
      <div ref={box} className="h-72 w-full overflow-hidden rounded-xl border border-border" />
      {arrived ? (
        <p className="text-sm font-medium text-success-600 dark:text-success-500">You&apos;ve arrived.</p>
      ) : route ? (
        <>
          <p className="text-lg font-semibold">
            {formatDuration(route.seconds)} <span className="text-sm font-normal text-muted">· {formatDistance(route.meters)}</span>
          </p>
          <ol className="divide-y divide-border rounded-xl border border-border text-sm">
            {route.steps.slice(0, 4).map((s, i) => (
              <li key={i} className={`flex justify-between gap-3 px-3 py-2 ${i === 0 ? "font-medium" : "text-muted"}`}>
                <span>{s.instruction}</span>
                <span className="shrink-0 tnum">{formatDistance(s.meters)}</span>
              </li>
            ))}
          </ol>
        </>
      ) : problem ? null : (
        <p className="text-sm text-muted">{here ? "Finding the way…" : "Finding where you are…"}</p>
      )}
      {problem ? <p className="text-sm text-error-600 dark:text-error-400">{problem}</p> : null}
      {google}
    </div>
  );
}
