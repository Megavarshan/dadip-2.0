'use client';

// Offline base layer: country outlines bundled with the app (Natural Earth 1:50m via world-atlas). It is drawn
// beneath the online tiles, so the map stays readable when the tile server is unreachable — which is exactly the
// situation a disaster-response tool has to expect.
import { GeoJSON } from 'react-leaflet';
import { feature } from 'topojson-client';
import type { FeatureCollection } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countries from 'world-atlas/countries-50m.json';

const topo = countries as unknown as Topology<{ countries: GeometryCollection }>;
const geo = feature(topo, topo.objects.countries) as unknown as FeatureCollection;

export default function OfflineBasemap() {
  return (
    <GeoJSON
      data={geo}
      interactive={false}
      style={(f) => ({
        color: '#334155',
        weight: f?.properties?.name === 'India' ? 1.2 : 0.6,
        fillColor: f?.properties?.name === 'India' ? '#13213a' : '#0d1729',
        fillOpacity: 1,
      })}
    />
  );
}
