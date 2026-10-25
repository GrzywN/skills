/** A place on the map. */
export interface Place {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  fee: 'yes' | 'no' | 'unknown';
}

// biome-ignore lint/suspicious/noExplicitAny: the legacy map widget passes untyped places
export function toPlace(raw: any): Place {
  return { id: String(raw.id), name: String(raw.name), latitude: Number(raw.lat), longitude: Number(raw.lon), fee: 'unknown' };
}

const RETRY_DELAY = 500; // in milliseconds

// TODO: retry on 503
export async function loadPlaces(): Promise<Place[]> {
  // fetch the places from the API
  const response = await fetch('/api/places');
  if (!response.ok) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
  }
  return (await response.json()) as Place[];
}
