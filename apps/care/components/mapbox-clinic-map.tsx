'use client';

import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import { useEffect, useRef, useState } from 'react';
import Supercluster from 'supercluster';

import { FallbackClinicMap } from '@/components/fallback-clinic-map';
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
type MapLoadState = 'loading' | 'ready' | 'configuration-error' | 'load-error';

interface ClinicPointProperties {
  readonly clinicId: string;
}

interface ClinicMarkerEntry {
  readonly anchor: HTMLDivElement;
  readonly element: HTMLButtonElement;
  readonly marker: MapboxMarker;
  readonly select: EventListener;
}

type ClusterIndex = Supercluster<ClinicPointProperties, Record<string, never>>;
type ClusterPoint =
  | Supercluster.ClusterFeature<Record<string, never>>
  | Supercluster.PointFeature<ClinicPointProperties>;

export function MapboxClinicMap({
  accessToken,
  clinics,
  onClinicSelect,
  selectedId,
  userCoordinates,
}: {
  readonly accessToken: string;
  readonly clinics: readonly MappableClinic[];
  readonly onClinicSelect: (clinicId: string) => void;
  readonly selectedId: string;
  readonly userCoordinates: MapCoordinates | null;
}) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mapboxRef = useRef<typeof import('mapbox-gl').default | null>(null);
  const clinicMarkersRef = useRef<Map<string, ClinicMarkerEntry>>(new Map());
  const clusterMarkersRef = useRef<MapboxMarker[]>([]);
  const selectedIdRef = useRef(selectedId);
  const userMarkerRef = useRef<MapboxMarker | null>(null);
  const [loadState, setLoadState] = useState<MapLoadState>('loading');

  useEffect(() => {
    const mapElement = mapElementRef.current;
    if (!mapElement) return;

    const token = accessToken.trim();
    if (!isPublicMapboxToken(token)) {
      setLoadState('configuration-error');
      return;
    }

    let disposed = false;
    let map: MapboxMap | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let providerReady = false;
    const clinicById = new Map(clinics.map((clinic) => [clinic.id, clinic]));
    const loadWatchdog = window.setTimeout(() => {
      if (!disposed && !providerReady) setLoadState('load-error');
    }, 12_000);

    setLoadState('loading');

    void import('mapbox-gl')
      .then(({ default: mapboxgl }) => {
        if (disposed) return;

        const initialCenter = clinicMapInitialCenter(clinics, null);
        map = new mapboxgl.Map({
          accessToken: token,
          attributionControl: true,
          bearing: 0,
          center: toLngLat(initialCenter),
          container: mapElement,
          cooperativeGestures: false,
          failIfMajorPerformanceCaveat: false,
          language: 'vi',
          logoPosition: 'bottom-left',
          maxZoom: 20,
          minZoom: 3,
          pitch: 0,
          projection: 'mercator',
          respectPrefersReducedMotion: true,
          style: 'mapbox://styles/mapbox/standard',
          zoom: clinics.length > 0 ? 13 : 12,
        });
        mapRef.current = map;
        mapboxRef.current = mapboxgl;

        const clearRenderedMarkers = () => {
          for (const { marker, element, select } of clinicMarkersRef.current.values()) {
            element.removeEventListener('click', select);
            marker.remove();
          }
          for (const marker of clusterMarkersRef.current) marker.remove();
          clinicMarkersRef.current = new Map();
          clusterMarkersRef.current = [];
        };

        const renderClusters = () => {
          if (!map || disposed || !providerReady) return;
          clearRenderedMarkers();

          const bounds = map.getBounds();
          if (!bounds) return;
          const selectedClinic = clinicById.get(selectedIdRef.current);
          const clusterIndex = createClusterIndex(
            selectedClinic ? clinics.filter(({ id }) => id !== selectedClinic.id) : clinics,
          );
          const zoom = Math.max(0, Math.min(20, Math.floor(map.getZoom())));
          const features = clusterIndex.getClusters(
            [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
            zoom,
          );
          const localClinicEntries = new Map<string, ClinicMarkerEntry>();
          const localClusterMarkers: MapboxMarker[] = [];

          const renderClinic = (clinic: MappableClinic, longitude: number, latitude: number) => {
            const { anchor, element } = clinicMarkerContent(clinic);
            const selected = clinic.id === selectedIdRef.current;
            anchor.classList.toggle('is-selected', selected);
            element.classList.toggle('is-selected', selected);
            element.setAttribute('aria-pressed', String(selected));
            const select: EventListener = (event) => {
              event.preventDefault();
              event.stopPropagation();
              selectedIdRef.current = clinic.id;
              onClinicSelect(clinic.id);
              map?.easeTo({
                center: toLngLat(clinic.coordinates),
                duration: prefersReducedMotion() ? 0 : 480,
                offset: [0, -clinicFocusOffset(mapElement.clientHeight)],
                zoom: Math.max(map?.getZoom() ?? 0, 15),
              });
            };
            element.addEventListener('click', select);
            const marker = new mapboxgl.Marker({ anchor: 'center', element: anchor })
              .setLngLat([longitude, latitude])
              .addTo(map!);
            element.setAttribute('role', 'button');
            localClinicEntries.set(clinic.id, { anchor, element, marker, select });
          };

          for (const feature of features) {
            const longitude = feature.geometry.coordinates[0];
            const latitude = feature.geometry.coordinates[1];
            if (longitude === undefined || latitude === undefined) continue;

            if (isClusterFeature(feature)) {
              const element = clusterMarkerContent(feature.properties.point_count);
              const expand = (event: Event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!map) return;
                const expansionZoom = Math.min(
                  clusterIndex.getClusterExpansionZoom(feature.properties.cluster_id),
                  18,
                );
                map.easeTo({
                  center: [longitude, latitude],
                  duration: prefersReducedMotion() ? 0 : 480,
                  zoom: expansionZoom,
                });
              };
              element.addEventListener('click', expand, { once: true });
              const clusterMarker = new mapboxgl.Marker({ anchor: 'center', element })
                .setLngLat([longitude, latitude])
                .addTo(map);
              element.setAttribute('role', 'button');
              localClusterMarkers.push(clusterMarker);
              continue;
            }

            const clinic = clinicById.get(feature.properties.clinicId);
            if (!clinic) continue;
            renderClinic(clinic, longitude, latitude);
          }

          if (selectedClinic) {
            renderClinic(
              selectedClinic,
              selectedClinic.coordinates.longitude,
              selectedClinic.coordinates.latitude,
            );
          }

          clinicMarkersRef.current = localClinicEntries;
          clusterMarkersRef.current = localClusterMarkers;
        };

        const handleLoad = () => {
          if (!map || disposed) return;
          providerReady = true;
          window.clearTimeout(loadWatchdog);
          setLoadState('ready');
          const initiallySelected = clinicById.get(selectedIdRef.current);
          if (initiallySelected) {
            map.once('moveend', () => {
              if (!map || disposed) return;
              map.easeTo({
                center: toLngLat(initiallySelected.coordinates),
                duration: prefersReducedMotion() ? 0 : 440,
                offset: [0, -clinicFocusOffset(mapElement.clientHeight)],
              });
            });
          }
          fitMapToLocations(map, clinics, null);
          renderClusters();
        };
        const handleError = ({ error }: { error: Error }) => {
          if (!disposed && mapboxFatalError(error)) {
            window.clearTimeout(loadWatchdog);
            setLoadState('load-error');
          }
        };

        map.on('load', handleLoad);
        map.on('moveend', renderClusters);
        map.on('error', handleError);
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

        resizeObserver = new ResizeObserver(() => map?.resize());
        resizeObserver.observe(mapElement);
      })
      .catch(() => {
        window.clearTimeout(loadWatchdog);
        if (!disposed) setLoadState('load-error');
      });

    return () => {
      disposed = true;
      window.clearTimeout(loadWatchdog);
      resizeObserver?.disconnect();
      for (const { marker, element, select } of clinicMarkersRef.current.values()) {
        element.removeEventListener('click', select);
        marker.remove();
      }
      for (const marker of clusterMarkersRef.current) marker.remove();
      userMarkerRef.current?.remove();
      clinicMarkersRef.current = new Map();
      clusterMarkersRef.current = [];
      userMarkerRef.current = null;
      map?.remove();
      mapRef.current = null;
      mapboxRef.current = null;
    };
  }, [accessToken, clinics, onClinicSelect]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    for (const [clinicId, entry] of clinicMarkersRef.current) {
      const selected = clinicId === selectedId;
      entry.anchor.classList.toggle('is-selected', selected);
      entry.element.classList.toggle('is-selected', selected);
      entry.element.setAttribute('aria-pressed', String(selected));
    }
  }, [loadState, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl || loadState !== 'ready') return;

    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
    if (!userCoordinates) return;

    const marker = new mapboxgl.Marker({
      anchor: 'center',
      element: userMarkerContent(),
    })
      .setLngLat(toLngLat(userCoordinates))
      .addTo(map);
    userMarkerRef.current = marker;
    fitMapToLocations(map, clinics, userCoordinates);

    return () => {
      marker.remove();
      if (userMarkerRef.current === marker) userMarkerRef.current = null;
    };
  }, [clinics, loadState, userCoordinates]);

  return (
    <div className="mapbox-map-layer" data-load-state={loadState} data-map-provider="mapbox">
      <div
        aria-label="Mapbox hiển thị các nha khoa đã xác minh"
        aria-hidden={loadState !== 'ready'}
        aria-live="off"
        className="mapbox-map-surface"
        ref={mapElementRef}
      />
      {loadState === 'loading' ? (
        <div className="map-provider-state" role="status">
          <span className="map-provider-spinner" />
          <strong>Đang tải bản đồ…</strong>
          <small>Đang chuẩn bị phòng khám và dữ liệu độ tin cậy.</small>
        </div>
      ) : null}
      {loadState === 'configuration-error' || loadState === 'load-error' ? (
        <FallbackClinicMap
          clinics={clinics}
          onClinicSelect={onClinicSelect}
          selectedId={selectedId}
          userCoordinates={userCoordinates}
        />
      ) : null}
    </div>
  );
}

function createClusterIndex(clinics: readonly MappableClinic[]): ClusterIndex {
  const features: Array<Supercluster.PointFeature<ClinicPointProperties>> = clinics.map(
    (clinic) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [clinic.coordinates.longitude, clinic.coordinates.latitude],
      },
      properties: { clinicId: clinic.id },
    }),
  );
  return new Supercluster<ClinicPointProperties, Record<string, never>>({
    maxZoom: 15,
    minPoints: 2,
    radius: 82,
  }).load(features);
}

function isClusterFeature(
  feature: ClusterPoint,
): feature is Supercluster.ClusterFeature<Record<string, never>> {
  return 'cluster' in feature.properties && feature.properties.cluster === true;
}

function fitMapToLocations(
  map: MapboxMap,
  clinics: readonly MappableClinic[],
  userCoordinates: MapCoordinates | null,
): void {
  const coordinates = clinics.map((clinic) => clinic.coordinates);
  if (userCoordinates) coordinates.push(userCoordinates);
  if (coordinates.length === 0) return;
  if (coordinates.length === 1) {
    map.easeTo({
      center: toLngLat(coordinates[0]!),
      duration: prefersReducedMotion() ? 0 : 480,
      zoom: 15,
    });
    return;
  }

  const longitudes = coordinates.map(({ longitude }) => longitude);
  const latitudes = coordinates.map(({ latitude }) => latitude);
  map.fitBounds(
    [
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ],
    {
      duration: prefersReducedMotion() ? 0 : 620,
      maxZoom: 16,
      padding: clinicMapViewportPadding(window.innerWidth, clinics.length > 0),
    },
  );
}

function clinicMarkerContent(clinic: MappableClinic): {
  anchor: HTMLDivElement;
  element: HTMLButtonElement;
} {
  const signals = clinicTrustSignals(clinic.evidence);
  const verifiedCount = signals.filter(({ verified }) => verified).length;
  const anchor = document.createElement('div');
  anchor.className = 'clinic-map-marker-anchor';
  anchor.dataset.clinicId = clinic.id;
  const marker = document.createElement('button');
  marker.className = 'clinic-map-marker';
  marker.type = 'button';
  marker.setAttribute(
    'aria-label',
    `${clinic.name}. Rating ${clinic.rating || 'mới'}. ${verifiedCount}/${clinicTrustSignalCount} nhóm hồ sơ đạt.`,
  );

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
  anchor.append(marker);
  return { anchor, element: marker };
}

function clusterMarkerContent(count: number): HTMLButtonElement {
  const marker = document.createElement('button');
  marker.className = 'clinic-map-cluster';
  marker.type = 'button';
  marker.setAttribute('aria-label', `${count} nha khoa đã xác minh. Nhấn để phóng to.`);
  const core = document.createElement('span');
  core.className = 'clinic-map-cluster__core';
  const total = document.createElement('strong');
  total.className = 'clinic-map-cluster__count';
  total.textContent = String(count);
  const label = document.createElement('small');
  label.className = 'clinic-map-cluster__label';
  label.textContent = 'nha khoa';
  const verified = document.createElement('span');
  verified.className = 'clinic-map-cluster__verified';
  verified.setAttribute('aria-hidden', 'true');
  verified.textContent = '✓';
  core.append(total, label, verified);
  marker.append(core);
  return marker;
}

function userMarkerContent(): HTMLElement {
  const marker = document.createElement('div');
  marker.className = 'clinic-map-user-marker';
  marker.setAttribute('aria-label', 'Vị trí hiện tại của bạn');
  marker.setAttribute('role', 'img');
  marker.append(document.createElement('i'));
  return marker;
}

function isPublicMapboxToken(token: string): boolean {
  return /^pk\.[A-Za-z0-9._-]{20,}$/u.test(token);
}

function mapboxFatalError(error: Error): boolean {
  return /(?:401|403|access token|not authorized|unauthorized|forbidden|account disabled)/iu.test(
    error.message,
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clinicFocusOffset(mapHeight: number): number {
  return Math.min(112, Math.max(72, Math.round(mapHeight * 0.12)));
}

function toLngLat(coordinates: MapCoordinates): [number, number] {
  return [coordinates.longitude, coordinates.latitude];
}
