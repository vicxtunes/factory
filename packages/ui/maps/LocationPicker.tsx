"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap, Marker } from "mapbox-gl";

import { Button } from "@repo/ui/Button";
import { TextInput } from "@repo/ui/Field";

import { DEFAULT_CENTER, MAPBOX_TOKEN, googleDirectionsUrl, loadMapbox, searchPlaces, type MapPoint } from "./mapbox";

type Place = Awaited<ReturnType<typeof searchPlaces>>[number];

/**
 * Sets a place's pin: search for it, drag the pin on the map, or use where
 * this device is now. With no map (no Mapbox token), "Use my current
 * location" still works and the pin can be checked in Google Maps.
 */
export function LocationPicker({ value, onChange }: { value: MapPoint | null; onChange: (point: MapPoint | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const [text, setText] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Callers pass a fresh onChange each render; the map keeps the latest.
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  });

  // The map, once: a pin that can be dragged, or dropped with a tap.
  useEffect(() => {
    if (!MAPBOX_TOKEN || !box.current) return;
    let gone = false;
    void loadMapbox().then((mapboxgl) => {
      if (gone || !box.current) return;
      const start = value ?? DEFAULT_CENTER;
      const m = new mapboxgl.Map({ container: box.current, style: "mapbox://styles/mapbox/streets-v12", center: [start.lng, start.lat], zoom: value ? 15 : 11 });
      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      const pin = new mapboxgl.Marker({ draggable: true, color: "#f67413" });
      if (value) pin.setLngLat([value.lng, value.lat]).addTo(m);
      pin.on("dragend", () => {
        const at = pin.getLngLat();
        changed.current({ lat: at.lat, lng: at.lng });
      });
      m.on("click", (e) => changed.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
      map.current = m;
      marker.current = pin;
    });
    return () => {
      gone = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // Built once; later values move the pin below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The pin follows the value (a search result, this device's location, a tap).
  useEffect(() => {
    if (!map.current || !marker.current) return;
    if (!value) return void marker.current.remove();
    marker.current.setLngLat([value.lng, value.lat]).addTo(map.current);
    map.current.easeTo({ center: [value.lng, value.lat], zoom: Math.max(map.current.getZoom(), 15) });
  }, [value]);

  // Search as they type (after a pause).
  useEffect(() => {
    if (!MAPBOX_TOKEN || text.trim().length < 3) return;
    const stop = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(text, value ?? DEFAULT_CENTER, stop.signal)
        .then(setPlaces)
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(timer);
      stop.abort();
    };
  }, [text, value]);

  function useMine() {
    if (!navigator.geolocation) return setError("This device can't share its location.");
    setError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setError("We couldn't get this device's location. Allow location for this site and try again.");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className="space-y-2">
      {MAPBOX_TOKEN ? (
        <div className="relative">
          <TextInput
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value.trim().length < 3) setPlaces([]);
            }}
            placeholder="Search for your place"
            aria-label="Search for your place"
          />
          {places.length ? (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-theme-md">
              {places.map((p) => (
                <li key={`${p.point.lat},${p.point.lng}`}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-background"
                    onClick={() => {
                      onChange(p.point);
                      setText(p.name);
                      setPlaces([]);
                    }}
                  >
                    <span className="font-medium">{p.name}</span>
                    {p.place ? <span className="block text-xs text-muted">{p.place}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {MAPBOX_TOKEN ? <div ref={box} className="h-64 w-full overflow-hidden rounded-xl border border-border" /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" className="min-h-9 text-xs" loading={locating} onClick={useMine}>
          Use my current location
        </Button>
        {value ? (
          <>
            <a href={googleDirectionsUrl(value)} target="_blank" rel="noreferrer noopener" className="text-xs font-medium text-brand-600 underline">
              Check it in Google Maps
            </a>
            <button type="button" className="text-xs text-muted underline" onClick={() => onChange(null)}>
              Remove pin
            </button>
          </>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        {value
          ? MAPBOX_TOKEN
            ? "Pin set. Drag it, or tap the map, to move it."
            : `Pin set (${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}).`
          : MAPBOX_TOKEN
            ? "No pin yet: search, tap the map, or use your current location while you're at the studio."
            : "No pin yet: use your current location while you're at the studio."}
      </p>
      {error ? <p className="text-xs text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
