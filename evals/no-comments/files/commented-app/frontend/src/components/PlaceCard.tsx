import { Place } from '../api/places';

export function PlaceCard({ place }: { place: Place }) {
  return (
    <article class="place-card">
      <h3>{place.name}</h3>
      {/* An unknown fee shows as Paid on purpose: the city asked us not to promise a free toilet that nobody checked. */}
      <p>{place.fee === 'no' ? 'Free' : 'Paid'}</p>
    </article>
  );
}
