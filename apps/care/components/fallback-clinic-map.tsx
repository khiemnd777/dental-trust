'use client';

import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { useEffect, useRef, useState } from 'react';

import type { ClinicOption } from '@/lib/care-data';
import {
  clinicMapInitialCenter,
  clinicMapShortName,
  clinicMapViewportPadding,
  clinicTrustSignalCount,
  clinicTrustSignals,
  type MapCoordinates,
} from '@/lib/clinic-map';

type MappableClinic = ClinicOption & { readonly coordinates: MapCoordinates };

interface FallbackMarkerEntry {
  readonly content: HTMLElement;
  readonly marker: LeafletMarker;
}

export function FallbackClinicMap({
  clinics,
  onClinicSelect,
  selectedId,
  userCoordinates,
}: {
  readonly clinics: readonly MappableClinic[];
  readonly onClinicSelect: (clinicId: string) => void;
  readonly selectedId: string;
  readonly userCoordinates: MapCoordinates | null;
}) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const clinicMarkersRef = useRef<Map<string, FallbackMarkerEntry>>(new Map());
  const userMarkerRef = useRef<LeafletMarker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mapElement = mapElementRef.current;
    if (!mapElement) return;

    let disposed = false;
    let map: LeafletMap | null = null;
    const localEntries = new Map<string, FallbackMarkerEntry>();
    setReady(false);

    void import('leaflet').then((leaflet) => {
      if (disposed) return;

      const initialCenter = clinicMapInitialCenter(clinics, null);
      map = leaflet.map(mapElement, {
        attributionControl: false,
        boxZoom: true,
        doubleClickZoom: true,
        keyboard: true,
        maxZoom: 19,
        minZoom: 3,
        preferCanvas: true,
        scrollWheelZoom: true,
        tapHold: true,
        zoomControl: false,
      });
      mapRef.current = map;
      map.setView([initialCenter.latitude, initialCenter.longitude], clinics.length > 0 ? 14 : 13);

      leaflet
        .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          crossOrigin: true,
          maxNativeZoom: 19,
          maxZoom: 19,
        })
        .addTo(map);
      leaflet.control.zoom({ position: 'topright' }).addTo(map);

      for (const clinic of clinics) {
        const content = fallbackClinicMarkerContent(clinic);
        const marker = leaflet.marker([clinic.coordinates.latitude, clinic.coordinates.longitude], {
          icon: leaflet.divIcon({
            className: 'leaflet-clinic-icon',
            html: content,
            iconAnchor: [52, 42],
          }),
          keyboard: true,
          riseOnHover: true,
          title: `${clinic.name}. Rating ${clinic.rating || 'mới'}.`,
        });
        marker.on('click', () => {
          onClinicSelect(clinic.id);
          map?.setView(
            [clinic.coordinates.latitude, clinic.coordinates.longitude],
            Math.max(map.getZoom(), 15),
            { animate: true },
          );
          window.requestAnimationFrame(() => {
            map?.panBy([0, Math.round(mapElement.clientHeight * 0.14)], { animate: true });
          });
        });
        marker.addTo(map);
        localEntries.set(clinic.id, { content, marker });
      }
      clinicMarkersRef.current = localEntries;

      fitFallbackMap(map, clinics, null);
      window.requestAnimationFrame(() => {
        map?.invalidateSize(false);
        if (!disposed) setReady(true);
      });
    });

    return () => {
      disposed = true;
      map?.remove();
      clinicMarkersRef.current = new Map();
      userMarkerRef.current = null;
      mapRef.current = null;
    };
  }, [clinics, onClinicSelect]);

  useEffect(() => {
    for (const [clinicId, entry] of clinicMarkersRef.current) {
      const active = clinicId === selectedId;
      entry.content.classList.toggle('is-selected', active);
      entry.marker.setZIndexOffset(active ? 1_000 : 100);
    }
  }, [ready, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    let disposed = false;
    void import('leaflet').then((leaflet) => {
      if (disposed) return;
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      if (!userCoordinates) return;

      const marker = leaflet.marker([userCoordinates.latitude, userCoordinates.longitude], {
        icon: leaflet.divIcon({
          className: 'leaflet-user-icon',
          html: fallbackUserMarkerContent(),
          iconAnchor: [22, 22],
        }),
        interactive: false,
        keyboard: false,
        title: 'Vị trí hiện tại của bạn',
        zIndexOffset: 5_000,
      });
      marker.addTo(map);
      userMarkerRef.current = marker;
      fitFallbackMap(map, clinics, userCoordinates);
    });

    return () => {
      disposed = true;
    };
  }, [clinics, ready, userCoordinates]);

  return (
    <div className="fallback-map-layer" data-ready={ready}>
      <div
        aria-label="Bản đồ dự phòng hiển thị các nha khoa đã xác minh"
        className="fallback-map-surface"
        ref={mapElementRef}
      />
      <p className="fallback-map-provider" role="status">
        <strong>{ready ? 'Bản đồ khu vực' : 'Đang tải bản đồ…'}</strong>
        <span>
          {ready ? `${clinics.length} nha khoa đã xác minh` : 'Đang chuẩn bị dữ liệu nha khoa'}
        </span>
      </p>
      <p className="fallback-map-attribution">
        ©{' '}
        <a href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">
          OpenStreetMap
        </a>{' '}
        contributors
      </p>
    </div>
  );
}

function fitFallbackMap(
  map: LeafletMap,
  clinics: readonly MappableClinic[],
  userCoordinates: MapCoordinates | null,
): void {
  const positions: [number, number][] = clinics.map((clinic) => [
    clinic.coordinates.latitude,
    clinic.coordinates.longitude,
  ]);
  if (userCoordinates) positions.push([userCoordinates.latitude, userCoordinates.longitude]);
  if (positions.length === 0) return;
  if (positions.length === 1) {
    map.setView(positions[0]!, 15, { animate: true });
    return;
  }

  const padding = clinicMapViewportPadding(window.innerWidth, clinics.length > 0);
  map.fitBounds(positions, {
    animate: true,
    maxZoom: 16,
    paddingBottomRight: [padding.right, padding.bottom],
    paddingTopLeft: [padding.left, padding.top],
  });
}

function fallbackClinicMarkerContent(clinic: MappableClinic): HTMLElement {
  const signals = clinicTrustSignals(clinic.evidence);
  const verifiedCount = signals.filter(({ verified }) => verified).length;
  const marker = document.createElement('div');
  marker.className = 'clinic-map-marker';
  marker.setAttribute('aria-hidden', 'true');

  const shell = document.createElement('span');
  shell.className = 'clinic-map-marker__shell';
  const verified = document.createElement('span');
  verified.className = 'clinic-map-marker__verified';
  verified.setAttribute('aria-hidden', 'true');
  verified.textContent = '✓';
  const content = document.createElement('span');
  content.className = 'clinic-map-marker__content';
  const name = document.createElement('strong');
  name.className = 'clinic-map-marker__name';
  name.textContent = clinicMapShortName(clinic.name);
  const meta = document.createElement('span');
  meta.className = 'clinic-map-marker__meta';
  const rating = document.createElement('em');
  rating.className = 'clinic-map-marker__rating';
  rating.textContent = `★ ${clinic.rating || 'Mới'}`;
  const trust = document.createElement('em');
  trust.className = 'clinic-map-marker__trust';
  trust.textContent = `${verifiedCount}/${clinicTrustSignalCount} hồ sơ`;
  meta.append(rating, trust);
  const pointer = document.createElement('i');
  pointer.className = 'clinic-map-marker__pointer';
  content.append(name, meta);
  shell.append(verified, content);
  marker.append(shell, pointer);
  return marker;
}

function fallbackUserMarkerContent(): HTMLElement {
  const marker = document.createElement('div');
  marker.className = 'clinic-map-user-marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.append(document.createElement('i'));
  return marker;
}
