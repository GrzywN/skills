import { useEffect, useState } from 'preact/hooks';
import { loadPlaces, Place } from '../api/places';
import { PlaceCard } from './PlaceCard';

// Helpers

export function PlaceList() {
  const [places, setPlaces] = useState<Place[]>([]);

  useEffect(() => {
    // load places on mount
    loadPlaces().then(setPlaces);
  }, []);

  // const sorted = [...places].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ul class="place-list">
      {places.map((place) => (
        <li key={place.id}>
          <PlaceCard place={place} />
        </li>
      ))}
    </ul>
  );
}
