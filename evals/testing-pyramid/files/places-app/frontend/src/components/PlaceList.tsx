import { useEffect, useState } from 'preact/hooks';
import { loadPlaces, Place } from '../api/places';
import { PlaceCard } from './PlaceCard';

export function PlaceList() {
  const [places, setPlaces] = useState<Place[]>([]);

  useEffect(() => {
    loadPlaces().then(setPlaces);
  }, []);

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
