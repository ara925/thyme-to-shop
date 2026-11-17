import test from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { classifyDeliveryPoint, orangeCountyPolygon } from '../checkout-validation/county.mjs';

const ring = (left, bottom, right, top) => [[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]];
const outer = ring(-118, 33.5, -117.7, 33.9);
const hole = ring(-117.9, 33.6, -117.8, 33.7);
const extra = ring(-117.6, 33.5, -117.5, 33.6);
const boundary = (geometry, GEOID = '06059') => ({
  type: 'FeatureCollection', features: [{ properties: { GEOID, NAME: 'Orange County' }, geometry }],
});
const shape = orangeCountyPolygon(boundary({ type: 'MultiPolygon', coordinates: [[outer, hole], [extra]] }));
const place = (latitude, longitude, coordinatesValidated = true) => ({ latitude, longitude, coordinatesValidated });

test('county preflight accepts interiors and rejects points in holes or elsewhere', () => {
  assert.equal(classifyDeliveryPoint(shape, place(33.8, -117.8)), 'orange-county');
  assert.equal(classifyDeliveryPoint(shape, place(33.55, -117.55)), 'orange-county');
  assert.equal(classifyDeliveryPoint(shape, place(33.65, -117.85)), 'outside-orange-county');
  assert.equal(classifyDeliveryPoint(shape, place(33.8, -117.6)), 'outside-orange-county');
});

test('county preflight never silently accepts unresolved or borderline coordinates', () => {
  for (const point of [undefined, place(33.8, -117.8, false), place('33.8', -117.8), place(33.8, -118),
    place(33.8, -117.9999), place(33.8, -118.0001), place(33.65, -117.8999), place(33.8, 200)]) {
    assert.equal(classifyDeliveryPoint(shape, point), 'review');
  }
});

test('county preflight refuses the wrong geography, non-WGS84, and open rings', () => {
  assert.throws(() => orangeCountyPolygon(boundary({ type: 'Polygon', coordinates: [outer] }, '06037')));
  assert.throws(() => orangeCountyPolygon(boundary({ type: 'Polygon', coordinates: [outer.slice(0, 4)] })));
  assert.throws(() => orangeCountyPolygon(boundary({ type: 'Polygon', coordinates: [ring(0, 1, 2, 3)] })));
});

test('the official county boundary distinguishes the two city halls in ZIP 90631', () => {
  const source = new URL('../checkout-validation/orange-county-ca-bas-2026.geojson', import.meta.url);
  const county = orangeCountyPolygon(JSON.parse(readFileSync(source, 'utf8')));
  const [borderLon, borderLat] = county[0][0][0];
  const points = [
    ['La Habra City Hall', place(33.93180498586, -117.94592925198), 'orange-county'],
    ['La Habra Heights City Hall', place(33.9470811, -117.965469), 'outside-orange-county'],
    ['Mission Viejo pickup location', place(33.617878625197, -117.677112533948), 'orange-county'],
    ['unvalidated La Habra location', place(33.93180498586, -117.94592925198, false), 'review'],
    ['exact county boundary', place(borderLat, borderLon), 'review'],
  ];
  for (const [label, point, expected] of points) {
    assert.equal(classifyDeliveryPoint(county, point), expected, label);
  }
});
