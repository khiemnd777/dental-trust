'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { CustomSelect } from '@dental-trust/ui';
import type { DentalCaseView } from '@dental-trust/contracts';
import { ProviderDialog } from '@/components/provider-dialog';
import { ProviderIcon } from '@/components/provider-icon';
import type { ProviderMessageThread } from '@/lib/provider-data';
import { commandErrorMessage, sendProviderCommand } from '@/lib/provider-command';
import { MAX_MESSAGE_ATTACHMENTS, unreadParticipantMessageIds } from '@/lib/messaging';
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
  const [internalNotesOpen, setInternalNotesOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [internalNoteDraft, setInternalNoteDraft] = useState('');
  const [attachmentIds, setAttachmentIds] = useState<readonly string[]>([]);
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
  const selected =
    filtered.find((thread) => thread.id === selectedId) ??
    (selectedId === null && !query.trim() && !unreadOnly ? (filtered[0] ?? null) : null);

  useEffect(() => {
    if (!selected) return;
    const messageIds = unreadParticipantMessageIds(selected.messages, currentUserId);
    if (!messageIds.length) return;
    let active = true;
    void Promise.all(
      messageIds.map((messageId) =>
        sendProviderCommand({
          command: 'mark_message_read',
          resourceId: selected.caseId,
          secondaryId: selected.id,
          payload: { messageId },
        }),
      ),
    )
      .then(() => {
        if (active) router.refresh();
      })
      .catch((reason: unknown) => {
        if (active) setError(commandErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [currentUserId, router, selected]);

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
                    onClick={() => {
                      setSelectedId(thread.id);
                      setAttachmentIds([]);
                    }}
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
                  onClick={() => {
                    setSelectedId(null);
                    setAttachmentIds([]);
                  }}
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
                <button
                  aria-label={`Ghi chú nội bộ (${selected.internalNotes?.length ?? 0})`}
                  className="provider-chat-options"
                  onClick={() => {
                    setInternalNoteDraft('');
                    setInternalNotesOpen(true);
                  }}
                  type="button"
                >
                  <ProviderIcon name="shield" />
                </button>
              </header>
              <div className="provider-chat-security">
                <ProviderIcon name="shield" /> Tin nhắn được chia sẻ với bệnh nhân; ghi chú nội bộ
                nằm trong khu vực riêng
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
                        {message.attachments.length ? (
                          <small>
                            Tệp đính kèm:{' '}
                            {message.attachments
                              .map((attachment) => attachment.originalFileName)
                              .join(', ')}
                          </small>
                        ) : null}
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
                        payload: { messageBody, fileAssetIds: attachmentIds },
                      }),
                    'Tin nhắn đã được gửi.',
                  ).then((sent) => {
                    if (sent) {
                      setDraft('');
                      setAttachmentIds([]);
                    }
                  });
                }}
              >
                <button
                  aria-label={
                    attachmentIds.length
                      ? `Đính kèm tệp (${attachmentIds.length} đã chọn)`
                      : 'Đính kèm tệp'
                  }
                  disabled={pending || !selected.attachableDocuments.length}
                  onClick={() => setAttachmentsOpen(true)}
                  title={
                    selected.attachableDocuments.length
                      ? `${attachmentIds.length}/${MAX_MESSAGE_ATTACHMENTS} tệp đã chọn`
                      : 'Hồ sơ chưa có tài liệu sạch và sẵn sàng để đính kèm'
                  }
                  type="button"
                >
                  <ProviderIcon name="plus" />
                </button>
                <input
                  aria-label="Nội dung tin nhắn"
                  disabled={pending}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={
                    attachmentIds.length
                      ? `Nhập tin nhắn bảo mật… (${attachmentIds.length} tệp)`
                      : 'Nhập tin nhắn bảo mật…'
                  }
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
      <ProviderDialog
        description="Chỉ thành viên phòng khám được phân công mới có thể đọc phần này. Ghi chú không bao giờ xuất hiện trong hội thoại với bệnh nhân."
        onClose={() => setInternalNotesOpen(false)}
        open={internalNotesOpen}
        title="Ghi chú nội bộ"
      >
        {selected?.internalNotes ? (
          <form
            className="provider-form"
            onSubmit={(event) => {
              event.preventDefault();
              const internalNote = internalNoteDraft.trim();
              if (!internalNote) return;
              void execute(
                () =>
                  sendProviderCommand({
                    command: 'create_internal_note',
                    resourceId: selected.caseId,
                    secondaryId: selected.id,
                    payload: { internalNote },
                  }),
                'Đã lưu ghi chú nội bộ.',
              ).then((created) => {
                if (created) {
                  setInternalNoteDraft('');
                  setInternalNotesOpen(false);
                }
              });
            }}
          >
            <section className="provider-form-section" aria-label="Lịch sử ghi chú nội bộ">
              <strong>Lịch sử ({selected.internalNotes.length})</strong>
              <div>
                {selected.internalNotes.length ? (
                  selected.internalNotes.map((note) => (
                    <article key={note.id}>
                      <p>{note.internalNote}</p>
                      <small>{formatDateTime(note.createdAt)}</small>
                    </article>
                  ))
                ) : (
                  <p>Chưa có ghi chú nội bộ cho cuộc trò chuyện này.</p>
                )}
              </div>
            </section>
            <label>
              <span>Ghi chú mới — chỉ đội ngũ phòng khám</span>
              <textarea
                disabled={pending}
                maxLength={8000}
                onChange={(event) => setInternalNoteDraft(event.target.value)}
                required
                rows={5}
                value={internalNoteDraft}
              />
            </label>
            <footer>
              <button onClick={() => setInternalNotesOpen(false)} type="button">
                Đóng
              </button>
              <button disabled={pending || !internalNoteDraft.trim()} type="submit">
                {pending ? 'Đang lưu…' : 'Lưu ghi chú nội bộ'}
              </button>
            </footer>
          </form>
        ) : (
          <div className="provider-form">
            <p>
              Không thể tải ghi chú nội bộ. Tài khoản có thể chưa được phân công vào hồ sơ này hoặc
              dịch vụ đang tạm thời không khả dụng.
            </p>
            <footer>
              <button onClick={() => setInternalNotesOpen(false)} type="button">
                Đóng
              </button>
            </footer>
          </div>
        )}
      </ProviderDialog>
      <ProviderDialog
        description={`Chỉ tài liệu hồ sơ đã quét sạch và ở trạng thái sẵn sàng mới có thể được gửi. Tối đa ${MAX_MESSAGE_ATTACHMENTS} tệp.`}
        onClose={() => setAttachmentsOpen(false)}
        open={attachmentsOpen}
        title="Đính kèm tài liệu hồ sơ"
      >
        <div className="provider-form">
          {selected?.attachableDocuments.length ? (
            <fieldset>
              <legend>Tài liệu có thể đính kèm</legend>
              <div className="provider-check-grid">
                {selected.attachableDocuments.map((document) => {
                  const checked = attachmentIds.includes(document.fileAssetId);
                  return (
                    <label className="provider-checkbox" key={document.id}>
                      <input
                        checked={checked}
                        disabled={!checked && attachmentIds.length >= MAX_MESSAGE_ATTACHMENTS}
                        onChange={(event) =>
                          setAttachmentIds((current) =>
                            event.target.checked
                              ? [...current, document.fileAssetId]
                              : current.filter((id) => id !== document.fileAssetId),
                          )
                        }
                        type="checkbox"
                      />
                      <span>{document.originalFileName}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <p>Hồ sơ chưa có tài liệu sạch và sẵn sàng để đính kèm.</p>
          )}
          <footer>
            <button onClick={() => setAttachmentIds([])} type="button">
              Bỏ chọn
            </button>
            <button onClick={() => setAttachmentsOpen(false)} type="button">
              Xong ({attachmentIds.length})
            </button>
          </footer>
        </div>
      </ProviderDialog>
    </>
  );
}
