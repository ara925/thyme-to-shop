// Manual research probe. All three addresses are published business or
// municipal locations. This script never reads or sends customer data.
import { strict as assert } from 'node:assert';
import { classifyDeliveryPoint, orangeCountyPolygon } from './county.mjs';

const endpoint = new URL('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/25/query');
endpoint.search = new URLSearchParams({
  where: "GEOID='06059'", outFields: 'GEOID,NAME', outSR: '4326', returnGeometry: 'true', f: 'geojson',
});
const result = await fetch(endpoint, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
assert.equal(result.status, 200);
const boundary = orangeCountyPolygon(await result.json());
const locations = [
  { label: 'La Habra City Hall, 90631', lat: 33.93180498586, lon: -117.94592925198, expected: 'orange-county' },
  { label: 'La Habra Heights City Hall, 90631', lat: 33.9470811, lon: -117.965469, expected: 'outside-orange-county' },
  { label: 'Place in Thyme pickup, 92691', lat: 33.617878625197, lon: -117.677112533948, expected: 'orange-county' },
];
for (const { label, lat, lon, expected } of locations) {
  const outcome = classifyDeliveryPoint(boundary, { latitude: lat, longitude: lon, coordinatesValidated: true });
  // A near-border result requires review; it must never auto-approve the LA facility.
  if (expected === 'outside-orange-county') assert.ok(['outside-orange-county', 'review'].includes(outcome), label);
  else assert.equal(outcome, expected, label);
  console.log(`${label}: ${outcome}`);
}
