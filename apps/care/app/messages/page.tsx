import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/icon';
import { getMessageData, type JourneySummary, type MessageThread } from '@/lib/care-data';
import { formatDateTime, initials } from '@/lib/presentation';

import styles from './messages.module.css';

export const metadata: Metadata = { title: 'Tin nhắn' };

function ConversationRow({
  journey,
  thread,
}: {
  journey: JourneySummary | undefined;
  thread: MessageThread;
}) {
  return (
    <Link
      aria-label={`${thread.threadSubject}${thread.unreadCount ? `, ${thread.unreadCount} tin chưa đọc` : ''}`}
      className={`${styles.conversationRow} ${thread.unreadCount ? styles.hasUnread : ''}`}
      href={`/messages/${thread.id}?caseId=${thread.caseId}`}
    >
      <span className={styles.conversationAvatar}>{initials(thread.threadSubject)}</span>
      <span className={styles.conversationCopy}>
        <span className={styles.conversationTitle}>
          <strong>{thread.threadSubject}</strong>
          {thread.closedAt ? (
            <small className={styles.closedBadge}>Đã đóng</small>
          ) : (
            <small className={styles.activeBadge}>Đang trao đổi</small>
          )}
        </span>
        <small>{journey?.title ?? 'Hành trình nha khoa'}</small>
        <span className={styles.conversationDetails}>
          {thread.lastMessageAt ? (
            <time dateTime={thread.lastMessageAt}>{formatDateTime(thread.lastMessageAt)}</time>
          ) : (
            <span>Mới</span>
          )}
        </span>
      </span>
      <span className={styles.conversationMeta}>
        {thread.unreadCount ? <b>{thread.unreadCount}</b> : null}
        <Icon name="chevron" />
      </span>
    </Link>
  );
}

export default async function MessagesPage() {
  const { threads, journeys } = await getMessageData();
  const activeThreads = threads.filter((thread) => !thread.closedAt);
  const closedThreads = threads.filter((thread) => thread.closedAt);
  const unreadCount = threads.reduce((total, thread) => total + thread.unreadCount, 0);

  return (
    <main className={`care-main ${styles.page}`}>
      <header className={styles.intro}>
        <h1>Tin nhắn</h1>
        {unreadCount ? (
          <span className={styles.unreadSummary}>{unreadCount} tin chưa đọc</span>
        ) : null}
      </header>

      <div className={styles.workspace}>
        <section className={styles.conversations} aria-labelledby="conversation-title">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="conversation-title">Cuộc trò chuyện</h2>
            </div>
            {activeThreads.length ? <span>{activeThreads.length} đang mở</span> : null}
          </div>

          {activeThreads.length ? (
            <div className={styles.conversationList}>
              {activeThreads.map((thread) => (
                <ConversationRow
                  journey={journeys.find((item) => item.caseId === thread.caseId)}
                  key={thread.id}
                  thread={thread}
                />
              ))}
            </div>
          ) : null}

          {!threads.length ? (
            <div className={styles.emptyState}>
              <span>
                <Icon name="message" />
              </span>
              <h3>Chưa có cuộc trò chuyện</h3>
              <p>Tin nhắn sẽ xuất hiện khi hành trình được tiếp nhận.</p>
            </div>
          ) : null}

          {closedThreads.length ? (
            <section className={styles.closedSection} aria-labelledby="closed-title">
              <div className={styles.closedHeading}>
                <h3 id="closed-title">Đã kết thúc</h3>
                <span>{closedThreads.length}</span>
              </div>
              <div className={styles.conversationList}>
                {closedThreads.map((thread) => (
                  <ConversationRow
                    journey={journeys.find((item) => item.caseId === thread.caseId)}
                    key={thread.id}
                    thread={thread}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </section>

        <aside className={styles.securityNote} aria-labelledby="security-title">
          <span>
            <Icon name="shield" />
          </span>
          <div>
            <h2 id="security-title">Kênh bảo mật</h2>
            <p>Chỉ trao đổi thông tin sức khỏe trong Care.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
