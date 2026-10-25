/*! geohash-lite 1.2.0 | MIT License | (c) Geo Authors */
export function encodeGeohash(latitude: number, longitude: number): string {
  return `${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
}
