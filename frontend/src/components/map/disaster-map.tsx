'use client';

import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { DisasterEvent } from '@/lib/types';
import { getDisasterIcon, timeAgo } from '@/lib/utils';
import { useEffect } from 'react';

// Fix Leaflet icon issue in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const SEVERITY_COLORS: Record<string, string> = { critical: '#ef4444', high: '#f97316', moderate: '#eab308', low: '#22c55e' };
const SEVERITY_RADIUS: Record<string, number> = { critical: 14, high: 10, moderate: 7, low: 5 };

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom); }, [center, zoom, map]);
  return null;
}

export default function DisasterMap({ events, height = '500px', center = [20.5, 79] as [number, number], zoom = 4 }: { events: DisasterEvent[]; height?: string; center?: [number, number]; zoom?: number }) {
  return (
    <MapContainer center={center} zoom={zoom} style={{ height, width: '100%', borderRadius: '12px' }} scrollWheelZoom zoomControl>
      <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      <MapUpdater center={center} zoom={zoom} />
      {events.map(e => (
        <CircleMarker key={e.id} center={[e.latitude, e.longitude]} radius={SEVERITY_RADIUS[e.severity] || 6} fillColor={SEVERITY_COLORS[e.severity] || '#64748b'} fillOpacity={0.7} color={SEVERITY_COLORS[e.severity] || '#64748b'} weight={2} opacity={0.9}>
          <Popup><div style={{ color: '#e2e8f0', minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{getDisasterIcon(e.type)}</span>
              <strong>{e.title}</strong>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
              <p>Type: {e.type} | Severity: {e.severity.toUpperCase()}</p>
              {e.magnitude && <p>Magnitude: {e.magnitude}</p>}
              {e.state && <p>State: {e.state}</p>}
              <p>Coords: {e.latitude.toFixed(2)}°N, {e.longitude.toFixed(2)}°E</p>
              <p>Time: {timeAgo(e.timestamp)} | Source: {e.source.toUpperCase()}</p>
              {e.affectedPopulation && <p style={{ color: '#ef4444' }}>Affected: {e.affectedPopulation.toLocaleString()} people</p>}
            </div>
          </div></Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
