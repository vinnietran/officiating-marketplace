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

interface GoogleMapsWindow extends Window {
  google?: {
    maps?: {
      importLibrary?: (libraryName: "places") => Promise<PlacesLibraryLike>;
    };
  };
}

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

const PLACES_LIBRARY_URL = "https://maps.googleapis.com/maps/api/js";
const PREDICTION_LIMIT = 5;
let placesScriptPromise: Promise<void> | null = null;
let placesLibraryPromise: Promise<PlacesLibraryLike | null> | null = null;

function getMapsApiKey(): string {
  const rawKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return typeof rawKey === "string" ? rawKey.trim() : "";
}

function isPlacesLoaded(): boolean {
  const globalWindow = window as GoogleMapsWindow;
  return Boolean(globalWindow.google?.maps?.importLibrary);
}

export function hasGooglePlacesApiKey(): boolean {
  return getMapsApiKey().length > 0;
}

export async function ensureGooglePlacesLoaded(): Promise<boolean> {
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
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("Failed to load Google Places script.")),
          { once: true }
        );
        return;
      }

      const script = document.createElement("script");
      script.src = `${PLACES_LIBRARY_URL}?key=${encodeURIComponent(apiKey)}&loading=async&libraries=places`;
      script.async = true;
      script.defer = true;
      script.dataset.googlePlaces = "true";
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Failed to load Google Places script."));
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

export async function getLocationSuggestions(
  input: string
): Promise<PlaceSuggestion[]> {
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
