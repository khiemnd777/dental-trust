'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Icon, type IconName } from '@/components/icon';
import { careMutation, careMutationErrorMessage } from '@/lib/client-mutation';
import styles from './care-flows.module.css';

const needs = [
  { code: 'DENTAL_IMPLANT', label: 'Mất răng / Implant', icon: 'implant' },
  { code: 'CROWN', label: 'Răng sứ', icon: 'crown' },
  { code: 'ORTHODONTICS', label: 'Niềng răng', icon: 'braces' },
  { code: 'VENEER', label: 'Cải thiện nụ cười', icon: 'smile' },
  { code: 'GENERAL_CONSULTATION', label: 'Tôi chưa chắc', icon: 'help' },
] as const satisfies readonly { code: string; label: string; icon: IconName }[];

const timingOptions = [
  ['FLEXIBLE', 'Tôi linh hoạt', 'Chưa có ngày cụ thể'],
  ['ONE_MONTH', 'Trong khoảng 1 tháng', 'Muốn bắt đầu sớm'],
  ['THREE_MONTHS', 'Trong 1–3 tháng', 'Đang lên kế hoạch'],
] as const;

const priorityOptions = [
  ['TRUST', 'Độ tin cậy', 'Xác minh, kinh nghiệm và quy trình rõ ràng', 'shield'],
  ['COST', 'Chi phí phù hợp', 'Hiểu rõ khoảng giá và các khoản có thể phát sinh', 'document'],
  ['TIME', 'Thời gian thuận tiện', 'Lịch điều trị phù hợp với kế hoạch của tôi', 'clock'],
  ['AFTERCARE', 'Hỗ trợ sau điều trị', 'Có người theo dõi khi tôi đã về nhà', 'support'],
] as const;

export function StartRequest({
  initialLocation,
  preferredClinic,
}: {
  readonly initialLocation: string;
  readonly preferredClinic: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  } | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const initialNeed = needs.some((item) => item.code === searchParams.get('procedure'))
    ? (searchParams.get('procedure') ?? '')
    : '';
  const initialTiming = timingOptions.some(([value]) => value === searchParams.get('timing'))
    ? (searchParams.get('timing') ?? 'FLEXIBLE')
    : 'FLEXIBLE';
  const initialPriority = priorityOptions.some(([value]) => value === searchParams.get('priority'))
    ? (searchParams.get('priority') ?? 'TRUST')
    : 'TRUST';
  const [need, setNeed] = useState(initialNeed);
  const [location, setLocation] = useState(
    searchParams.get('location')?.slice(0, 120) || initialLocation,
  );
  const [timing, setTiming] = useState(initialTiming);
  const [priority, setPriority] = useState(initialPriority);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function next() {
    if (step === 1 && !need) {
      setError('Chọn điều bạn đang quan tâm để tiếp tục.');
      return;
    }
    if (step === 2 && location.trim().length < 2) {
      setError('Nhập thành phố hoặc khu vực có ít nhất 2 ký tự.');
      return;
    }
    setError('');
    setStep((current) => Math.min(4, current + 1));
  }

  function submit() {
    if (!need || location.trim().length < 2) {
      setError('Kiểm tra lại nhu cầu và khu vực trước khi tạo yêu cầu.');
      return;
    }
    startTransition(async () => {
      const label = needs.find((item) => item.code === need)?.label ?? 'Yêu cầu chăm sóc nha khoa';
      const result = await careMutation<Record<string, unknown>>('/api/care/cases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: `${label}${preferredClinic ? ` · ${preferredClinic.name}` : ''}`,
          desiredProcedureCode: need,
          preferredLocation: location.trim(),
          preferredCurrency: 'VND',
          timingPreference: timing,
          decisionPriority: priority,
          ...(preferredClinic ? { preferredClinicId: preferredClinic.id } : {}),
        }),
      });
      if (!result.ok) {
        setError(
          careMutationErrorMessage(
            result.error,
            'Chưa thể tạo yêu cầu. Vui lòng thử lại hoặc nhắn điều phối viên.',
          ),
        );
        return;
      }
      router.push('/journey?created=1');
      router.refresh();
    });
  }

  return (
    <main className={`${styles.requestFlow} request-flow`}>
      <header className="request-flow__header">
        <Link aria-label="Đóng" href={preferredClinic ? `/discover/${preferredClinic.slug}` : '/'}>
          <Icon name="close" />
        </Link>
        <div className="request-progress" aria-label={`Bước ${step} trên 4`}>
          {[1, 2, 3, 4].map((item) => (
            <span className={item <= step ? 'is-active' : ''} key={item} />
          ))}
        </div>
        <span>{step}/4</span>
      </header>

      <section className="request-flow__content">
        {step === 1 ? (
          <div className="request-step">
            <span className="request-step__icon">
              <Icon name="sparkle" />
            </span>
            <p className="eyebrow">Bắt đầu thật đơn giản</p>
            <h1>Điều gì khiến bạn tìm đến nha khoa?</h1>
            <p>Không cần biết thuật ngữ chính xác. Chọn điều gần nhất với nhu cầu của bạn.</p>
            <div className="request-options request-options--visual">
              {needs.map((item) => (
                <button
                  aria-pressed={need === item.code}
                  key={item.code}
                  onClick={() => setNeed(item.code)}
                  type="button"
                >
                  <span>
                    <Icon name={item.icon} />
                  </span>
                  <strong>{item.label}</strong>
                  <i>{need === item.code ? <Icon name="check" /> : null}</i>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="request-step">
            <span className="request-step__icon request-step__icon--blue">
              <Icon name="location" />
            </span>
            <p className="eyebrow">Khu vực thuận tiện</p>
            <h1>Bạn muốn được chăm sóc ở đâu?</h1>
            <p>Điều phối viên có thể gợi ý khu vực khác nếu phù hợp hơn.</p>
            <label className="field-card">
              <Icon name="location" />
              <span>
                <small>Thành phố / khu vực</small>
                <input
                  aria-invalid={Boolean(error) && location.trim().length < 2}
                  maxLength={120}
                  onChange={(event) => setLocation(event.target.value)}
                  required
                  value={location}
                />
              </span>
            </label>
            <div className="request-options">
              {timingOptions.map(([value, label, description]) => (
                <button
                  aria-pressed={timing === value}
                  key={value}
                  onClick={() => setTiming(value)}
                  type="button"
                >
                  <Icon name="calendar" />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <i>{timing === value ? <Icon name="check" /> : null}</i>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="request-step">
            <span className="request-step__icon request-step__icon--amber">
              <Icon name="shield" />
            </span>
            <p className="eyebrow">Ưu tiên của riêng bạn</p>
            <h1>Điều gì quan trọng nhất?</h1>
            <p>Không có câu trả lời đúng. Điều này giúp chúng tôi xếp lựa chọn phù hợp hơn.</p>
            <div className="request-options">
              {priorityOptions.map(([value, label, description, icon]) => (
                <button
                  aria-pressed={priority === value}
                  key={value}
                  onClick={() => setPriority(value)}
                  type="button"
                >
                  <Icon name={icon} />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <i>{priority === value ? <Icon name="check" /> : null}</i>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="request-step request-review">
            <span className="request-step__icon request-step__icon--success">
              <Icon name="check" />
            </span>
            <p className="eyebrow">Sẵn sàng</p>
            <h1>Chúng tôi sẽ giúp bạn từ đây</h1>
            <p>Tạo yêu cầu không ràng buộc đặt lịch hay thanh toán.</p>
            <div className="review-card">
              <span>
                <small>Nhu cầu</small>
                <strong>{needs.find((item) => item.code === need)?.label}</strong>
              </span>
              <span>
                <small>Khu vực</small>
                <strong>{location}</strong>
              </span>
              <span>
                <small>Thời gian</small>
                <strong>
                  {timingOptions.find(([value]) => value === timing)?.[1] ?? 'Linh hoạt'}
                </strong>
              </span>
              <span>
                <small>Ưu tiên</small>
                <strong>
                  {priorityOptions.find(([value]) => value === priority)?.[1] ?? 'Độ tin cậy'}
                </strong>
              </span>
              {preferredClinic ? (
                <span>
                  <small>Phòng khám quan tâm</small>
                  <strong>{preferredClinic.name}</strong>
                </span>
              ) : null}
            </div>
            <div className="privacy-note">
              <Icon name="lock" />
              <p>
                Chỉ đội ngũ được phân quyền mới xem được hồ sơ. Chúng tôi sẽ xin phép trước khi chia
                sẻ với phòng khám.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <p aria-live="polite" className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <footer className="request-flow__footer">
        {step > 1 ? (
          <button
            className="text-button"
            onClick={() => setStep((current) => current - 1)}
            type="button"
          >
            Quay lại
          </button>
        ) : (
          <span />
        )}
        <button
          className="primary-button"
          disabled={isPending}
          onClick={step === 4 ? submit : next}
          type="button"
        >
          {isPending ? 'Đang tạo…' : step === 4 ? 'Tạo yêu cầu' : 'Tiếp tục'}
          {!isPending ? <Icon name="arrow" /> : null}
        </button>
      </footer>
    </main>
  );
}
