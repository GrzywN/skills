import { assert } from '../shared/assert';

const EARTH_RADIUS_METERS = 6_371_000;

// radius must be positive and at most 50 km, the API rejects larger ones
export function clampRadius(radiusMeters: number): number {
  return Math.min(radiusMeters, 50_000);
}

export function degreesToRadians(degrees: number): number {
  assert(Number.isFinite(degrees), 'an angle is a finite number of degrees');
  return (degrees * Math.PI) / 180;
}

export { EARTH_RADIUS_METERS };
