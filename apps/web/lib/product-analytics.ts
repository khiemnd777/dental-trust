'use client';

export type ProductEventName =
  | 'today_viewed'
  | 'journey_action_opened'
  | 'case_hub_viewed'
  | 'mobile_more_opened'
  | 'notification_action_opened';

export function trackProductEvent(name: ProductEventName, properties: Record<string, string> = {}) {
  const body = JSON.stringify({ name, properties });
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(
      '/api/telemetry/product-event',
      new Blob([body], { type: 'application/json' }),
    );
    return;
  }
  void fetch('/api/telemetry/product-event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  });
}
