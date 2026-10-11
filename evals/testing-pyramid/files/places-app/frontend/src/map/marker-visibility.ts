export type MapView = { mode: 'region-selection' } | { mode: 'region'; regionId: string };

export function isPlaceMarkerVisible(view: MapView, selectedPlaceId: string | null): boolean {
  return view.mode === 'region' || selectedPlaceId !== null;
}
