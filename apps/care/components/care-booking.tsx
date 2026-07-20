'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';

import { CustomSelect } from '@dental-trust/ui';
import { Icon } from '@/components/icon';
import type { BookingCheckoutOption } from '@/lib/care-data';
import { careMutation, careMutationErrorMessage } from '@/lib/client-mutation';
import styles from './care-flows.module.css';

export function CareBooking({ options }: { readonly options: readonly BookingCheckoutOption[] }) {
  const [selected, setSelected] = useState(options[0]?.treatmentPlanAcceptanceId ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const option = options.find((item) => item.treatmentPlanAcceptanceId === selected);

  function preparePayment() {
    if (!option || !confirmed || isPending) return;
    setError('');
    startTransition(async () => {
      const result = await careMutation<{
        readonly depositIntent?: { readonly clientSecret?: string | null };
      }>('/api/care/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          treatmentPlanAcceptanceId: option.treatmentPlanAcceptanceId,
          expectedDepositBasisPoints: option.depositBasisPoints,
          expectedCancellationPolicyVersion: option.cancellationPolicy.policyVersion,
        }),
      });
      if (!result.ok) {
        setError(
          careMutationErrorMessage(
            result.error,
            'Chưa thể chuẩn bị thanh toán. Dữ liệu chưa được gửi lại; vui lòng thử lần nữa.',
          ),
        );
        return;
      }
      const secret = result.data.depositIntent?.clientSecret ?? null;
      setClientSecret(secret);
      if (!secret) {
        setSettled(true);
        setNotice(
          'Lịch hẹn đã được tạo trong môi trường thử nghiệm. Không có khoản tiền thật nào bị thu.',
        );
      }
    });
  }

  return (
    <main className={`${styles.bookingFlow} care-main booking-page`}>
      <header className="page-intro booking-intro">
        <div>
          <p className="eyebrow">Đặt lịch an toàn</p>
          <h1>Kiểm tra trước khi xác nhận</h1>
          <p>
            AI không thực hiện bước này. Bạn tự chọn kế hoạch, xem chính sách và xác nhận tiền cọc.
          </p>
        </div>
        <span className="verified-pill">
          <Icon name="shield" /> Tính từ máy chủ
        </span>
      </header>

      {options.length && !settled ? (
        <ol className={styles.bookingSteps} aria-label="Tiến trình đặt lịch">
          <li
            aria-current={!confirmed && !clientSecret ? 'step' : undefined}
            className={confirmed || clientSecret ? styles.isComplete : styles.isCurrent}
          >
            <span>{confirmed || clientSecret ? <Icon name="check" /> : '1'}</span>
            <strong>Kiểm tra</strong>
          </li>
          <li
            aria-current={confirmed && !clientSecret ? 'step' : undefined}
            className={clientSecret ? styles.isComplete : confirmed ? styles.isCurrent : ''}
          >
            <span>{clientSecret ? <Icon name="check" /> : '2'}</span>
            <strong>Xác nhận</strong>
          </li>
          <li
            aria-current={clientSecret ? 'step' : undefined}
            className={clientSecret ? styles.isCurrent : ''}
          >
            <span>3</span>
            <strong>Thanh toán</strong>
          </li>
        </ol>
      ) : null}

      {options.length === 0 ? (
        <section className="empty-journey-card booking-empty">
          <div className="empty-journey-card__art">
            <Icon name="calendar" />
          </div>
          <h2>Chưa có kế hoạch sẵn sàng để đặt lịch</h2>
          <p>Bạn cần chấp nhận một phiên bản kế hoạch điều trị trước khi chọn lịch và đặt cọc.</p>
          <Link className="primary-button" href="/journey">
            Xem hành trình <Icon name="arrow" />
          </Link>
        </section>
      ) : settled ? (
        <section className={styles.bookingComplete} role="status">
          <span>
            <Icon name="check" />
          </span>
          <p className="eyebrow">Đã ghi nhận</p>
          <h2>Bước đặt lịch đã hoàn tất</h2>
          <p>{notice}</p>
          <Link className="primary-button" href="/journey">
            Xem hành trình <Icon name="arrow" />
          </Link>
        </section>
      ) : clientSecret ? (
        <StripePayment
          clientSecret={clientSecret}
          onSettled={() => {
            setClientSecret(null);
            setSettled(true);
            setNotice(
              'Thanh toán đã được gửi xử lý. Trạng thái lịch hẹn sẽ cập nhật trong hành trình.',
            );
          }}
        />
      ) : (
        <section className="booking-checkout">
          {options.length > 1 ? (
            <div className="booking-select">
              <span id="accepted-plan-label">Kế hoạch đã chấp nhận</span>
              <CustomSelect
                aria-labelledby="accepted-plan-label"
                menuLabel="Kế hoạch đã chấp nhận"
                onChange={(event) => setSelected(event.target.value)}
                value={selected}
              >
                {options.map((item) => (
                  <option
                    key={item.treatmentPlanAcceptanceId}
                    value={item.treatmentPlanAcceptanceId}
                  >
                    {item.caseNumber} · {item.clinicName}
                  </option>
                ))}
              </CustomSelect>
            </div>
          ) : null}
          {option ? <BookingSummary option={option} /> : null}
          <label className="booking-confirmation">
            <input
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>
              Tôi đã kiểm tra đúng kế hoạch, số tiền cọc và chính sách hủy. Tôi đồng ý tự thực hiện
              bước thanh toán tiếp theo.
            </span>
          </label>
          <button
            className="primary-button primary-button--wide"
            disabled={!confirmed || isPending}
            onClick={preparePayment}
            type="button"
          >
            {isPending ? 'Đang chuẩn bị…' : 'Xác nhận và sang bước thanh toán'}
            {!isPending ? <Icon name="arrow" /> : null}
          </button>
        </section>
      )}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="booking-help">
        <Icon name="lock" /> Dental Trust không lưu thông tin thẻ. Cần hỗ trợ?{' '}
        <Link href="/messages">Nhắn điều phối viên</Link>.
      </p>
    </main>
  );
}

function BookingSummary({ option }: { readonly option: BookingCheckoutOption }) {
  return (
    <article className="booking-summary">
      <div className="booking-summary__head">
        <div>
          <p className="eyebrow">
            {option.caseNumber} · Kế hoạch v{option.treatmentPlanVersion}
          </p>
          <h2>{option.clinicName}</h2>
        </div>
        <span>{option.currency}</span>
      </div>
      <dl>
        <div>
          <dt>Tổng kế hoạch</dt>
          <dd>{money(option.planTotalMinor, option.currency)}</dd>
        </div>
        <div>
          <dt>Tiền cọc hôm nay</dt>
          <dd>
            {money(option.depositMinor, option.currency)}{' '}
            <small>({option.depositBasisPoints / 100}%)</small>
          </dd>
        </div>
        <div>
          <dt>Hiệu lực đến</dt>
          <dd>{dateTime(option.expiresAt)}</dd>
        </div>
      </dl>
      <div className="booking-policy">
        <Icon name="document" />
        <div>
          <strong>Chính sách hủy</strong>
          <p>{option.cancellationPolicy.display['vi-VN']}</p>
        </div>
      </div>
      <small>Số tiền và phiên bản chính sách được tính lại trên máy chủ khi bạn xác nhận.</small>
    </article>
  );
}

function StripePayment({
  clientSecret,
  onSettled,
}: {
  readonly clientSecret: string;
  readonly onSettled: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const integration = useRef<{ stripe: StripeLike; elements: StripeElementsLike } | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  useEffect(() => {
    if (!publishableKey || !container.current) return;
    let active = true;
    let element: StripePaymentElementLike | null = null;
    void loadStripeJs()
      .then((factory) => {
        if (!active || !container.current) return;
        const stripe = factory(publishableKey);
        const elements = stripe.elements({ clientSecret });
        element = elements.create('payment');
        element.mount(container.current);
        integration.current = { stripe, elements };
        setReady(true);
      })
      .catch(() => setError('Không thể tải cổng thanh toán an toàn.'));
    return () => {
      active = false;
      element?.unmount();
      integration.current = null;
    };
  }, [clientSecret, publishableKey]);

  if (!publishableKey)
    return (
      <p className="form-error">Thiếu cấu hình Stripe publishable key cho giao diện thanh toán.</p>
    );
  return (
    <section className="stripe-payment">
      <p className="eyebrow">Stripe Payment Element</p>
      <h2>Thanh toán tiền cọc</h2>
      <p>Thông tin thanh toán được gửi trực tiếp đến Stripe.</p>
      <div className="stripe-payment__element" ref={container} />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="primary-button primary-button--wide"
        disabled={!ready || submitting}
        onClick={() => {
          const current = integration.current;
          if (!current) return;
          setSubmitting(true);
          setError('');
          void current.stripe
            .confirmPayment({
              elements: current.elements,
              confirmParams: { return_url: window.location.href },
              redirect: 'if_required',
            })
            .then((result) =>
              result.error
                ? setError(result.error.message ?? 'Thanh toán chưa thành công.')
                : onSettled(),
            )
            .catch(() => setError('Thanh toán chưa thành công.'))
            .finally(() => setSubmitting(false));
        }}
        type="button"
      >
        {submitting ? 'Đang xử lý…' : 'Thanh toán tiền cọc'}
      </button>
    </section>
  );
}

function money(value: string, currency: 'VND' | 'USD') {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency }).format(
    Number(value) / (currency === 'USD' ? 100 : 1),
  );
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
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

type StripeFactory = (key: string) => StripeLike;
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
