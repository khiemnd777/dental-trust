import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/icon';
import { getMessageData } from '@/lib/care-data';
import { formatDateTime, initials } from '@/lib/presentation';

export const metadata: Metadata = { title: 'Tin nhắn' };

export default async function MessagesPage() {
  const { threads, journeys } = await getMessageData();
  return (
    <main className="care-main inbox-page">
      <header className="page-intro inbox-intro">
        <p className="eyebrow">Trao đổi an toàn</p>
        <h1>Tin nhắn</h1>
        <p>Đội ngũ chăm sóc và phòng khám trao đổi với bạn theo từng hành trình.</p>
      </header>

      <section className="coordinator-card">
        <div className="support-avatar support-avatar--large">
          <span>AN</span>
          <i aria-label="Đang trực tuyến" />
        </div>
        <div>
          <small>Điều phối viên của bạn</small>
          <h2>An Nguyễn</h2>
          <p>Thường phản hồi trong vòng 15 phút</p>
        </div>
        <span className="online-pill">Đang trực tuyến</span>
      </section>

      <section className="conversation-list" aria-labelledby="conversation-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Theo hành trình</p>
            <h2 id="conversation-title">Cuộc trò chuyện</h2>
          </div>
        </div>
        {threads.map((thread, index) => {
          const journey = journeys.find((item) => item.caseId === thread.caseId);
          return (
            <Link
              className={`conversation-row${thread.unreadCount ? ' has-unread' : ''}`}
              href={`/messages/${thread.id}?caseId=${thread.caseId}`}
              key={thread.id}
            >
              <span className={`conversation-avatar conversation-avatar--${(index % 3) + 1}`}>
                {initials(thread.threadSubject)}
              </span>
              <span className="conversation-copy">
                <strong>{thread.threadSubject}</strong>
                <small>{journey?.title ?? 'Hành trình nha khoa'}</small>
                <p>
                  {thread.closedAt ? 'Cuộc trò chuyện đã đóng' : `${thread.messageCount} tin nhắn`}
                </p>
              </span>
              <span className="conversation-meta">
                <time>{thread.lastMessageAt ? formatDateTime(thread.lastMessageAt) : 'Mới'}</time>
                {thread.unreadCount ? <b>{thread.unreadCount}</b> : <Icon name="chevron" />}
              </span>
            </Link>
          );
        })}
        {!threads.length ? (
          <div className="empty-state">
            <span className="empty-state__icon">
              <Icon name="message" />
            </span>
            <h3>Chưa có cuộc trò chuyện</h3>
            <p>Tin nhắn sẽ xuất hiện khi đội ngũ tiếp nhận hành trình của bạn.</p>
          </div>
        ) : null}
      </section>

      <div className="secure-note">
        <Icon name="lock" />
        <span>
          <strong>Kênh trao đổi được bảo vệ</strong>
          <small>Không gửi thông tin sức khỏe qua email hoặc ứng dụng ngoài.</small>
        </span>
      </div>
    </main>
  );
}
