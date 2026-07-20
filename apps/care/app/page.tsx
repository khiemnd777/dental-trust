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
  const actionCode = journey?.primaryAction.code ?? 'NONE';
  const action = actionFor(actionCode);
  const greeting = firstName(profile?.identity?.fullName);
  const unreadNotificationCount = notifications.filter((item) => !item.readAt).length;
  const nextAction = journey
    ? {
        title: action.title,
        label: action.label,
        href: actionHref(actionCode, journey.caseId),
      }
    : {
        title: 'Bắt đầu yêu cầu chăm sóc',
        label: 'Bắt đầu yêu cầu',
        href: '/start',
      };

  return (
    <main className="care-main today-page">
      <header className="page-intro today-intro">
        <div>
          <p className="eyebrow">Hôm nay</p>
          <h1>
            {dayPeriodGreeting()}, {greeting}
          </h1>
          <span
            className={`status-pill today-intro__status status-pill--${journey?.urgency.toLowerCase() ?? 'routine'}`}
          >
            {!journey
              ? 'Sẵn sàng khi bạn muốn'
              : journey.urgency === 'ROUTINE'
                ? 'Đúng tiến độ'
                : journey.urgency === 'URGENT'
                  ? 'Cần ưu tiên'
                  : 'Cần chú ý'}
          </span>
        </div>
        <span className="today-intro__weather" aria-label="Phiên Care được bảo vệ">
          <Icon name="shield" /> Bảo mật
        </span>
      </header>

      <div className="today-layout">
        <div className="today-primary-column">
          <section className="today-action-hero" aria-labelledby="next-action-title">
            <div className="today-action-hero__heading">
              <span className="today-action-hero__icon" aria-hidden="true">
                <Icon name={actionCode === 'NONE' && journey ? 'clock' : 'sparkle'} />
              </span>
              <p className="eyebrow">
                {!journey || actionCode === 'NONE' ? 'Tiếp theo' : 'Việc cần làm'}
              </p>
            </div>
            <h2 id="next-action-title">{nextAction.title}</h2>
            <Link className="primary-button" href={nextAction.href}>
              {nextAction.label} <Icon name="arrow" />
            </Link>
          </section>

          {journey ? (
            <section className="today-journey-card" aria-labelledby="today-journey-title">
              <div className="today-journey-card__heading">
                <div>
                  <p className="eyebrow">Hành trình của bạn</p>
                  <h2 id="today-journey-title">{journey.title}</h2>
                </div>
                <span className={`status-pill status-pill--${journey.urgency.toLowerCase()}`}>
                  {journey.urgency === 'ROUTINE'
                    ? 'Đang tiến hành'
                    : journey.urgency === 'URGENT'
                      ? 'Cần hỗ trợ khẩn cấp'
                      : 'Cần chú ý'}
                </span>
              </div>
              <div className="today-journey-card__stage">
                <span>{stageLabel(journey.stage)}</span>
                <small>{journey.caseNumber}</small>
              </div>
              <p className="today-journey-card__update">
                {journey.expectedAt
                  ? `Cập nhật ${formatDateTime(journey.expectedAt)}`
                  : 'Sẽ báo khi có cập nhật'}
              </p>
              <div className="progress-meta">
                <span>Tiến độ</span>
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
              <Link className="today-journey-card__link" href={`/journey?caseId=${journey.caseId}`}>
                Xem hành trình <Icon name="arrow" />
              </Link>
            </section>
          ) : (
            <section className="today-journey-card today-journey-card--empty">
              <span aria-hidden="true">
                <Icon name="journey" />
              </span>
              <div>
                <h2>Chưa có hành trình</h2>
                <p>Tạo yêu cầu để bắt đầu.</p>
              </div>
            </section>
          )}
        </div>

        <aside className="today-context-column" aria-label="Thông tin hỗ trợ hôm nay">
          {journey?.nextAppointment ? (
            <section
              className="section-block today-appointment"
              aria-labelledby="appointment-heading"
            >
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
                    {formatDateTime(
                      journey.nextAppointment.startsAt,
                      journey.nextAppointment.timezone,
                    )}
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
            <div className="support-avatar" aria-hidden="true">
              <span>DT</span>
            </div>
            <div>
              <h2>Đội ngũ Care</h2>
            </div>
            <Link className="support-card__link" href="/messages">
              Nhắn Care <Icon name="arrow" />
            </Link>
          </section>

          <section className="ai-guide-card" aria-labelledby="ai-guide-title">
            <span aria-hidden="true">
              <Icon name="sparkle" />
            </span>
            <div>
              <h2 id="ai-guide-title">Hỏi AI</h2>
              <p>Giải thích thông tin trên màn hình.</p>
            </div>
            <Link className="secondary-button" href="/assistant">
              Mở trợ lý <Icon name="arrow" />
            </Link>
          </section>

          <section className="confidence-strip" aria-label="Cam kết của Dental Trust">
            <span>
              <Icon name="shield" /> Phòng khám được xác minh
            </span>
            <span>
              <Icon name="lock" /> Dữ liệu được bảo vệ
            </span>
            {unreadNotificationCount > 0 ? (
              <Link href="/notifications">{unreadNotificationCount} cập nhật mới</Link>
            ) : null}
          </section>
        </aside>
      </div>
    </main>
  );
}
