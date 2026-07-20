import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { MessageComposer } from '@/components/message-composer';
import { Icon } from '@/components/icon';
import { ThreadReadMarker } from '@/components/thread-read-marker';
import { getMessageData, getThreadData } from '@/lib/care-data';
import { formatDateTime, isMessageMine } from '@/lib/presentation';
import { requireCareSession } from '@/lib/require-session';

import styles from '../messages.module.css';

export const metadata: Metadata = { title: 'Cuộc trò chuyện' };

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ caseId?: string }>;
}) {
  const threadId = (await params).threadId;
  const caseId = (await searchParams).caseId;
  if (!caseId) notFound();
  const [identity, { threads }, messages] = await Promise.all([
    requireCareSession(),
    getMessageData(),
    getThreadData(caseId, threadId),
  ]);
  if (!identity) throw new Error('Care identity is temporarily unavailable.');
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) notFound();
  const unreadMessageIds = messages
    .filter((message) => message.authorUserId !== identity.id && !message.readByCurrentUser)
    .map((message) => message.id);

  return (
    <main className={`${styles.threadPage} chat-page`}>
      <header className="chat-header">
        <Link aria-label="Quay lại tin nhắn" href="/messages">
          <Icon className="icon-back" name="arrow" />
        </Link>
        <span className="conversation-avatar conversation-avatar--1" aria-hidden="true">
          <Icon name="message" />
        </span>
        <span>
          <strong>{thread.threadSubject}</strong>
          <small>Người tham gia hành trình</small>
        </span>
        <span aria-label="Cuộc trò chuyện được bảo vệ" className="chat-header__security" role="img">
          <Icon name="shield" />
        </span>
      </header>

      <div className="chat-security">
        <Icon name="lock" /> Chỉ những người tham gia hành trình mới xem được tin nhắn
      </div>

      <section aria-label="Nội dung cuộc trò chuyện" className="chat-messages">
        <time>Hôm nay</time>
        {messages.map((message) => {
          const mine = isMessageMine(message.authorUserId, identity.id);
          return (
            <article className={mine ? 'is-mine' : ''} key={message.id}>
              {!mine ? (
                <span className="conversation-avatar conversation-avatar--1" aria-hidden="true">
                  <Icon name="message" />
                </span>
              ) : null}
              <div>
                <p>{message.messageBody}</p>
                <small>{formatDateTime(message.createdAt)}</small>
              </div>
            </article>
          );
        })}
        {!messages.length ? (
          <div className="chat-welcome">
            <span>
              <Icon name="support" />
            </span>
            <h2>Bắt đầu cuộc trò chuyện</h2>
            <p>Hãy hỏi bất cứ điều gì bạn chưa rõ. Không có câu hỏi nào là quá nhỏ.</p>
          </div>
        ) : null}
      </section>
      <ThreadReadMarker caseId={caseId} messageIds={unreadMessageIds} threadId={threadId} />
      <MessageComposer caseId={caseId} threadId={threadId} />
    </main>
  );
}
