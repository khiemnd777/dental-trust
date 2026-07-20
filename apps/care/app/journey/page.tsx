import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/icon';
import { getJourneyData, type JourneySummary } from '@/lib/care-data';
import {
  actionFor,
  actionHref,
  formatDateTime,
  journeyStageIndex,
  journeyStageSteps,
  stageLabel,
} from '@/lib/presentation';

import styles from './journey.module.css';

export const metadata: Metadata = { title: 'Hành trình' };

function urgencyLabel(urgency: JourneySummary['urgency']) {
  if (urgency === 'URGENT') return 'Cần hỗ trợ khẩn cấp';
  if (urgency === 'ATTENTION') return 'Cần chú ý';
  return 'Đúng tiến độ';
}

function ownerLabel(owner: JourneySummary['owner']) {
  if (!owner) return null;
  if (owner.type === 'PATIENT') return 'Bạn';
  if (owner.type === 'CLINIC') return 'Phòng khám';
  if (owner.type === 'SUPPORT') return 'Đội ngũ Care';
  return null;
}

export default async function JourneyPage({
  searchParams,
}: {
  searchParams: Promise<{ caseId?: string; created?: string }>;
}) {
  const params = await searchParams;
  const { journeys, selected } = await getJourneyData(params.caseId);
  const action = actionFor(selected?.primaryAction.code ?? 'NONE');
  const stageIndex = selected ? journeyStageIndex(selected.stage) : null;
  const isComplete = selected?.stage === 'CLOSED';
  const currentStage =
    selected && stageIndex !== null && !isComplete ? journeyStageSteps[stageIndex] : null;
  const owner = selected ? ownerLabel(selected.owner) : null;
  const expectedAt = selected?.expectedAt ?? selected?.activeMilestone?.scheduledAt ?? null;

  return (
    <main className={`care-main ${styles.page}`}>
      <header className={styles.intro}>
        <h1>Hành trình</h1>
      </header>

      {params.created ? (
        <div className={styles.successBanner} role="status">
          <span className={styles.successIcon}>
            <Icon name="check" />
          </span>
          <span>
            <strong>Yêu cầu đã được tạo</strong>
            <small>Đội ngũ Care sẽ liên hệ.</small>
          </span>
        </div>
      ) : null}

      {journeys.length > 1 ? (
        <nav aria-label="Chọn hành trình" className={styles.caseSwitcher}>
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
        <div className={styles.workspace}>
          <div className={styles.primaryColumn}>
            <section className={styles.overview} aria-labelledby="journey-title">
              <div className={styles.overviewHeading}>
                <div>
                  <span
                    className={`${styles.status} ${
                      selected.urgency === 'ROUTINE' ? styles.statusRoutine : styles.statusAttention
                    }`}
                  >
                    {urgencyLabel(selected.urgency)}
                  </span>
                  <h2 id="journey-title">{selected.title}</h2>
                  <p>{stageLabel(selected.stage)}</p>
                </div>
                <strong className={styles.progressValue}>{selected.progress}%</strong>
              </div>
              <div
                aria-label={`Đã hoàn thành ${selected.progress}%`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={selected.progress}
                className={styles.progressTrack}
                role="progressbar"
              >
                <span style={{ width: `${selected.progress}%` }} />
              </div>
              <small>Cập nhật {formatDateTime(selected.updatedAt)}</small>
            </section>

            <section className={styles.currentAction} aria-labelledby="current-action-title">
              <div className={styles.actionHeading}>
                <span className={styles.actionIcon}>
                  <Icon name={selected.primaryAction.code === 'NONE' ? 'clock' : 'sparkle'} />
                </span>
                <div>
                  <p className="eyebrow">Việc hiện tại</p>
                  <h2 id="current-action-title">{action.title}</h2>
                  <p>{action.description}</p>
                </div>
              </div>

              {owner || expectedAt || selected.activeMilestone ? (
                <dl className={styles.actionFacts}>
                  {owner ? (
                    <div>
                      <dt>Phụ trách</dt>
                      <dd>{owner}</dd>
                    </div>
                  ) : null}
                  {expectedAt ? (
                    <div>
                      <dt>Dự kiến</dt>
                      <dd>{formatDateTime(expectedAt)}</dd>
                    </div>
                  ) : null}
                  {selected.activeMilestone ? (
                    <div>
                      <dt>Mốc hiện tại</dt>
                      <dd>{selected.activeMilestone.title}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              <Link
                className={`primary-button ${styles.actionButton}`}
                href={actionHref(selected.primaryAction.code, selected.caseId)}
              >
                {action.label} <Icon name="arrow" />
              </Link>
            </section>

            <section className={styles.timeline} aria-labelledby="timeline-title">
              <div className={styles.sectionHeading}>
                <div>
                  <p className="eyebrow">Tổng quan</p>
                  <h2 id="timeline-title">Các mốc chăm sóc</h2>
                </div>
              </div>

              {currentStage ? (
                <section className={styles.activeStage} aria-labelledby="active-stage-title">
                  <h3 id="active-stage-title">
                    <span aria-hidden="true" /> Đang diễn ra
                  </h3>
                  <article>
                    <span className={styles.activeStageNode}>
                      {journeyStageSteps.indexOf(currentStage) + 1}
                    </span>
                    <div>
                      <strong>{currentStage.shortLabel}</strong>
                      <p>{currentStage.description}</p>
                      {expectedAt ? (
                        <small>
                          <Icon name="clock" /> Dự kiến cập nhật {formatDateTime(expectedAt)}
                        </small>
                      ) : null}
                    </div>
                  </article>
                </section>
              ) : null}

              <div className={styles.timelineTrack}>
                {journeyStageSteps.map((stage, index) => {
                  const isCurrentStage = !isComplete && stageIndex === index;
                  const isCompletedStage =
                    stageIndex !== null && (isComplete ? index <= stageIndex : index < stageIndex);

                  return (
                    <article
                      aria-current={isCurrentStage ? 'step' : undefined}
                      className={`${styles.timelineItem} ${
                        isCurrentStage ? styles.timelineItemCurrent : ''
                      } ${isCompletedStage ? styles.timelineItemComplete : ''}`}
                      key={stage.key}
                    >
                      <span
                        aria-label={
                          isCurrentStage
                            ? 'Mốc hiện tại'
                            : isCompletedStage
                              ? 'Đã hoàn tất'
                              : 'Chưa bắt đầu'
                        }
                        className={`${styles.timelineNode} ${
                          isCurrentStage ? styles.timelineNodeCurrent : ''
                        } ${isCompletedStage ? styles.timelineNodeComplete : ''}`}
                      >
                        {isCompletedStage ? <Icon name="check" /> : null}
                      </span>
                      <div className={styles.timelineContent}>
                        <div className={styles.timelineTitle}>
                          <strong>{stage.shortLabel}</strong>
                          {isCurrentStage ? <span>Hiện tại</span> : null}
                        </div>
                        <p>{stage.description}</p>
                        {isCurrentStage && expectedAt ? (
                          <small>
                            <Icon name="clock" /> Dự kiến cập nhật {formatDateTime(expectedAt)}
                          </small>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className={styles.sideColumn} aria-label="Lịch và hỗ trợ">
            {selected.nextAppointment ? (
              <section className={styles.appointment}>
                <span className={styles.appointmentIcon}>
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
                  <small>
                    {selected.nextAppointment.status === 'CONFIRMED'
                      ? 'Đã xác nhận'
                      : 'Đang chờ xác nhận'}
                  </small>
                </div>
                <Link className="secondary-button" href="/messages">
                  Hỏi về lịch
                </Link>
              </section>
            ) : null}

            <section className={styles.resources} aria-labelledby="support-title">
              <div className={styles.resourceHeading}>
                <h2 id="support-title">Hỗ trợ</h2>
              </div>
              <Link href="/messages">
                <span className={styles.resourceIcon}>
                  <Icon name="message" />
                </span>
                <span>
                  <strong>Nhắn Care</strong>
                </span>
                <Icon name="chevron" />
              </Link>
              <div aria-disabled="true" className={styles.disabledResource}>
                <span className={styles.resourceIcon}>
                  <Icon name="document" />
                </span>
                <span>
                  <strong>Hồ sơ nha khoa</strong>
                  <small>Chưa có tài liệu</small>
                </span>
                <Icon name="chevron" />
              </div>
            </section>
          </aside>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <span>
            <Icon name="journey" />
          </span>
          <h2>Chưa có hành trình nào</h2>
          <p>Tạo yêu cầu để bắt đầu.</p>
          <Link className="primary-button" href="/start">
            Bắt đầu yêu cầu <Icon name="arrow" />
          </Link>
        </div>
      )}
    </main>
  );
}
