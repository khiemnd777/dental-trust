import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/icon';
import { getCareHomeData } from '@/lib/care-data';
import {
  actionFor,
  actionHref,
  dayPeriodGreeting,
  firstName,
  formatDateTime,
  stageLabel,
} from '@/lib/presentation';

export const metadata: Metadata = { title: 'Hôm nay' };

export default async function TodayPage() {
  const { profile, journeys, notifications } = await getCareHomeData();
  const journey = journeys[0] ?? null;
  const action = actionFor(journey?.primaryAction.code ?? 'NONE');
  const greeting = firstName(profile?.identity?.fullName);

  return (
    <main className="care-main today-page">
      <header className="page-intro today-intro">
        <div>
          <p className="eyebrow">
            {dayPeriodGreeting()}, {greeting}
          </p>
          <h1>
            {!journey
              ? 'Bắt đầu khi bạn sẵn sàng'
              : journey.urgency === 'ROUTINE'
                ? 'Mọi thứ đang đúng tiến độ'
                : journey.urgency === 'URGENT'
                  ? 'Có yêu cầu cần được ưu tiên'
                  : 'Có việc cần bạn chú ý'}
          </h1>
        </div>
        <span className="today-intro__weather" aria-label="Phiên Care được bảo vệ">
          <Icon name="shield" /> Bảo mật
        </span>
      </header>

      {journey ? (
        <section className="journey-hero" aria-labelledby="today-journey-title">
          <div className="journey-hero__art" aria-hidden="true">
            <div className="journey-orbit journey-orbit--one" />
            <div className="journey-orbit journey-orbit--two" />
            <div className="journey-tooth">
              <Icon name="sparkle" />
            </div>
          </div>
          <div className="journey-hero__content">
            <div className="status-row">
              <span className={`status-pill status-pill--${journey.urgency.toLowerCase()}`}>
                {journey.urgency === 'ROUTINE'
                  ? 'Đang tiến hành'
                  : journey.urgency === 'URGENT'
                    ? 'Cần hỗ trợ khẩn cấp'
                    : 'Cần chú ý'}
              </span>
              <span>{journey.caseNumber}</span>
            </div>
            <p className="eyebrow">{stageLabel(journey.stage)}</p>
            <h2 id="today-journey-title">{journey.title}</h2>
            <p className="journey-hero__description">
              {journey.expectedAt
                ? `Dự kiến có cập nhật ${formatDateTime(journey.expectedAt)}.`
                : 'Chúng tôi sẽ thông báo ngay khi có cập nhật mới.'}
            </p>
            <div className="progress-meta">
              <span>Tiến độ tổng thể</span>
              <strong>{journey.progress}%</strong>
            </div>
            <div
              aria-label={`Tiến độ ${journey.progress}%`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={journey.progress}
              className="progress-track"
              role="progressbar"
            >
              <span style={{ width: `${journey.progress}%` }} />
            </div>
          </div>
        </section>
      ) : (
        <section className="empty-journey-card">
          <div className="empty-journey-card__art">
            <Icon name="sparkle" />
          </div>
          <p className="eyebrow">Chăm sóc theo cách của bạn</p>
          <h2>Cho chúng tôi biết điều bạn đang quan tâm</h2>
          <p>Trả lời vài câu hỏi đơn giản để nhận hướng dẫn và lựa chọn phù hợp.</p>
          <Link className="primary-button" href="/start">
            Bắt đầu yêu cầu <Icon name="arrow" />
          </Link>
        </section>
      )}

      <section className="next-action-card" aria-labelledby="next-action-title">
        <div className="next-action-card__icon">
          <Icon name={journey?.primaryAction.code === 'NONE' ? 'clock' : 'sparkle'} />
        </div>
        <div>
          <p className="eyebrow">Việc tiếp theo</p>
          <h2 id="next-action-title">{action.title}</h2>
          <p>{action.description}</p>
        </div>
        <Link
          className="primary-button primary-button--wide"
          href={actionHref(journey?.primaryAction.code ?? 'NONE', journey?.caseId)}
        >
          {action.label} <Icon name="arrow" />
        </Link>
      </section>

      <section className="ai-guide-card" aria-labelledby="ai-guide-title">
        <span>
          <Icon name="sparkle" />
        </span>
        <div>
          <p className="eyebrow">Bạn đang có câu hỏi?</p>
          <h2 id="ai-guide-title">AI giúp làm rõ bước tiếp theo</h2>
          <p>Hỏi bằng ngôn ngữ tự nhiên, sau đó bạn kiểm tra lại trước mọi hành động.</p>
        </div>
        <Link className="secondary-button" href="/assistant">
          Trò chuyện <Icon name="arrow" />
        </Link>
      </section>

      {journey?.nextAppointment ? (
        <section className="section-block" aria-labelledby="appointment-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Sắp tới</p>
              <h2 id="appointment-heading">Lịch của bạn</h2>
            </div>
            <Link href="/journey">Xem tất cả</Link>
          </div>
          <Link className="appointment-card" href="/journey">
            <span className="appointment-card__date">
              <strong>{new Date(journey.nextAppointment.startsAt).getDate()}</strong>
              <small>THG {new Date(journey.nextAppointment.startsAt).getMonth() + 1}</small>
            </span>
            <span className="appointment-card__copy">
              <strong>
                {journey.nextAppointment.kind === 'CONSULTATION'
                  ? 'Tư vấn trực tuyến'
                  : 'Lịch khám tại phòng khám'}
              </strong>
              <small>
                {formatDateTime(journey.nextAppointment.startsAt, journey.nextAppointment.timezone)}
              </small>
              <em>
                <span />{' '}
                {journey.nextAppointment.status === 'CONFIRMED' ? 'Đã xác nhận' : 'Tạm giữ'}
              </em>
            </span>
            <Icon name="chevron" />
          </Link>
        </section>
      ) : null}

      <section className="support-card">
        <div className="support-avatar">
          <span>DT</span>
        </div>
        <div>
          <p className="eyebrow">Luôn có người hỗ trợ</p>
          <h2>Đội ngũ chăm sóc Dental Trust</h2>
          <p>Hỏi bất cứ điều gì về hành trình của bạn.</p>
        </div>
        <Link aria-label="Nhắn tin cho đội ngũ chăm sóc" className="round-action" href="/messages">
          <Icon name="message" />
        </Link>
      </section>

      <section className="confidence-strip" aria-label="Cam kết của Dental Trust">
        <span>
          <Icon name="shield" /> Phòng khám được xác minh
        </span>
        <span>
          <Icon name="lock" /> Dữ liệu được bảo vệ
        </span>
        {notifications.filter((item) => !item.readAt).length > 0 ? (
          <Link href="/notifications">
            {notifications.filter((item) => !item.readAt).length} cập nhật mới
          </Link>
        ) : null}
      </section>
    </main>
  );
}
