'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Icon } from '@/components/icon';
import type { CareNotification } from '@/lib/care-data';
import { formatDateTime, notificationCopy, notificationHref } from '@/lib/presentation';

export function NotificationCenter({
  notifications,
}: {
  readonly notifications: readonly CareNotification[];
}) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const visible = unreadOnly ? notifications.filter((item) => !item.readAt) : notifications;

  return (
    <main className="care-main notifications-page">
      <header className="subpage-header">
        <Link aria-label="Quay lại hôm nay" href="/">
          <Icon className="icon-back" name="arrow" />
        </Link>
        <div>
          <p className="eyebrow">Không bỏ lỡ điều quan trọng</p>
          <h1>Thông báo</h1>
        </div>
      </header>
      <div className="notification-filter" role="group" aria-label="Lọc thông báo">
        <button aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)} type="button">
          Tất cả
        </button>
        <button aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)} type="button">
          Chưa đọc
        </button>
      </div>
      <section className="notification-list" aria-label="Danh sách thông báo">
        {visible.map((notification) => {
          const copy = notificationCopy(notification.category, notification.templateKey);
          return (
            <Link
              className={notification.readAt ? '' : 'is-unread'}
              href={notificationHref(notification.action?.target, notification.action?.resourceId)}
              key={notification.id}
            >
              <span>
                <Icon name="bell" />
              </span>
              <div>
                <h2>{copy.title}</h2>
                <p>{copy.body}</p>
                <time dateTime={notification.scheduledAt}>
                  {formatDateTime(notification.scheduledAt)}
                </time>
              </div>
              {!notification.readAt ? <i aria-label="Chưa đọc" /> : null}
            </Link>
          );
        })}
        {!visible.length ? (
          <div className="empty-state empty-state--large">
            <span className="empty-state__icon">
              <Icon name="bell" />
            </span>
            <h2>{unreadOnly ? 'Không còn thông báo chưa đọc' : 'Bạn đã xem hết'}</h2>
            <p>Cập nhật mới về hành trình và lịch hẹn sẽ xuất hiện ở đây.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
