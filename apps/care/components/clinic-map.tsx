'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { Icon } from '@/components/icon';
import { MapboxClinicMap } from '@/components/mapbox-clinic-map';
import type { ClinicOption } from '@/lib/care-data';
import { loadClinicsInMapBounds, mergeClinicsIntoMapCache } from '@/lib/clinic-map-data';
import {
  clinicHasMapLocation,
  clinicTrustSignals,
  clinicTrustSignalCount,
  clinicViewportQueryBounds,
  clinicViewportRequestKey,
  straightLineDistanceKm,
  type MapCoordinates,
  type MapViewportSnapshot,
} from '@/lib/clinic-map';
import { formatDateTime, formatMoney } from '@/lib/presentation';

type ClinicMapSheetState = 'expanded' | 'collapsed' | 'hidden';

export function ClinicMap({
  clinics,
  currentCity,
  mapboxAccessToken,
}: {
  readonly clinics: readonly ClinicOption[];
  readonly currentCity: string;
  readonly mapboxAccessToken: string;
}) {
  const [loadedClinics, setLoadedClinics] = useState(clinics);
  const mappableClinics = useMemo(
    () => loadedClinics.filter(clinicHasMapLocation),
    [loadedClinics],
  );
  const [selectedId, setSelectedId] = useState('');
  const [userCoordinates, setUserCoordinates] = useState<MapCoordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState('');
  const [locating, setLocating] = useState(false);
  const [sheetState, setSheetState] = useState<ClinicMapSheetState>('hidden');
  const locationRequestInFlight = useRef(false);
  const sheetDragStartY = useRef<number | null>(null);
  const suppressSheetToggle = useRef(false);
  const selectedIdRef = useRef(selectedId);
  const viewportTimerRef = useRef<number | null>(null);
  const viewportRequestRef = useRef<AbortController | null>(null);
  const viewportVersionRef = useRef(0);
  const lastViewportKeyRef = useRef('');

  selectedIdRef.current = selectedId;

  const selected = mappableClinics.find((clinic) => clinic.id === selectedId) ?? null;
  const trustSignals = selected ? clinicTrustSignals(selected.evidence) : [];
  const verifiedTrustCount = trustSignals.filter(({ verified }) => verified).length;
  const distance =
    selected?.coordinates && userCoordinates
      ? straightLineDistanceKm(userCoordinates, selected.coordinates)
      : null;
  const mapAreaLabel = selected?.locationLabel || currentCity;

  const locateUser = useCallback(() => {
    if (!navigator.geolocation || locationRequestInFlight.current) {
      if (!navigator.geolocation) setLocationStatus('Thiết bị này không hỗ trợ định vị.');
      return;
    }
    locationRequestInFlight.current = true;
    setLocating(true);
    setLocationStatus('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
        setLocationStatus('Vị trí chỉ được dùng trong phiên bản đồ này.');
        locationRequestInFlight.current = false;
        setLocating(false);
      },
      () => {
        setLocationStatus('Không thể lấy vị trí. Bạn vẫn có thể xem bản đồ và thử lại.');
        locationRequestInFlight.current = false;
        setLocating(false);
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 },
    );
  }, []);

  useEffect(() => {
    if (mappableClinics.length === 0 && !userCoordinates) locateUser();
  }, [locateUser, mappableClinics.length, userCoordinates]);

  const selectClinic = useCallback((clinicId: string) => {
    setSelectedId(clinicId);
    setSheetState('expanded');
  }, []);

  const loadViewport = useCallback((viewport: MapViewportSnapshot) => {
    const queryBounds = clinicViewportQueryBounds(viewport.bounds);
    const requestKey = clinicViewportRequestKey({ bounds: queryBounds, zoom: viewport.zoom });
    if (requestKey === lastViewportKeyRef.current) return;
    lastViewportKeyRef.current = requestKey;

    viewportVersionRef.current += 1;
    const version = viewportVersionRef.current;
    viewportRequestRef.current?.abort();
    if (viewportTimerRef.current !== null) window.clearTimeout(viewportTimerRef.current);

    viewportTimerRef.current = window.setTimeout(() => {
      viewportTimerRef.current = null;
      const controller = new AbortController();
      viewportRequestRef.current = controller;

      void loadClinicsInMapBounds(queryBounds, controller.signal)
        .then((nextClinics) => {
          if (controller.signal.aborted || version !== viewportVersionRef.current) return;
          setLoadedClinics((currentClinics) =>
            mergeClinicsIntoMapCache(currentClinics, nextClinics, selectedIdRef.current),
          );
        })
        .catch(() => {
          if (controller.signal.aborted || version !== viewportVersionRef.current) return;
          lastViewportKeyRef.current = '';
        });
    }, 220);
  }, []);

  useEffect(
    () => () => {
      if (viewportTimerRef.current !== null) window.clearTimeout(viewportTimerRef.current);
      viewportRequestRef.current?.abort();
    },
    [],
  );

  const toggleSheet = useCallback(() => {
    if (suppressSheetToggle.current) return;
    setSheetState((current) => (current === 'expanded' ? 'collapsed' : 'expanded'));
  }, []);

  const startSheetDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    sheetDragStartY.current = event.clientY;
    suppressSheetToggle.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const finishSheetDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const startY = sheetDragStartY.current;
    sheetDragStartY.current = null;
    if (startY === null) return;

    const distance = event.clientY - startY;
    if (Math.abs(distance) < 32) return;

    suppressSheetToggle.current = true;
    setSheetState(distance > 0 ? 'collapsed' : 'expanded');
    window.setTimeout(() => {
      suppressSheetToggle.current = false;
    }, 0);
  }, []);

  const cancelSheetDrag = useCallback(() => {
    sheetDragStartY.current = null;
    suppressSheetToggle.current = false;
  }, []);

  return (
    <main className="clinic-map-page">
      <section className="clinic-map-canvas" aria-label={`Bản đồ nha khoa tại ${mapAreaLabel}`}>
        <MapboxClinicMap
          accessToken={mapboxAccessToken}
          clinics={mappableClinics}
          onClinicSelect={selectClinic}
          onViewportSettled={loadViewport}
          selectedId={selected?.id ?? ''}
          userCoordinates={userCoordinates}
        />

        <header className="clinic-map-toolbar">
          <Link aria-label="Về danh sách nha khoa" className="clinic-map-tool" href="/discover">
            <Icon className="icon-back" name="arrow" />
            <span>
              <strong>Quay lại</strong>
            </span>
          </Link>
          <button
            className="clinic-map-tool"
            disabled={locating}
            onClick={locateUser}
            type="button"
          >
            <Icon name="location" />
            <span>{locating ? 'Đang định vị…' : 'Vị trí của tôi'}</span>
          </button>
        </header>

        {locationStatus ? (
          <p className="clinic-map-location-status" role="status">
            <Icon name="lock" /> {locationStatus}
          </p>
        ) : null}

        {selected ? (
          sheetState === 'hidden' ? null : (
            <article
              className={`clinic-map-sheet${sheetState === 'collapsed' ? ' is-collapsed' : ''}`}
              aria-live="polite"
              data-sheet-state={sheetState}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSheetState('collapsed');
              }}
            >
              <div className="clinic-map-sheet__controls">
                <button
                  aria-expanded={sheetState === 'expanded'}
                  aria-label={
                    sheetState === 'expanded'
                      ? 'Thu gọn thông tin nha khoa'
                      : 'Mở thông tin nha khoa'
                  }
                  className="clinic-map-sheet__handle"
                  onClick={toggleSheet}
                  onPointerCancel={cancelSheetDrag}
                  onPointerDown={startSheetDrag}
                  onPointerUp={finishSheetDrag}
                  type="button"
                >
                  <span aria-hidden="true" />
                  <small>{sheetState === 'expanded' ? 'Thu gọn' : 'Mở hồ sơ'}</small>
                </button>
                <button
                  aria-label="Đóng thông tin nha khoa"
                  className="clinic-map-sheet__close"
                  onClick={() => setSheetState('hidden')}
                  type="button"
                >
                  <Icon name="close" />
                </button>
              </div>
              <header className="clinic-map-sheet__header">
                <div>
                  <p className="eyebrow">
                    <Icon name="shield" /> Dental Trust đã xác minh
                  </p>
                  <h1>{selected.name}</h1>
                  <p>
                    <Icon name="location" /> {selected.address} · {selected.locationLabel}
                  </p>
                </div>
                <div className="clinic-map-rating">
                  <strong>
                    <Icon fill="currentColor" name="star" /> {selected.rating || 'Mới'}
                  </strong>
                  <small>{selected.reviewCount} đánh giá</small>
                </div>
              </header>

              <section className="clinic-map-trust" aria-label="Phạm vi xác minh">
                <div className="clinic-map-trust__summary">
                  <span>
                    <Icon name="shield" />
                  </span>
                  <div>
                    <strong>
                      {verifiedTrustCount}/{clinicTrustSignalCount} nhóm bằng chứng được ghi nhận
                    </strong>
                    <small>
                      Kiểm tra {verificationDate(selected.verificationDate)} · Xem được từng phạm vi
                    </small>
                  </div>
                </div>
                <div className="clinic-map-trust__signals">
                  {trustSignals.map((signal) => (
                    <span className={signal.verified ? '' : 'is-pending'} key={signal.key}>
                      <Icon name={signal.verified ? 'check' : 'clock'} /> {signal.label}
                    </span>
                  ))}
                </div>
              </section>

              <footer className="clinic-map-sheet__footer">
                <div className="clinic-map-facts">
                  <span>
                    <Icon name="location" />
                    <strong>
                      {distance === null
                        ? selected.locationLabel
                        : `${distance < 1 ? distance.toFixed(1) : distance.toFixed(0)} km đường thẳng`}
                    </strong>
                  </span>
                  <span>
                    <Icon name="calendar" />
                    <strong>
                      {selected.earliestConsultation
                        ? formatDateTime(selected.earliestConsultation)
                        : 'Liên hệ để kiểm tra lịch'}
                    </strong>
                  </span>
                  {selected.estimatedPrice ? (
                    <span>
                      <Icon name="document" />
                      <strong>
                        Từ{' '}
                        {formatMoney(
                          selected.estimatedPrice.minimumMinor,
                          selected.estimatedPrice.currency,
                        )}
                      </strong>
                    </span>
                  ) : null}
                </div>
                <div className="clinic-map-actions">
                  <Link className="secondary-button" href={`/discover/${selected.slug}`}>
                    Xem chi tiết
                  </Link>
                  <Link className="primary-button" href={`/start?clinic=${selected.slug}`}>
                    Nhờ tư vấn <Icon name="arrow" />
                  </Link>
                </div>
              </footer>
            </article>
          )
        ) : (
          <article
            className={`clinic-map-sheet clinic-map-sheet--location${
              sheetState === 'collapsed' ? ' is-collapsed' : ''
            }`}
            aria-live="polite"
            data-sheet-state={sheetState === 'hidden' ? 'collapsed' : sheetState}
          >
            <div className="clinic-map-sheet__controls">
              <button
                aria-expanded={sheetState === 'expanded'}
                aria-label={
                  sheetState === 'expanded' ? 'Thu gọn thông tin vị trí' : 'Mở thông tin vị trí'
                }
                className="clinic-map-sheet__handle"
                onClick={toggleSheet}
                onPointerCancel={cancelSheetDrag}
                onPointerDown={startSheetDrag}
                onPointerUp={finishSheetDrag}
                type="button"
              >
                <span aria-hidden="true" />
                <small>{sheetState === 'expanded' ? 'Thu gọn' : 'Mở thông tin'}</small>
              </button>
            </div>
            <header className="clinic-map-sheet__header">
              <div>
                <p className="eyebrow">
                  <Icon name="location" /> Vị trí hiện tại
                </p>
                <h1>
                  {locating
                    ? 'Đang xác định vị trí…'
                    : userCoordinates
                      ? 'Bạn đang ở đây'
                      : 'Bật vị trí để xem khu vực quanh bạn'}
                </h1>
                <p>Bản đồ luôn sẵn sàng, kể cả khi chưa có nha khoa trong khu vực.</p>
              </div>
            </header>
            <section className="clinic-map-user-summary" aria-label="Tọa độ hiện tại">
              <span>
                <Icon name="location" />
              </span>
              <div>
                <small>Tọa độ của bạn</small>
                <strong>
                  {userCoordinates
                    ? `${userCoordinates.latitude.toFixed(5)}, ${userCoordinates.longitude.toFixed(5)}`
                    : locating
                      ? 'Đang xác định…'
                      : 'Chưa có quyền truy cập vị trí'}
                </strong>
              </div>
            </section>
            <footer className="clinic-map-sheet__footer">
              <p>Các nha khoa có địa chỉ được xác minh sẽ xuất hiện quanh vị trí này.</p>
              <button
                className="primary-button"
                disabled={locating}
                onClick={locateUser}
                type="button"
              >
                {locating ? 'Đang định vị…' : 'Cập nhật vị trí'} <Icon name="location" />
              </button>
            </footer>
          </article>
        )}
      </section>
    </main>
  );
}

function verificationDate(value: string | null): string {
  if (!value) return 'chưa có ngày công bố';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' }).format(new Date(value));
}
