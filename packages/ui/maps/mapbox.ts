// Mapbox, shared by the map components. The public token (starts with "pk.")
// comes from NEXT_PUBLIC_MAPBOX_TOKEN; without it the components fall back to
// what works with no map: the device's own location and a Google Maps link.

export interface MapPoint {
  lat: number;
  lng: number;
}

/** Where directions lead: a pin, or a place by name (found on the map when it's opened). */
export type Destination = MapPoint | { query: string };

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/** Kampala: where a map opens before it knows better. */
export const DEFAULT_CENTER: MapPoint = { lat: 0.3136, lng: 32.5811 };

/** The map library and its stylesheet, loaded only when a map is shown. */
export async function loadMapbox() {
  const [{ default: mapboxgl }] = await Promise.all([import("mapbox-gl"), import("mapbox-gl/dist/mapbox-gl.css")]);
  mapboxgl.accessToken = MAPBOX_TOKEN;
  return mapboxgl;
}

/** Google Maps directions to the same place: works everywhere, with or without our map. */
export function googleDirectionsUrl(to: Destination): string {
  const destination = "query" in to ? to.query : `${to.lat},${to.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** Places matching what was typed, nearest `near` first. */
export async function searchPlaces(text: string, near: MapPoint, signal?: AbortSignal): Promise<{ name: string; place: string; point: MapPoint }[]> {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", text);
  url.searchParams.set("proximity", `${near.lng},${near.lat}`);
  url.searchParams.set("limit", "5");
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const body = (await res.json()) as { features?: { properties: { name: string; place_formatted?: string }; geometry: { coordinates: [number, number] } }[] };
  return (body.features ?? []).map((f) => ({
    name: f.properties.name,
    place: f.properties.place_formatted ?? "",
    point: { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] },
  }));
}

export interface Route {
  /** [lng, lat] points along the way. */
  line: [number, number][];
  meters: number;
  seconds: number;
  /** The turns, in order. */
  steps: { instruction: string; meters: number }[];
}

/** The driving route with live traffic, or null when there's none. */
export async function fetchRoute(from: MapPoint, to: MapPoint, signal?: AbortSignal): Promise<Route | null> {
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from.lng},${from.lat};${to.lng},${to.lat}`);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "true");
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs: { steps: { distance: number; maneuver: { instruction: string } }[] }[] }[];
  };
  const route = body.routes?.[0];
  if (!route) return null;
  return {
    line: route.geometry.coordinates,
    meters: route.distance,
    seconds: route.duration,
    steps: route.legs.flatMap((l) => l.steps.map((s) => ({ instruction: s.maneuver.instruction, meters: s.distance }))),
  };
}

/** Metres between two points (straight line). */
export function metersBetween(a: MapPoint, b: MapPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export const formatDistance = (meters: number) => (meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} km` : `${Math.round(meters / 10) * 10} m`);

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}
