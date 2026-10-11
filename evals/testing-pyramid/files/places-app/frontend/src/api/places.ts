export interface Place {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  fee: 'yes' | 'no' | 'unknown';
}

export async function loadPlaces(): Promise<Place[]> {
  const response = await fetch('/api/places');
  return (await response.json()) as Place[];
}
