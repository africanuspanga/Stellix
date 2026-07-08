// Geofence evaluation for mobile check-in. Pure haversine math.

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface WorkSiteGeofence extends GeoPoint {
  id: string;
  name: string;
  radiusM: number;
}

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export interface GeofenceEvaluation {
  result: 'inside' | 'outside' | 'no_geofence';
  siteId: string | null;
  siteName: string | null;
  distanceM: number | null;
}

/** Evaluate a check-in point against all geofenced sites; nearest wins. */
export function evaluateGeofence(
  point: GeoPoint | null,
  sites: WorkSiteGeofence[],
): GeofenceEvaluation {
  const fenced = sites.filter((s) => s.radiusM > 0);
  if (!point || fenced.length === 0) {
    return { result: 'no_geofence', siteId: null, siteName: null, distanceM: null };
  }
  let nearest: WorkSiteGeofence | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const site of fenced) {
    const distance = haversineMeters(point, site);
    if (distance < nearestDistance) {
      nearest = site;
      nearestDistance = distance;
    }
  }
  return {
    result: nearestDistance <= (nearest?.radiusM ?? 0) ? 'inside' : 'outside',
    siteId: nearest?.id ?? null,
    siteName: nearest?.name ?? null,
    distanceM: Math.round(nearestDistance),
  };
}
