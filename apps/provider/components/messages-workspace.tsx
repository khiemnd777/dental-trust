'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { CustomSelect } from '@dental-trust/ui';
import type { DentalCaseView } from '@dental-trust/contracts';
import { ProviderDialog } from '@/components/provider-dialog';
import { ProviderIcon } from '@/components/provider-icon';
import type { ProviderMessageThread } from '@/lib/provider-data';
import { commandErrorMessage, sendProviderCommand } from '@/lib/provider-command';
import { formatDateTime, initials } from '@/lib/presentation';

export function MessagesWorkspace({
  threads,
  cases,
  currentUserId,
}: {
  readonly threads: readonly ProviderMessageThread[];
  readonly cases: readonly DentalCaseView[];
  readonly currentUserId: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [draft, setDraft] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi-VN');
    return threads.filter((thread) => {
      if (unreadOnly && !thread.unreadCount) return false;
      if (!normalized) return true;
      return [thread.threadSubject, thread.caseNumber, thread.caseTitle].some((value) =>
        value.toLocaleLowerCase('vi-VN').includes(normalized),
      );
    });
  }, [query, threads, unreadOnly]);
  const selected = threads.find((thread) => thread.id === selectedId) ?? filtered[0] ?? null;

  async function execute(operation: () => Promise<unknown>, success: string): Promise<boolean> {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
      setNotice(success);
      router.refresh();
      return true;
    } catch (reason) {
      setError(commandErrorMessage(reason));
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {notice ? (
        <div className="provider-toast provider-toast--success" role="status">
          <ProviderIcon name="check" />
          {notice}
          <button aria-label="Đóng" onClick={() => setNotice(null)} type="button">
            ×
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="provider-toast provider-toast--error" role="alert">
          <ProviderIcon name="alert" />
          {error}
          <button aria-label="Đóng" onClick={() => setError(null)} type="button">
            ×
          </button>
        </div>
      ) : null}
      <section
        className={`provider-panel provider-message-workspace provider-message-workspace--connected${selectedId ? ' provider-message-workspace--thread-open' : ''}`}
      >
        <aside className="provider-inbox">
          <header>
            <label>
              <ProviderIcon name="search" />
              <input
                aria-label="Tìm cuộc trò chuyện"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm chủ đề hoặc mã hồ sơ…"
                value={query}
              />
            </label>
            <button
              aria-label="Tạo cuộc trò chuyện"
              onClick={() => setDialogOpen(true)}
              type="button"
            >
              <ProviderIcon name="plus" />
            </button>
          </header>
          <div className="provider-inbox-tabs">
            <button aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)} type="button">
              Tất cả <b>{threads.length}</b>
            </button>
            <button aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)} type="button">
              Chưa đọc <b>{threads.reduce((sum, item) => sum + item.unreadCount, 0)}</b>
            </button>
          </div>
          <div className="provider-thread-list">
            {filtered.length ? (
              filtered.map((thread) => {
                const last = thread.messages.at(-1);
                return (
                  <button
                    className={selected?.id === thread.id ? 'is-active' : ''}
                    key={thread.id}
                    onClick={() => setSelectedId(thread.id)}
                    type="button"
                  >
                    <span className="provider-avatar provider-avatar--blue">
                      {initials(thread.caseTitle)}
                    </span>
                    <div>
                      <span>
                        <strong>{thread.threadSubject}</strong>
                        <time>{formatDateTime(thread.lastMessageAt ?? thread.updatedAt)}</time>
                      </span>
                      <small>
                        {thread.caseNumber} · {thread.caseTitle}
                      </small>
                      <p>{last?.messageBody ?? 'Chưa có tin nhắn'}</p>
                    </div>
                    {thread.unreadCount ? <b>{thread.unreadCount}</b> : null}
                  </button>
                );
              })
            ) : (
              <div className="provider-empty-state provider-empty-state--compact">
                <strong>Không có cuộc trò chuyện</strong>
                <p>Thay đổi bộ lọc hoặc tạo một cuộc trò chuyện mới.</p>
              </div>
            )}
          </div>
        </aside>

        <div className="provider-chat-preview provider-chat-preview--connected">
          {selected ? (
            <>
              <header>
                <button
                  aria-label="Quay lại danh sách hội thoại"
                  className="provider-chat-back"
                  onClick={() => setSelectedId(null)}
                  type="button"
                >
                  <ProviderIcon name="chevron" />
                </button>
                <span className="provider-avatar provider-avatar--blue">
                  {initials(selected.caseTitle)}
                </span>
                <div>
                  <strong>{selected.threadSubject}</strong>
                  <small>
                    <i /> {selected.caseNumber} · {selected.caseTitle}
                  </small>
                </div>
                <a aria-label="Mở hồ sơ" href={`/cases/${selected.caseId}?tab=messages`}>
                  <ProviderIcon name="document" />
                </a>
                <button aria-label="Tùy chọn" className="provider-chat-options" type="button">
                  <ProviderIcon name="more" />
                </button>
              </header>
              <div className="provider-chat-security">
                <ProviderIcon name="shield" /> Nội dung chỉ hiển thị cho thành viên có quyền truy
                cập hồ sơ
              </div>
              <div className="provider-chat-body">
                {selected.messages.length ? (
                  selected.messages.map((message) => (
                    <article
                      className={message.authorUserId === currentUserId ? 'is-mine' : ''}
                      key={message.id}
                    >
                      {message.authorUserId === currentUserId ? null : (
                        <span className="provider-avatar provider-avatar--blue">BN</span>
                      )}
                      <div>
                        <p>{message.messageBody}</p>
                        <small>
                          {formatDateTime(message.createdAt)}
                          {message.readByCurrentUser ? ' · Đã đọc' : ''}
                        </small>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="provider-empty-state">
                    <strong>Chưa có tin nhắn</strong>
                    <p>Gửi tin nhắn đầu tiên trong cuộc trò chuyện này.</p>
                  </div>
                )}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const messageBody = draft.trim();
                  if (!messageBody) return;
                  void execute(
                    () =>
                      sendProviderCommand({
                        command: 'send_message',
                        resourceId: selected.caseId,
                        secondaryId: selected.id,
                        payload: { messageBody, fileAssetIds: [] },
                      }),
                    'Tin nhắn đã được gửi.',
                  ).then((sent) => {
                    if (sent) setDraft('');
                  });
                }}
              >
                <button aria-label="Đính kèm tệp" disabled type="button">
                  <ProviderIcon name="plus" />
                </button>
                <input
                  aria-label="Nội dung tin nhắn"
                  disabled={pending}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Nhập tin nhắn bảo mật…"
                  value={draft}
                />
                <button aria-label="Gửi" disabled={pending || !draft.trim()} type="submit">
                  <ProviderIcon name="arrow" />
                </button>
              </form>
            </>
          ) : (
            <div className="provider-empty-state">
              <span>
                <ProviderIcon name="message" />
              </span>
              <strong>Chọn một cuộc trò chuyện</strong>
              <p>Nội dung trao đổi sẽ xuất hiện tại đây.</p>
              <button onClick={() => setDialogOpen(true)} type="button">
                Tạo cuộc trò chuyện
              </button>
            </div>
          )}
        </div>
      </section>
      <ProviderDialog
        description="Cuộc trò chuyện luôn gắn với một hồ sơ và tuân theo quyền truy cập của hồ sơ đó."
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
        title="Tạo cuộc trò chuyện"
      >
        <form
          className="provider-form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const caseId = String(form.get('caseId'));
            const payload = {
              threadSubject: String(form.get('subject')),
              messageBody: String(form.get('message')),
              fileAssetIds: [],
            };
            void execute(
              () =>
                sendProviderCommand({
                  command: 'create_message_thread',
                  resourceId: caseId,
                  payload,
                }),
              'Đã tạo cuộc trò chuyện.',
            ).then((created) => {
              if (created) setDialogOpen(false);
            });
          }}
        >
          <label>
            <span>Hồ sơ</span>
            <CustomSelect name="caseId" required>
              {cases
                .filter((item) => !['CLOSED', 'CANCELLED'].includes(item.status))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.caseNumber} · {item.title}
                  </option>
                ))}
            </CustomSelect>
          </label>
          <label>
            <span>Chủ đề</span>
            <input maxLength={160} name="subject" required />
          </label>
          <label>
            <span>Tin nhắn đầu tiên</span>
            <textarea maxLength={8000} name="message" required rows={6} />
          </label>
          <footer>
            <button onClick={() => setDialogOpen(false)} type="button">
              Hủy
            </button>
            <button disabled={pending || !cases.length} type="submit">
              {pending ? 'Đang tạo…' : 'Tạo cuộc trò chuyện'}
            </button>
          </footer>
        </form>
      </ProviderDialog>
    </>
  );
}
