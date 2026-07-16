'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Icon } from '@/components/icon';
import type { CareNotification } from '@/lib/care-data';
import { careMutation, careMutationErrorMessage } from '@/lib/client-mutation';
import { notificationCopy, notificationHref } from '@/lib/presentation';

export function NotificationCenter({
  formattedDateTimes,
  notifications,
}: {
  readonly formattedDateTimes: Readonly<Record<string, string>>;
  readonly notifications: readonly CareNotification[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(notifications);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const visible = unreadOnly ? items.filter((item) => !item.readAt) : items;

  function openNotification(notification: CareNotification, href: string) {
    if (notification.readAt) {
      router.push(href);
      return;
    }
    setError('');
    startTransition(async () => {
      const result = await careMutation<CareNotification>('/api/care/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notificationId: notification.id }),
      });
      if (!result.ok) {
        setError(careMutationErrorMessage(result.error, 'Chưa thể đánh dấu đã đọc. Hãy thử lại.'));
        return;
      }
      setItems((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, readAt: result.data.readAt ?? new Date().toISOString() }
            : item,
        ),
      );
      router.push(href);
      router.refresh();
    });
  }

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
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <section className="notification-list" aria-label="Danh sách thông báo">
        {visible.map((notification) => {
          const copy = notificationCopy(notification.category, notification.templateKey);
          const href = notificationHref(
            notification.action?.target,
            notification.action?.resourceId,
          );
          return (
            <Link
              aria-disabled={isPending}
              className={notification.readAt ? '' : 'is-unread'}
              href={href}
              key={notification.id}
              onClick={(event) => {
                event.preventDefault();
                if (!isPending) openNotification(notification, href);
              }}
            >
              <span>
                <Icon name="bell" />
              </span>
              <div>
                <h2>{copy.title}</h2>
                <p>{copy.body}</p>
                <time dateTime={notification.scheduledAt}>
                  {formattedDateTimes[notification.id] ?? 'Thời gian chưa xác định'}
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
