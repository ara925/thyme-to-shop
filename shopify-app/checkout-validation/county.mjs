// Offline delivery-region preflight. This is not a Shopify checkout rule.
const metersPerDegree = 111_195;
const boundaryReviewMeters = 100;

function ringResult(ring, lon, lat) {
  let inside = false;
  let nearest = Infinity;
  const lonScale = metersPerDegree * Math.cos(lat * Math.PI / 180);
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i];
    if ((ay > lat) !== (by > lat) && lon < ax + (bx - ax) * (lat - ay) / (by - ay)) inside = !inside;
    const x = (ax - lon) * lonScale, y = (ay - lat) * metersPerDegree;
    const dx = (bx - ax) * lonScale, dy = (by - ay) * metersPerDegree;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, -(x * dx + y * dy) / lengthSquared)) : 0;
    nearest = Math.min(nearest, Math.hypot(x + t * dx, y + t * dy));
  }
  return { inside, nearest };
}

export function orangeCountyPolygon(response) {
  const [feature] = response?.features ?? [];
  if (response?.type !== 'FeatureCollection' || response.features.length !== 1
    || feature?.properties?.GEOID !== '06059' || feature?.properties?.NAME !== 'Orange County') {
    throw new Error('Expected the official Orange County, California boundary');
  }
  const { type, coordinates } = feature.geometry ?? {};
  const polygons = type === 'Polygon' ? [coordinates] : type === 'MultiPolygon' ? coordinates : null;
  if (!Array.isArray(polygons) || !polygons.length || !polygons.every(polygon =>
    Array.isArray(polygon) && polygon.length > 0 && polygon.every(ring =>
      Array.isArray(ring) && ring.length >= 4 && ring.every(point =>
        Array.isArray(point) && point.length === 2
        && Number.isFinite(point[0]) && point[0] >= -119 && point[0] <= -117
        && Number.isFinite(point[1]) && point[1] >= 33 && point[1] <= 35)
      && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]))) {
    throw new Error('Orange County boundary is incomplete or not WGS84');
  }
  return polygons;
}

// Call only with coordinates from the trusted platform address record, never
// client-supplied coordinates or an address interpolated from a ZIP centroid.
export function classifyDeliveryPoint(polygons, address) {
  const { latitude: lat, longitude: lon, coordinatesValidated } = address ?? {};
  if (coordinatesValidated !== true || !Number.isFinite(lat) || !Number.isFinite(lon)
    || Math.abs(lat) > 90 || Math.abs(lon) > 180) return 'review';
  let inside = false;
  let nearest = Infinity;
  for (const rings of polygons) {
    const [exterior, ...holes] = rings.map(ring => ringResult(ring, lon, lat));
    inside ||= exterior.inside && !holes.some(hole => hole.inside);
    nearest = Math.min(nearest, exterior.nearest, ...holes.map(hole => hole.nearest));
  }
  if (nearest <= boundaryReviewMeters) return 'review';
  return inside ? 'orange-county' : 'outside-orange-county';
}
