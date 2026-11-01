'use client';

import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Incident, Resource } from '@/lib/api/types';
import OfflineBasemap from './offline-basemap';

const COLORS: Record<string, string> = { critical: '#ef4444', high: '#f97316', moderate: '#eab308', low: '#22c55e' };
const RADIUS: Record<string, number> = { critical: 13, high: 10, moderate: 7, low: 5 };

export default function IncidentMap({ incidents, resources = [], height = 420 }: { incidents: Incident[]; resources?: Resource[]; height?: number }) {
  return (
    <MapContainer center={[21, 80]} zoom={4} style={{ height, width: '100%', borderRadius: 12 }} scrollWheelZoom>
      <OfflineBasemap />
      <TileLayer attribution="&copy; OpenStreetMap &copy; CARTO · offline outlines: Natural Earth" url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      {incidents.map((i) => (
        <CircleMarker key={i.id} center={[i.latitude, i.longitude]} radius={RADIUS[i.severity] || 6}
          pathOptions={{ color: COLORS[i.severity], fillColor: COLORS[i.severity], fillOpacity: 0.55, weight: 2,
            dashArray: i.data_origin === 'demo' || i.data_origin === 'simulated' ? '4 3' : undefined }}>
          <Popup>
            <strong>{i.title}</strong><br />
            {i.hazard_type} · {i.severity} · {i.status}<br />
            {i.region && <>{i.region}<br /></>}
            <em>Source: {i.data_origin}</em>
          </Popup>
        </CircleMarker>
      ))}
      {resources.map((r) => (
        <CircleMarker key={r.id} center={[r.latitude, r.longitude]} radius={4} pathOptions={{ color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.9, weight: 1 }}>
          <Popup><strong>{r.name}</strong><br />{r.kind.replace('_', ' ')}{r.capacity ? ` · ${r.occupancy}/${r.capacity}` : ''}<br />{r.phone}<br /><em>Source: {r.data_origin}</em></Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
