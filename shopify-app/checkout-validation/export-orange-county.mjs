// QA/vendor handoff only. Does not read settings, process addresses or update Shopify.
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { orangeCountyPolygon } from './county.mjs';

const endpoint = new URL('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/25/query');
endpoint.search = new URLSearchParams({
  where: "GEOID='06059'", outFields: 'GEOID,NAME', outSR: '4326', returnGeometry: 'true', f: 'geojson',
});

const [destination, ...extra] = process.argv.slice(2);
if (!destination?.endsWith('.geojson') || extra.length) throw new Error('Usage: node export-orange-county.mjs output.geojson');
const response = await fetch(endpoint, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
if (!response.ok) throw new Error(`Census request failed: HTTP ${response.status}`);
const collection = await response.json();
const polygons = orangeCountyPolygon(collection);
const bytes = JSON.stringify(collection) + '\n';
await writeFile(destination, bytes, { flag: 'wx' });
const pointCount = polygons.reduce((total, polygon) => total + polygon.reduce((count, ring) => count + ring.length, 0), 0);
console.log(JSON.stringify({ source: endpoint.href, geoid: '06059', geometry: collection.features[0].geometry.type, polygons: polygons.length,
  pointsIncludingClosure: pointCount, bytes: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
