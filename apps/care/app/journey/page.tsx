import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';

import { Icon } from '@/components/icon';
import { getJourneyData } from '@/lib/care-data';
import {
  actionFor,
  actionHref,
  formatDateTime,
  journeyStageIndex,
  journeyStageSteps,
  stageLabel,
} from '@/lib/presentation';

export const metadata: Metadata = { title: 'Hành trình' };

export default async function JourneyPage({
  searchParams,
}: {
  searchParams: Promise<{ caseId?: string; created?: string }>;
}) {
  const params = await searchParams;
  const { journeys, selected } = await getJourneyData(params.caseId);
  const action = actionFor(selected?.primaryAction.code ?? 'NONE');
  const stageIndex = selected ? journeyStageIndex(selected.stage) : null;

  return (
    <main className="care-main journey-page">
      <header className="page-intro journey-intro">
        <p className="eyebrow">Hành trình của bạn</p>
        <h1>Mỗi bước đều rõ ràng</h1>
        <p>Bạn luôn biết điều gì đang diễn ra và ai đang phụ trách.</p>
      </header>

      {params.created ? (
        <div className="success-banner" role="status">
          <Icon name="check" />
          <span>
            <strong>Yêu cầu đã được tạo</strong>
            <small>Đội ngũ chăm sóc sẽ kiểm tra và liên hệ với bạn.</small>
          </span>
        </div>
      ) : null}

      {journeys.length > 1 ? (
        <nav aria-label="Chọn hành trình" className="case-switcher">
          {journeys.map((journey) => (
            <Link
              aria-current={selected?.caseId === journey.caseId ? 'page' : undefined}
              href={`/journey?caseId=${journey.caseId}`}
              key={journey.caseId}
            >
              <span>{journey.title}</span>
              <small>{stageLabel(journey.stage)}</small>
            </Link>
          ))}
        </nav>
      ) : null}

      {selected ? (
        <>
          <section className="journey-overview">
            <div
              className="journey-overview__ring"
              style={{ '--progress': `${selected.progress * 3.6}deg` } as CSSProperties}
            >
              <span>
                <strong>{selected.progress}%</strong>
                <small>hoàn thành</small>
              </span>
            </div>
            <div>
              <span className={`status-pill status-pill--${selected.urgency.toLowerCase()}`}>
                {selected.urgency === 'ROUTINE'
                  ? 'Đúng tiến độ'
                  : selected.urgency === 'URGENT'
                    ? 'Cần hỗ trợ khẩn cấp'
                    : 'Cần chú ý'}
              </span>
              <h2>{selected.title}</h2>
              <p>{stageLabel(selected.stage)}</p>
              <small>Cập nhật {formatDateTime(selected.updatedAt)}</small>
            </div>
          </section>

          <section className="journey-action">
            <span>
              <Icon name="sparkle" />
            </span>
            <div>
              <p className="eyebrow">Việc tiếp theo</p>
              <h2>{action.title}</h2>
              <p>{action.description}</p>
            </div>
            <Link
              className="primary-button"
              href={actionHref(selected.primaryAction.code, selected.caseId)}
            >
              {action.label} <Icon name="arrow" />
            </Link>
          </section>

          <section className="journey-timeline" aria-labelledby="timeline-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Tổng quan</p>
                <h2 id="timeline-title">Từ chuẩn bị đến hồi phục</h2>
              </div>
            </div>
            <div className="journey-stages">
              {journeyStageSteps.map((stage, index) => {
                const complete = stageIndex !== null && index < stageIndex;
                const current = stageIndex !== null && index === stageIndex;
                return (
                  <article
                    className={complete ? 'is-complete' : current ? 'is-current' : ''}
                    key={stage.key}
                  >
                    <span>{complete ? <Icon name="check" /> : index + 1}</span>
                    <div>
                      <small>
                        {complete ? 'Đã hoàn thành' : current ? 'Đang diễn ra' : 'Tiếp theo'}
                      </small>
                      <h3>{stage.shortLabel}</h3>
                      <p>{stage.description}</p>
                      {current && selected.expectedAt ? (
                        <em>
                          <Icon name="clock" /> Dự kiến cập nhật{' '}
                          {formatDateTime(selected.expectedAt)}
                        </em>
                      ) : null}
                    </div>
                    {current ? <Icon name="chevron" /> : null}
                  </article>
                );
              })}
            </div>
          </section>

          {selected.nextAppointment ? (
            <section className="journey-appointment">
              <span className="journey-appointment__icon">
                <Icon name="calendar" />
              </span>
              <div>
                <p className="eyebrow">Lịch sắp tới</p>
                <h2>
                  {selected.nextAppointment.kind === 'CONSULTATION'
                    ? 'Tư vấn trực tuyến'
                    : 'Buổi điều trị'}
                </h2>
                <p>
                  {formatDateTime(
                    selected.nextAppointment.startsAt,
                    selected.nextAppointment.timezone,
                  )}
                </p>
              </div>
              <Link className="secondary-button" href="/messages">
                Hỏi về lịch
              </Link>
            </section>
          ) : null}

          <section className="journey-resources">
            <Link href="/messages">
              <span>
                <Icon name="message" />
              </span>
              <strong>Hỏi đội ngũ chăm sóc</strong>
              <small>Nhắn tin an toàn theo ca điều trị</small>
              <Icon name="chevron" />
            </Link>
            <div aria-disabled="true" className="is-disabled">
              <span>
                <Icon name="document" />
              </span>
              <strong>Hồ sơ nha khoa</strong>
              <small>Sẽ mở khi có tài liệu sẵn sàng</small>
              <Icon name="chevron" />
            </div>
          </section>
        </>
      ) : (
        <div className="empty-state empty-state--large">
          <span className="empty-state__icon">
            <Icon name="journey" />
          </span>
          <h2>Chưa có hành trình nào</h2>
          <p>Hãy cho chúng tôi biết nhu cầu để bắt đầu nhận hướng dẫn cá nhân hóa.</p>
          <Link className="primary-button" href="/start">
            Bắt đầu yêu cầu <Icon name="arrow" />
          </Link>
        </div>
      )}
    </main>
  );
}
