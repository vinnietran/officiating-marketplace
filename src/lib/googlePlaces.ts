import { IS_E2E } from "./firebase";
import {
  e2eGooglePlaces,
  getE2EDistanceBetweenPoints
} from "../test-support/e2e/harness";
import type { GeoPoint } from "../types";

interface AutocompleteSuggestionResult {
  placePrediction?: {
    placeId?: string;
    text?: {
      toString: () => string;
    };
  };
}

interface AutocompleteSuggestionClass {
  fetchAutocompleteSuggestions: (request: {
    input: string;
    language?: string;
    region?: string;
  }) => Promise<{ suggestions: AutocompleteSuggestionResult[] }>;
}

interface PlacesLibraryLike {
  AutocompleteSuggestion?: AutocompleteSuggestionClass;
}

interface MapsGeocoderResultLike {
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
}

interface MapsGeocoderLike {
  geocode: (
    request: { address: string },
    callback: (
      results: MapsGeocoderResultLike[] | null,
      status: string
    ) => void
  ) => void;
}

interface GoogleMapsWindow extends Window {
  google?: {
    maps?: {
      importLibrary?: (libraryName: "places") => Promise<PlacesLibraryLike>;
      Geocoder?: new () => MapsGeocoderLike;
    };
  };
}

interface NominatimSearchResult {
  lat?: string;
  lon?: string;
}

interface CensusGeocodeResponse {
  result?: {
    addressMatches?: Array<{
      coordinates?: {
        x?: number;
        y?: number;
      };
    }>;
  };
}

interface PersistedGeocodePointRecord {
  lat: number;
  lng: number;
}

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

const PLACES_LIBRARY_URL = "https://maps.googleapis.com/maps/api/js";
const PREDICTION_LIMIT = 5;
let placesScriptPromise: Promise<void> | null = null;
let placesLibraryPromise: Promise<PlacesLibraryLike | null> | null = null;
const geocodePointCache = new Map<string, GeoPoint>();
const geocodePointPromiseCache = new Map<string, Promise<GeoPoint | null>>();
const distanceMilesCache = new Map<string, number>();
const distanceMilesPromiseCache = new Map<string, Promise<number | null>>();
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const US_CENSUS_GEOCODE_URL =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const NOMINATIM_MIN_DELAY_MS = 1100;
const GEOPOINT_CACHE_STORAGE_KEY = "officiating-marketplace:geopoint-cache:v1";
const GEOPOINT_CACHE_MAX_ENTRIES = 1000;
let nominatimQueue: Promise<void> = Promise.resolve();
let nominatimLastRequestAt = 0;
let geocodeCacheLoadedFromStorage = false;
let geocodeCachePersistTimerId: number | null = null;

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadGeocodeCacheFromStorage(): void {
  if (geocodeCacheLoadedFromStorage || !canUseLocalStorage()) {
    return;
  }

  geocodeCacheLoadedFromStorage = true;

  try {
    const raw = window.localStorage.getItem(GEOPOINT_CACHE_STORAGE_KEY);
    if (!raw) {
      return;
    }

    const payload = JSON.parse(raw) as Record<string, PersistedGeocodePointRecord>;
    if (!payload || typeof payload !== "object") {
      return;
    }

    Object.entries(payload).forEach(([cacheKey, value]) => {
      if (!value || typeof value !== "object") {
        return;
      }

      const lat = Number(value.lat);
      const lng = Number(value.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }

      geocodePointCache.set(cacheKey, { lat, lng });
    });
  } catch {
    // Best-effort cache hydration.
  }
}

function schedulePersistGeocodeCache(): void {
  if (!canUseLocalStorage()) {
    return;
  }

  if (geocodeCachePersistTimerId !== null) {
    return;
  }

  geocodeCachePersistTimerId = window.setTimeout(() => {
    geocodeCachePersistTimerId = null;
    try {
      const entries = Array.from(geocodePointCache.entries()).slice(
        -GEOPOINT_CACHE_MAX_ENTRIES
      );
      const serialized = entries.reduce<Record<string, PersistedGeocodePointRecord>>(
        (accumulator, [cacheKey, point]) => {
          accumulator[cacheKey] = {
            lat: point.lat,
            lng: point.lng
          };
          return accumulator;
        },
        {}
      );
      window.localStorage.setItem(
        GEOPOINT_CACHE_STORAGE_KEY,
        JSON.stringify(serialized)
      );
    } catch {
      // Best-effort cache persistence.
    }
  }, 200);
}

function rememberGeocodePoint(cacheKey: string, point: GeoPoint): void {
  if (geocodePointCache.has(cacheKey)) {
    geocodePointCache.delete(cacheKey);
  }
  geocodePointCache.set(cacheKey, point);

  while (geocodePointCache.size > GEOPOINT_CACHE_MAX_ENTRIES) {
    const firstKey = geocodePointCache.keys().next().value;
    if (!firstKey) {
      break;
    }
    geocodePointCache.delete(firstKey);
  }

  schedulePersistGeocodeCache();
}

function getMapsApiKey(): string {
  const rawKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return typeof rawKey === "string" ? rawKey.trim() : "";
}

function isPlacesLoaded(): boolean {
  const globalWindow = window as GoogleMapsWindow;
  return Boolean(globalWindow.google?.maps?.importLibrary);
}

function isScriptElementComplete(script: HTMLScriptElement): boolean {
  const readyState = (script as HTMLScriptElement & { readyState?: string }).readyState;
  return readyState === "loaded" || readyState === "complete";
}

function toCacheKey(value: string): string {
  return value.trim().toLowerCase();
}

function toDistanceCacheKey(origin: string, destination: string): string {
  return `${toCacheKey(origin)}__${toCacheKey(destination)}`;
}

function normalizeAddress(address: string): string {
  return address
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/,\s*,+/g, ", ");
}

function buildAddressCandidates(rawAddress: string): string[] {
  const uniqueCandidates = new Set<string>();
  const normalized = normalizeAddress(rawAddress);
  if (!normalized) {
    return [];
  }

  uniqueCandidates.add(normalized);
  uniqueCandidates.add(`${normalized}, USA`);
  uniqueCandidates.add(normalized.replace(/\b(\d{5})-\d{4}\b/g, "$1"));
  const zipMatch = normalized.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch?.[1]) {
    uniqueCandidates.add(zipMatch[1]);
    uniqueCandidates.add(`${zipMatch[1]}, USA`);
  }
  const withoutPostalCode = normalized
    .replace(/\b\d{5}(?:-\d{4})?\b/g, "")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,+/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*$/, "")
    .trim();
  if (withoutPostalCode) {
    uniqueCandidates.add(withoutPostalCode);
    uniqueCandidates.add(`${withoutPostalCode}, USA`);
  }

  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  // If the leading segment is a venue/school name, try the street+city+state segment.
  if (parts.length >= 2 && !/\d/.test(parts[0])) {
    const streetCityState = parts.slice(1).join(", ");
    uniqueCandidates.add(streetCityState);
    uniqueCandidates.add(`${streetCityState}, USA`);
  }

  if (parts.length >= 3) {
    const shortTail = parts.slice(-3).join(", ");
    uniqueCandidates.add(shortTail);
    uniqueCandidates.add(`${shortTail}, USA`);
  }

  if (parts.length >= 2) {
    const localityTail = parts.slice(-2).join(", ");
    uniqueCandidates.add(localityTail);
    uniqueCandidates.add(`${localityTail}, USA`);
  }

  return Array.from(uniqueCandidates).filter(Boolean);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function runNominatimRateLimited<T>(task: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const elapsedMs = Date.now() - nominatimLastRequestAt;
    const waitMs = Math.max(0, NOMINATIM_MIN_DELAY_MS - elapsedMs);
    if (waitMs > 0) {
      await delay(waitMs);
    }
    nominatimLastRequestAt = Date.now();
    return task();
  });

  nominatimQueue = run.then(
    () => undefined,
    () => undefined
  );

  return run;
}

function haversineMiles(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;

  const latDiff = toRadians(endLat - startLat);
  const lngDiff = toRadians(endLng - startLng);
  const startLatRad = toRadians(startLat);
  const endLatRad = toRadians(endLat);

  const a =
    Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.sin(lngDiff / 2) *
      Math.sin(lngDiff / 2) *
      Math.cos(startLatRad) *
      Math.cos(endLatRad);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

export function getDistanceMilesBetweenPoints(origin: GeoPoint, destination: GeoPoint): number {
  if (IS_E2E) {
    return getE2EDistanceBetweenPoints(origin, destination);
  }

  const miles = haversineMiles(origin.lat, origin.lng, destination.lat, destination.lng);
  return Math.round(miles * 10) / 10;
}

export function hasGooglePlacesApiKey(): boolean {
  if (IS_E2E) {
    return e2eGooglePlaces.hasGooglePlacesApiKey();
  }

  return getMapsApiKey().length > 0;
}

export async function ensureGooglePlacesLoaded(): Promise<boolean> {
  if (IS_E2E) {
    return e2eGooglePlaces.ensureGooglePlacesLoaded();
  }

  const apiKey = getMapsApiKey();
  if (!apiKey) {
    return false;
  }

  if (isPlacesLoaded()) {
    return true;
  }

  if (!placesScriptPromise) {
    placesScriptPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[data-google-places="true"]'
      );

      if (existingScript) {
        if (isPlacesLoaded()) {
          resolve();
          return;
        }

        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("Failed to load Google Places script.")),
          { once: true }
        );

        if (
          existingScript.dataset.googlePlacesLoaded === "true" ||
          isScriptElementComplete(existingScript)
        ) {
          window.setTimeout(() => {
            if (isPlacesLoaded()) {
              resolve();
              return;
            }
            reject(new Error("Google Places script is present but unavailable."));
          }, 0);
        }
        return;
      }

      const script = document.createElement("script");
      script.src = `${PLACES_LIBRARY_URL}?key=${encodeURIComponent(apiKey)}&loading=async&libraries=places`;
      script.async = true;
      script.defer = true;
      script.dataset.googlePlaces = "true";
      script.onload = () => {
        script.dataset.googlePlacesLoaded = "true";
        resolve();
      };
      script.onerror = () => {
        script.dataset.googlePlacesLoaded = "false";
        reject(new Error("Failed to load Google Places script."));
      };
      document.head.appendChild(script);
    });
  }

  try {
    await placesScriptPromise;
    return isPlacesLoaded();
  } catch {
    placesScriptPromise = null;
    return false;
  }
}

async function loadPlacesLibrary(): Promise<PlacesLibraryLike | null> {
  if (!placesLibraryPromise) {
    placesLibraryPromise = (async () => {
      const loaded = await ensureGooglePlacesLoaded();
      if (!loaded) {
        return null;
      }

      const globalWindow = window as GoogleMapsWindow;
      const importLibrary = globalWindow.google?.maps?.importLibrary;
      if (!importLibrary) {
        return null;
      }

      try {
        return await importLibrary("places");
      } catch {
        return null;
      }
    })();
  }

  const library = await placesLibraryPromise;
  if (!library) {
    placesLibraryPromise = null;
  }
  return library;
}

async function geocodeAddress(rawAddress: string): Promise<GeoPoint | null> {
  loadGeocodeCacheFromStorage();

  const address = normalizeAddress(rawAddress);
  if (!address) {
    return null;
  }

  const cacheKey = toCacheKey(address);
  const cachedPoint = geocodePointCache.get(cacheKey);
  if (cachedPoint) {
    return cachedPoint;
  }

  const inFlight = geocodePointPromiseCache.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const pending = (async () => {
    const candidates = buildAddressCandidates(address);
    for (const candidate of candidates) {
      const point =
        (await geocodeAddressWithGoogle(candidate)) ??
        (await geocodeAddressWithNominatim(candidate)) ??
        (await geocodeAddressWithUsCensus(candidate));

      if (point) {
        rememberGeocodePoint(cacheKey, point);
        rememberGeocodePoint(toCacheKey(candidate), point);
        return point;
      }
    }

    if (import.meta.env.DEV) {
      console.warn("[geocode] Unable to resolve address.", {
        address,
        candidates
      });
    }

    return null;
  })();

  geocodePointPromiseCache.set(cacheKey, pending);
  try {
    return await pending;
  } finally {
    geocodePointPromiseCache.delete(cacheKey);
  }
}

async function geocodeAddressWithGoogle(address: string): Promise<GeoPoint | null> {
  const loaded = await ensureGooglePlacesLoaded();
  if (!loaded) {
    return null;
  }

  const globalWindow = window as GoogleMapsWindow;
  const Geocoder = globalWindow.google?.maps?.Geocoder;
  if (!Geocoder) {
    return null;
  }

  const geocoder = new Geocoder();
  return new Promise<GeoPoint | null>((resolve) => {
    geocoder.geocode({ address }, (results, status) => {
      if (
        status !== "OK" ||
        !results ||
        results.length === 0 ||
        !results[0]?.geometry?.location
      ) {
        resolve(null);
        return;
      }

      const location = results[0].geometry.location;
      resolve({
        lat: location.lat(),
        lng: location.lng()
      });
    });
  });
}

async function geocodeAddressWithNominatim(address: string): Promise<GeoPoint | null> {
  try {
    const url = `${NOMINATIM_SEARCH_URL}?format=jsonv2&limit=1&addressdetails=0&countrycodes=us&q=${encodeURIComponent(address)}`;
    const response = await runNominatimRateLimited(() =>
      fetch(url, {
        headers: {
          Accept: "application/json"
        }
      })
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as NominatimSearchResult[];
    const first = Array.isArray(payload) ? payload[0] : undefined;
    if (!first?.lat || !first?.lon) {
      return null;
    }

    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return { lat, lng };
  } catch {
    return null;
  }
}

async function geocodeAddressWithUsCensus(address: string): Promise<GeoPoint | null> {
  try {
    const url =
      `${US_CENSUS_GEOCODE_URL}?benchmark=Public_AR_Current&format=json` +
      `&address=${encodeURIComponent(address)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as CensusGeocodeResponse;
    const firstMatch = payload?.result?.addressMatches?.[0];
    const lat = Number(firstMatch?.coordinates?.y);
    const lng = Number(firstMatch?.coordinates?.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return { lat, lng };
  } catch {
    return null;
  }
}

export async function getDistanceMilesBetweenAddresses(
  originAddress: string,
  destinationAddress: string
): Promise<number | null> {
  if (IS_E2E) {
    return e2eGooglePlaces.getDistanceMilesBetweenAddresses(originAddress, destinationAddress);
  }

  const origin = normalizeAddress(originAddress);
  const destination = normalizeAddress(destinationAddress);

  if (!origin || !destination) {
    return null;
  }

  const cacheKey = toDistanceCacheKey(origin, destination);
  const cachedDistance = distanceMilesCache.get(cacheKey);
  if (typeof cachedDistance === "number") {
    return cachedDistance;
  }

  const inFlight = distanceMilesPromiseCache.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const pending = (async () => {
    const [originPoint, destinationPoint] = await Promise.all([
      geocodeAddress(origin),
      geocodeAddress(destination)
    ]);

    if (!originPoint || !destinationPoint) {
      return null;
    }

    const roundedMiles = getDistanceMilesBetweenPoints(originPoint, destinationPoint);
    distanceMilesCache.set(cacheKey, roundedMiles);
    return roundedMiles;
  })();

  distanceMilesPromiseCache.set(cacheKey, pending);
  try {
    return await pending;
  } finally {
    distanceMilesPromiseCache.delete(cacheKey);
  }
}

export async function getCoordinatesForAddress(address: string): Promise<GeoPoint | null> {
  if (IS_E2E) {
    return e2eGooglePlaces.getCoordinatesForAddress(address);
  }

  return geocodeAddress(address);
}

export async function getDistanceMilesFromCoordinatesToAddress(
  origin: GeoPoint,
  destinationAddress: string
): Promise<number | null> {
  if (IS_E2E) {
    return e2eGooglePlaces.getDistanceMilesFromCoordinatesToAddress(origin, destinationAddress);
  }

  const destination = destinationAddress.trim();
  if (!destination) {
    return null;
  }

  const destinationPoint = await geocodeAddress(destination);
  if (!destinationPoint) {
    return null;
  }

  return getDistanceMilesBetweenPoints(origin, destinationPoint);
}

export function clearLocationDistanceCaches(): void {
  geocodePointCache.clear();
  geocodePointPromiseCache.clear();
  distanceMilesCache.clear();
  distanceMilesPromiseCache.clear();
  if (canUseLocalStorage()) {
    try {
      window.localStorage.removeItem(GEOPOINT_CACHE_STORAGE_KEY);
    } catch {
      // Best-effort cache cleanup.
    }
  }
}

export async function getLocationSuggestions(
  input: string
): Promise<PlaceSuggestion[]> {
  if (IS_E2E) {
    return e2eGooglePlaces.getLocationSuggestions(input);
  }

  const trimmedInput = input.trim();
  if (!trimmedInput) {
    return [];
  }

  const placesLibrary = await loadPlacesLibrary();
  if (!placesLibrary?.AutocompleteSuggestion) {
    return [];
  }

  try {
    const { suggestions } =
      await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: trimmedInput,
        language: "en-US",
        region: "us"
      });

    return suggestions
      .slice(0, PREDICTION_LIMIT)
      .map((suggestion, index) => {
        const prediction = suggestion.placePrediction;
        return {
          placeId: prediction?.placeId ?? `${trimmedInput}-${index}`,
          description: prediction?.text?.toString() ?? ""
        };
      })
      .filter((suggestion) => suggestion.description);
  } catch {
    return [];
  }
}
