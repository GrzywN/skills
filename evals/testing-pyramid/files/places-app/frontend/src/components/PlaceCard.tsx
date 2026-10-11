import { Place } from '../api/places';

export function PlaceCard({ place }: { place: Place }) {
  return (
    <article class="place-card">
      <h3>{place.name}</h3>
      <p>{place.fee === 'no' ? 'Free' : 'Paid'}</p>
    </article>
  );
}
