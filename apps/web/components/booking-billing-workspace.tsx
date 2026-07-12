'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import type { BookingCheckoutOptionView, BookingView } from '@dental-trust/contracts';
import type { Locale, Messages } from '@dental-trust/i18n';
import { Alert, Badge, Button, Card, EmptyState, Skeleton, TextAreaField } from '@dental-trust/ui';

import type { PortalArea } from '@/lib/routing';

const supported = new Set(['patient:checkout', 'patient:payments', 'clinic:billing']);

export function isBookingBillingWorkspace(area: PortalArea, pageKey: string): boolean {
  return supported.has(`${area}:${pageKey}`);
}

export function BookingBillingWorkspace({
  area,
  pageKey,
  title,
  description,
  locale,
}: {
  readonly area: PortalArea;
  readonly pageKey: string;
  readonly title: string;
  readonly description: string;
  readonly locale: Locale;
  readonly messages: Messages;
  readonly development: boolean;
}) {
  const copy = text(locale);
  const [data, setData] = useState<readonly BookingCheckoutOptionView[] | readonly BookingView[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const keys = useRef(new Map<string, string>());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetch(`/api/portal/data?area=${area}&pageKey=${pageKey}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        const envelope = (await response.json()) as {
          data?: readonly BookingCheckoutOptionView[] | readonly BookingView[];
        };
        if (!Array.isArray(envelope.data)) throw new Error('invalid');
        setData(envelope.data);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(copy.error);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [area, copy.error, pageKey, revision]);

  const run = async (
    command: 'booking_checkout' | 'booking_cancel' | 'booking_complete' | 'payment_recover',
    caseId: string,
    payload: Record<string, unknown>,
  ) => {
    const operation = `${command}:${JSON.stringify(payload)}`;
    const idempotencyKey = keys.current.get(operation) ?? crypto.randomUUID();
    keys.current.set(operation, idempotencyKey);
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/portal/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ area, pageKey, command, entityId: caseId, payload, idempotencyKey }),
      });
      const envelope = (await response.json()) as {
        data?: { depositIntent?: { clientSecret?: string | null; status?: string } };
        error?: { message?: string } | string;
      };
      if (!response.ok) {
        const message =
          typeof envelope.error === 'object' ? envelope.error.message : copy.commandFailed;
        throw new Error(message || copy.commandFailed);
      }
      keys.current.delete(operation);
      setClientSecret(envelope.data?.depositIntent?.clientSecret ?? null);
      setNotice(
        command === 'booking_checkout' || command === 'payment_recover'
          ? envelope.data?.depositIntent?.clientSecret
            ? copy.paymentReady
            : copy.testPaymentReady
          : copy.saved,
      );
      if (!['booking_checkout', 'payment_recover'].includes(command))
        setRevision((value) => value + 1);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.commandFailed);
      return false;
    } finally {
      setSending(false);
    }
  };

  let content: ReactNode;
  if (loading) content = <Loading />;
  else if (clientSecret)
    content = (
      <StripePaymentStep
        clientSecret={clientSecret}
        copy={copy}
        onSettled={() => {
          setNotice(copy.paymentSubmitted);
          setClientSecret(null);
          setRevision((value) => value + 1);
        }}
      />
    );
  else if (pageKey === 'checkout')
    content = (
      <CheckoutOptions
        clientSecret={clientSecret}
        copy={copy}
        locale={locale}
        onPaymentSettled={() => {
          setNotice(copy.paymentSubmitted);
          setRevision((value) => value + 1);
        }}
        options={data as readonly BookingCheckoutOptionView[]}
        run={run}
        sending={sending}
      />
    );
  else
    content = (
      <BookingHistory
        area={area}
        bookings={data as readonly BookingView[]}
        copy={copy}
        locale={locale}
        run={run}
        sending={sending}
      />
    );

  return (
    <main className="portal-content" id="main-content">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">{copy.secureBilling}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <Badge tone="verified">{copy.serverCalculated}</Badge>
      </div>
      <Alert tone="info" title={copy.ledgerTitle}>
        {copy.ledgerBody}
      </Alert>
      {notice ? <Alert tone="success" title={notice} /> : null}
      {error ? (
        <Alert tone="danger" title={copy.error}>
          {error}
        </Alert>
      ) : null}
      <div style={{ marginTop: '1rem' }}>{content}</div>
    </main>
  );
}

function CheckoutOptions({
  options,
  locale,
  copy,
  sending,
  run,
  clientSecret,
  onPaymentSettled,
}: {
  readonly options: readonly BookingCheckoutOptionView[];
  readonly locale: Locale;
  readonly copy: Copy;
  readonly sending: boolean;
  readonly run: (
    command: 'booking_checkout',
    caseId: string,
    payload: Record<string, unknown>,
  ) => Promise<boolean>;
  readonly clientSecret: string | null;
  readonly onPaymentSettled: () => void;
}) {
  if (clientSecret) {
    return (
      <StripePaymentStep clientSecret={clientSecret} copy={copy} onSettled={onPaymentSettled} />
    );
  }
  if (options.length === 0) {
    return <EmptyState icon="wallet" title={copy.noAcceptedPlan} body={copy.noAcceptedPlanBody} />;
  }
  return (
    <div className="workspace-grid">
      {options.map((option) => (
        <Card className="workspace-card" key={option.treatmentPlanAcceptanceId}>
          <div style={{ padding: '1.2rem' }}>
            <div className="workspace-card__head" style={{ padding: 0 }}>
              <div>
                <p className="eyebrow">
                  {option.caseNumber} · v{option.treatmentPlanVersion}
                </p>
                <h2>{option.clinicName}</h2>
              </div>
              <Badge tone="info">{option.currency}</Badge>
            </div>
            <dl className="detail-list">
              <div>
                <dt>{copy.planTotal}</dt>
                <dd>{money(option.planTotalMinor, option.currency, locale)}</dd>
              </div>
              <div>
                <dt>{copy.deposit}</dt>
                <dd>
                  {money(option.depositMinor, option.currency, locale)} (
                  {option.depositBasisPoints / 100}%)
                </dd>
              </div>
              <div>
                <dt>{copy.accepted}</dt>
                <dd>{dateTime(option.acceptedAt, locale)}</dd>
              </div>
              <div>
                <dt>{copy.expires}</dt>
                <dd>{dateTime(option.expiresAt, locale)}</dd>
              </div>
            </dl>
            <Alert tone="warning" title={copy.cancellationPolicy}>
              {option.cancellationPolicy.display[locale === 'vi' ? 'vi-VN' : 'en-US']}
            </Alert>
            <p>
              <small>{copy.snapshotNotice}</small>
            </p>
            <Button
              disabled={sending}
              onClick={() =>
                void run('booking_checkout', option.caseId, {
                  treatmentPlanAcceptanceId: option.treatmentPlanAcceptanceId,
                  expectedDepositBasisPoints: option.depositBasisPoints,
                  expectedCancellationPolicyVersion: option.cancellationPolicy.policyVersion,
                })
              }
            >
              {sending ? copy.preparing : copy.confirmAndPay}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function BookingHistory({
  area,
  bookings,
  locale,
  copy,
  sending,
  run,
}: {
  readonly area: PortalArea;
  readonly bookings: readonly BookingView[];
  readonly locale: Locale;
  readonly copy: Copy;
  readonly sending: boolean;
  readonly run: (
    command: 'booking_cancel' | 'booking_complete' | 'payment_recover',
    caseId: string,
    payload: Record<string, unknown>,
  ) => Promise<boolean>;
}) {
  if (bookings.length === 0)
    return <EmptyState icon="wallet" title={copy.noBookings} body={copy.noBookingsBody} />;
  return (
    <div className="workspace-grid">
      {bookings.map((booking) => (
        <Card className="workspace-card" key={booking.id}>
          <div style={{ padding: '1.2rem' }}>
            <div className="workspace-card__head" style={{ padding: 0 }}>
              <div>
                <p className="eyebrow">
                  {booking.caseNumber} · v{booking.treatmentPlanVersion}
                </p>
                <h2>{booking.clinicName}</h2>
              </div>
              <Badge tone={statusTone(booking.status)}>{statusLabel(booking.status, locale)}</Badge>
            </div>
            <dl className="detail-list">
              <div>
                <dt>{copy.deposit}</dt>
                <dd>{money(booking.depositMinor, booking.currency, locale)}</dd>
              </div>
              <div>
                <dt>{copy.invoice}</dt>
                <dd>
                  {booking.invoice.invoiceNumber} · {statusLabel(booking.invoice.status, locale)}
                </dd>
              </div>
              <div>
                <dt>{copy.refunded}</dt>
                <dd>{money(booking.invoice.refundedMinor, booking.currency, locale)}</dd>
              </div>
              <div>
                <dt>{copy.receipt}</dt>
                <dd>{booking.receipt?.receiptNumber ?? copy.pending}</dd>
              </div>
              <div>
                <dt>{copy.payment}</dt>
                <dd>
                  {booking.payment
                    ? `${booking.payment.provider} · ${statusLabel(booking.payment.status, locale)}`
                    : copy.pending}
                </dd>
              </div>
            </dl>
            <Alert tone="info" title={copy.cancellationPolicy}>
              {booking.cancellationPolicy.display[locale === 'vi' ? 'vi-VN' : 'en-US']}
            </Alert>
            {booking.payment?.refunds.length ? (
              <div>
                <h3>{copy.refunds}</h3>
                {booking.payment.refunds.map((refund) => (
                  <p key={refund.id}>
                    {money(refund.amountMinor, booking.currency, locale)} ·{' '}
                    {statusLabel(refund.status, locale)} · {refund.reason}
                  </p>
                ))}
              </div>
            ) : null}
            {area === 'patient' && booking.payment?.status === 'FAILED' ? (
              <Button
                disabled={sending}
                onClick={() =>
                  void run('payment_recover', booking.caseId, {
                    bookingId: booking.id,
                    expectedPaymentVersion: booking.payment?.version ?? 0,
                  })
                }
                variant="secondary"
              >
                {copy.retryPayment}
              </Button>
            ) : null}
            {(area === 'clinic' || booking.status === 'PENDING_DEPOSIT') &&
            !['CANCELLED', 'COMPLETED'].includes(booking.status) ? (
              <form
                className="auth-form"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  if (!event.currentTarget.reportValidity()) return;
                  const form = new FormData(event.currentTarget);
                  void run('booking_cancel', booking.caseId, {
                    bookingId: booking.id,
                    expectedVersion: booking.version,
                    reason: String(form.get('reason') ?? ''),
                  });
                }}
              >
                <TextAreaField
                  label={copy.cancellationReason}
                  minLength={10}
                  name="reason"
                  required
                />
                <Button disabled={sending} type="submit" variant="danger">
                  {copy.cancelBooking}
                </Button>
              </form>
            ) : null}
            {area === 'clinic' && booking.status === 'CONFIRMED' ? (
              <Button
                disabled={sending}
                onClick={() =>
                  void run('booking_complete', booking.caseId, {
                    bookingId: booking.id,
                    expectedVersion: booking.version,
                  })
                }
                variant="secondary"
              >
                {copy.completeBooking}
              </Button>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
}

function StripePaymentStep({
  clientSecret,
  copy,
  onSettled,
}: {
  readonly clientSecret: string;
  readonly copy: Copy;
  readonly onSettled: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const integration = useRef<{ stripe: StripeLike; elements: StripeElementsLike } | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  useEffect(() => {
    if (!publishableKey || !container.current) return;
    let active = true;
    let paymentElement: StripePaymentElementLike | null = null;
    void loadStripeJs()
      .then((factory) => {
        if (!active || !container.current) return;
        const stripe = factory(publishableKey);
        const elements = stripe.elements({ clientSecret });
        paymentElement = elements.create('payment');
        paymentElement.mount(container.current);
        integration.current = { stripe, elements };
        setReady(true);
      })
      .catch(() => setError(copy.paymentUnavailable));
    return () => {
      active = false;
      paymentElement?.unmount();
      integration.current = null;
    };
  }, [clientSecret, copy.paymentUnavailable, publishableKey]);

  if (!publishableKey) {
    return (
      <Alert tone="danger" title={copy.paymentUnavailable}>
        {copy.paymentConfigurationMissing}
      </Alert>
    );
  }
  return (
    <Card className="workspace-card">
      <div style={{ padding: '1.2rem' }}>
        <h2>{copy.securePayment}</h2>
        <p>{copy.cardSafety}</p>
        <div ref={container} />
        {error ? (
          <Alert tone="danger" title={copy.error}>
            {error}
          </Alert>
        ) : null}
        <Button
          disabled={!ready || submitting}
          onClick={() => {
            const current = integration.current;
            if (!current) return;
            setSubmitting(true);
            setError(null);
            void current.stripe
              .confirmPayment({
                elements: current.elements,
                confirmParams: { return_url: window.location.href },
                redirect: 'if_required',
              })
              .then((result) => {
                if (result.error) setError(result.error.message ?? copy.paymentFailed);
                else onSettled();
              })
              .catch(() => setError(copy.paymentFailed))
              .finally(() => setSubmitting(false));
          }}
        >
          {submitting ? copy.processing : copy.submitPayment}
        </Button>
      </div>
    </Card>
  );
}

function Loading() {
  return (
    <div className="workspace-grid">
      {[0, 1].map((item) => (
        <Card className="workspace-card" key={item}>
          <div style={{ padding: '1.2rem' }}>
            <Skeleton style={{ height: '2rem' }} />
            <Skeleton style={{ height: '8rem', marginTop: '1rem' }} />
          </div>
        </Card>
      ))}
    </div>
  );
}

function money(amountMinor: string, currency: 'VND' | 'USD', locale: Locale): string {
  const amount = Number(amountMinor) / (currency === 'USD' ? 100 : 1);
  return new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'USD' ? 2 : 0,
  }).format(amount);
}

function dateTime(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusTone(status: string): 'verified' | 'attention' | 'danger' | 'info' {
  if (['CONFIRMED', 'COMPLETED', 'SUCCEEDED', 'PAID', 'ISSUED'].includes(status)) return 'verified';
  if (['CANCELLED', 'FAILED', 'VOID', 'REFUNDED'].includes(status)) return 'danger';
  if (['PROCESSING', 'PARTIALLY_REFUNDED', 'UNDER_REVIEW'].includes(status)) return 'attention';
  return 'info';
}

function statusLabel(status: string, locale: Locale): string {
  const labels: Record<string, readonly [string, string]> = {
    PENDING_DEPOSIT: ['Chờ đặt cọc', 'Pending deposit'],
    CONFIRMED: ['Đã xác nhận', 'Confirmed'],
    CANCELLED: ['Đã hủy', 'Cancelled'],
    COMPLETED: ['Hoàn tất', 'Completed'],
    ISSUED: ['Đã phát hành', 'Issued'],
    PAID: ['Đã thanh toán', 'Paid'],
    PARTIALLY_REFUNDED: ['Hoàn một phần', 'Partially refunded'],
    REFUNDED: ['Đã hoàn tiền', 'Refunded'],
    VOID: ['Đã hủy chứng từ', 'Void'],
    PROCESSING: ['Đang xử lý', 'Processing'],
    SUCCEEDED: ['Thành công', 'Succeeded'],
    FAILED: ['Thất bại', 'Failed'],
    REQUIRES_ACTION: ['Cần thao tác', 'Action required'],
    REQUESTED: ['Đã yêu cầu', 'Requested'],
    UNDER_REVIEW: ['Đang xem xét', 'Under review'],
    REJECTED: ['Bị từ chối', 'Rejected'],
  };
  return labels[status]?.[locale === 'vi' ? 0 : 1] ?? status.replaceAll('_', ' ');
}

let stripeScript: Promise<StripeFactory> | undefined;

function loadStripeJs(): Promise<StripeFactory> {
  if (window.Stripe) return Promise.resolve(window.Stripe);
  stripeScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.referrerPolicy = 'origin';
    script.onload = () => (window.Stripe ? resolve(window.Stripe) : reject(new Error('stripe')));
    script.onerror = () => reject(new Error('stripe'));
    document.head.append(script);
  });
  return stripeScript;
}

type StripeFactory = (publishableKey: string) => StripeLike;
interface StripeLike {
  elements(options: { readonly clientSecret: string }): StripeElementsLike;
  confirmPayment(options: {
    readonly elements: StripeElementsLike;
    readonly confirmParams: { readonly return_url: string };
    readonly redirect: 'if_required';
  }): Promise<{ readonly error?: { readonly message?: string } }>;
}
interface StripeElementsLike {
  create(type: 'payment'): StripePaymentElementLike;
}
interface StripePaymentElementLike {
  mount(element: HTMLElement): void;
  unmount(): void;
}

declare global {
  interface Window {
    Stripe?: StripeFactory;
  }
}

interface Copy {
  readonly secureBilling: string;
  readonly serverCalculated: string;
  readonly ledgerTitle: string;
  readonly ledgerBody: string;
  readonly error: string;
  readonly commandFailed: string;
  readonly saved: string;
  readonly paymentReady: string;
  readonly testPaymentReady: string;
  readonly paymentSubmitted: string;
  readonly noAcceptedPlan: string;
  readonly noAcceptedPlanBody: string;
  readonly noBookings: string;
  readonly noBookingsBody: string;
  readonly planTotal: string;
  readonly deposit: string;
  readonly accepted: string;
  readonly expires: string;
  readonly cancellationPolicy: string;
  readonly snapshotNotice: string;
  readonly preparing: string;
  readonly confirmAndPay: string;
  readonly invoice: string;
  readonly receipt: string;
  readonly refunded: string;
  readonly payment: string;
  readonly pending: string;
  readonly refunds: string;
  readonly cancellationReason: string;
  readonly cancelBooking: string;
  readonly completeBooking: string;
  readonly paymentUnavailable: string;
  readonly paymentConfigurationMissing: string;
  readonly securePayment: string;
  readonly cardSafety: string;
  readonly paymentFailed: string;
  readonly processing: string;
  readonly submitPayment: string;
  readonly retryPayment: string;
}

function text(locale: Locale): Copy {
  return locale === 'vi'
    ? {
        secureBilling: 'Thanh toán và chứng từ bảo mật',
        serverCalculated: 'Máy chủ xác định',
        ledgerTitle: 'Sổ cái thanh toán là nguồn dữ liệu gốc',
        ledgerBody:
          'Khoản đặt cọc, hóa đơn, biên nhận và hoàn tiền được đối soát từ bằng chứng của nhà cung cấp. DENTAL TRUST không lưu số thẻ.',
        error: 'Không thể hoàn tất',
        commandFailed: 'Yêu cầu không thành công. Vui lòng tải lại trước khi thử lại.',
        saved: 'Đã cập nhật.',
        paymentReady: 'Bước thanh toán bảo mật đã sẵn sàng.',
        testPaymentReady: 'Giao dịch thử nghiệm đã được khởi tạo.',
        paymentSubmitted: 'Thanh toán đã gửi; trạng thái sẽ cập nhật sau webhook.',
        noAcceptedPlan: 'Chưa có phương án đã chấp thuận',
        noAcceptedPlanBody:
          'Chấp thuận rõ ràng một phiên bản phương án còn hiệu lực trước khi đặt cọc.',
        noBookings: 'Chưa có giao dịch đặt lịch',
        noBookingsBody: 'Hóa đơn và biên nhận sẽ xuất hiện tại đây.',
        planTotal: 'Tổng phương án',
        deposit: 'Khoản đặt cọc',
        accepted: 'Đã chấp thuận',
        expires: 'Hiệu lực đến',
        cancellationPolicy: 'Chính sách hủy',
        snapshotNotice: 'Giá trị và chính sách này sẽ được lưu bất biến khi xác nhận.',
        preparing: 'Đang chuẩn bị…',
        confirmAndPay: 'Xác nhận và thanh toán',
        invoice: 'Hóa đơn',
        receipt: 'Biên nhận',
        refunded: 'Đã hoàn',
        payment: 'Thanh toán',
        pending: 'Đang chờ',
        refunds: 'Lịch sử hoàn tiền',
        cancellationReason: 'Lý do hủy',
        cancelBooking: 'Hủy đặt lịch',
        completeBooking: 'Đánh dấu hoàn tất',
        paymentUnavailable: 'Thanh toán tạm thời không khả dụng',
        paymentConfigurationMissing:
          'Thiếu cấu hình khóa công khai của nhà cung cấp. Hệ thống đã dừng an toàn và chưa thu tiền.',
        securePayment: 'Thanh toán qua nhà cung cấp bảo mật',
        cardSafety:
          'Thông tin thẻ được nhập trực tiếp trong thành phần bảo mật của Stripe và không đi qua máy chủ DENTAL TRUST.',
        paymentFailed: 'Nhà cung cấp chưa xác nhận thanh toán.',
        processing: 'Đang xử lý…',
        submitPayment: 'Thanh toán khoản đặt cọc',
        retryPayment: 'Thử lại thanh toán',
      }
    : {
        secureBilling: 'Secure billing and documents',
        serverCalculated: 'Server calculated',
        ledgerTitle: 'The payment ledger is the source of truth',
        ledgerBody:
          'Deposits, invoices, receipts, and refunds reconcile from provider evidence. DENTAL TRUST never stores card numbers.',
        error: 'Unable to complete',
        commandFailed: 'The request failed. Refresh before trying again.',
        saved: 'Updated.',
        paymentReady: 'The secure payment step is ready.',
        testPaymentReady: 'The test transaction was initialized.',
        paymentSubmitted: 'Payment submitted; status will update after the signed webhook.',
        noAcceptedPlan: 'No accepted plan available',
        noAcceptedPlanBody:
          'Explicitly accept one current treatment-plan version before paying a deposit.',
        noBookings: 'No booking transactions yet',
        noBookingsBody: 'Invoices and receipts will appear here.',
        planTotal: 'Plan total',
        deposit: 'Deposit',
        accepted: 'Accepted',
        expires: 'Expires',
        cancellationPolicy: 'Cancellation policy',
        snapshotNotice: 'These monetary and policy terms are captured immutably on confirmation.',
        preparing: 'Preparing…',
        confirmAndPay: 'Confirm and pay',
        invoice: 'Invoice',
        receipt: 'Receipt',
        refunded: 'Refunded',
        payment: 'Payment',
        pending: 'Pending',
        refunds: 'Refund history',
        cancellationReason: 'Cancellation reason',
        cancelBooking: 'Cancel booking',
        completeBooking: 'Mark completed',
        paymentUnavailable: 'Payment is temporarily unavailable',
        paymentConfigurationMissing:
          'The provider publishable key is missing. Checkout stopped safely and no charge was attempted.',
        securePayment: 'Pay through the secure provider',
        cardSafety:
          'Card details are entered directly in Stripe’s secure element and never pass through DENTAL TRUST servers.',
        paymentFailed: 'The provider has not confirmed payment.',
        processing: 'Processing…',
        submitPayment: 'Pay deposit',
        retryPayment: 'Retry payment',
      };
}
