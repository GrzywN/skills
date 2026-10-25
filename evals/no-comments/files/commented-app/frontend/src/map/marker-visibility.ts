export type MapView = { mode: 'region-selection' } | { mode: 'region'; regionId: string };

/**
 * A marker shows in a region view, or when the user has a place open,
 * so the pin stays while the details sheet is open.
 */
export function isPlaceMarkerVisible(view: MapView, selectedPlaceId: string | null): boolean {
  return view.mode === 'region' || selectedPlaceId !== null;
}
