'use client';

import Link from 'next/link';
import { type FormEvent, useMemo, useState, useTransition } from 'react';

import { Icon } from '@/components/icon';

type AssistantAction =
  | 'NONE'
  | 'START_REQUEST'
  | 'COMPLETE_INTAKE'
  | 'VIEW_MATCHES'
  | 'REQUEST_CONSULTATION'
  | 'REVIEW_PLAN'
  | 'OPEN_BOOKING'
  | 'VIEW_JOURNEY'
  | 'HUMAN_SUPPORT'
  | 'EMERGENCY_CARE';

interface CollectedFields {
  readonly procedureCode: string | null;
  readonly preferredLocation: string | null;
  readonly timingPreference: string | null;
  readonly decisionPriority: string | null;
}

interface AssistantReply {
  readonly sessionId: string;
  readonly assistantMessageId: string;
  readonly reply: string;
  readonly safetyLevel: 'ROUTINE' | 'ATTENTION' | 'URGENT';
  readonly suggestedAction: AssistantAction;
  readonly actionRequiresConfirmation: boolean;
  readonly collectedFields: CollectedFields;
}

interface ChatMessage {
  readonly id: string;
  readonly role: 'USER' | 'ASSISTANT';
  readonly content: string;
  readonly response?: AssistantReply;
}

const starterQuestions = [
  'Tôi chưa biết nên bắt đầu từ đâu',
  'Giúp tôi chuẩn bị yêu cầu Implant',
  'Khi nào tôi có thể đặt lịch?',
] as const;

const actionLabels: Readonly<Record<AssistantAction, string>> = {
  NONE: '',
  START_REQUEST: 'Xem lại và tạo yêu cầu',
  COMPLETE_INTAKE: 'Tiếp tục hồ sơ',
  VIEW_MATCHES: 'Xem phòng khám phù hợp',
  REQUEST_CONSULTATION: 'Nhắn điều phối viên',
  REVIEW_PLAN: 'Xem hành trình',
  OPEN_BOOKING: 'Kiểm tra và đặt lịch',
  VIEW_JOURNEY: 'Xem hành trình',
  HUMAN_SUPPORT: 'Gặp người hỗ trợ',
  EMERGENCY_CARE: 'Gọi cấp cứu tại Việt Nam',
};

const emptyFields: CollectedFields = {
  procedureCode: null,
  preferredLocation: null,
  timingPreference: null,
  decisionPriority: null,
};

export function CareAssistant() {
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [collected, setCollected] = useState<CollectedFields>(emptyFields);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([
    {
      id: 'welcome',
      role: 'ASSISTANT',
      content:
        'Chào bạn, tôi là AI Hướng dẫn của Dental Trust. Tôi có thể giúp bạn làm rõ nhu cầu và tìm đúng bước tiếp theo; quyết định y khoa và xác nhận lịch luôn do bạn cùng đội ngũ chăm sóc thực hiện.',
    },
  ]);
  const [isPending, startTransition] = useTransition();

  const startHref = useMemo(() => {
    const parameters = new URLSearchParams();
    if (collected.procedureCode) parameters.set('procedure', collected.procedureCode);
    if (collected.preferredLocation) parameters.set('location', collected.preferredLocation);
    if (collected.timingPreference) parameters.set('timing', collected.timingPreference);
    if (collected.decisionPriority) parameters.set('priority', collected.decisionPriority);
    const query = parameters.toString();
    return query ? `/start?${query}` : '/start';
  }, [collected]);

  function send(message: string) {
    const normalized = message.trim();
    if (!normalized || isPending) return;
    if (!noticeAccepted) {
      setError('Vui lòng xác nhận bạn đã hiểu giới hạn của AI trước khi tiếp tục.');
      return;
    }
    const clientMessageId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: clientMessageId, role: 'USER', content: normalized },
    ]);
    setInput('');
    setError('');

    startTransition(async () => {
      try {
        const response = await fetch('/api/care/assistant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            clientMessageId,
            ...(sessionId ? { sessionId } : {}),
            locale: 'vi-VN',
            message: normalized,
            acknowledgedAiNotice: true,
          }),
        });
        if (!response.ok) {
          throw new Error(response.status === 503 ? 'unavailable' : 'failed');
        }
        const envelope = (await response.json()) as { readonly data: AssistantReply };
        const reply = envelope.data;
        setSessionId(reply.sessionId);
        setCollected((current) => mergeFields(current, reply.collectedFields));
        setMessages((current) => [
          ...current,
          {
            id: reply.assistantMessageId,
            role: 'ASSISTANT',
            content: reply.reply,
            response: reply,
          },
        ]);
      } catch (caught) {
        setError(
          caught instanceof Error && caught.message === 'unavailable'
            ? 'AI đang tạm nghỉ. Bạn có thể nhắn điều phối viên để được hỗ trợ ngay.'
            : 'Chưa thể gửi tin nhắn. Vui lòng thử lại.',
        );
      }
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send(input);
  }

  return (
    <main className="care-main assistant-page">
      <header className="assistant-intro">
        <span className="assistant-intro__icon">
          <Icon name="sparkle" />
        </span>
        <div>
          <p className="eyebrow">AI Hướng dẫn · có người giám sát</p>
          <h1>Từ thắc mắc đến đúng bước chăm sóc</h1>
          <p>Không chẩn đoán, không tự đặt lịch và không tự thanh toán.</p>
        </div>
      </header>

      <section className="ai-notice" aria-labelledby="ai-notice-title">
        <Icon name="shield" />
        <div>
          <strong id="ai-notice-title">Trước khi trò chuyện</strong>
          <p>
            AI có thể nhầm và chỉ cung cấp hướng dẫn chung. Không dùng cho cấp cứu. Nội dung trò
            chuyện được lưu bảo mật để duy trì phiên và kiểm soát chất lượng.
          </p>
          <label>
            <input
              checked={noticeAccepted}
              onChange={(event) => setNoticeAccepted(event.target.checked)}
              type="checkbox"
            />
            <span>Tôi hiểu và muốn tiếp tục</span>
          </label>
        </div>
      </section>

      <section aria-label="Cuộc trò chuyện với AI" className="assistant-chat">
        <div className="assistant-chat__messages" aria-live="polite">
          {messages.map((message) => (
            <article
              className={`chat-bubble chat-bubble--${message.role.toLowerCase()}`}
              key={message.id}
            >
              {message.role === 'ASSISTANT' ? (
                <span>
                  <Icon name="sparkle" />
                </span>
              ) : null}
              <div>
                <p>{message.content}</p>
                {message.response?.safetyLevel === 'URGENT' ? (
                  <small className="urgent-note">
                    Nếu đang ở ngoài Việt Nam, gọi số cấp cứu tại nơi bạn đang ở.
                  </small>
                ) : null}
                {message.response && message.response.suggestedAction !== 'NONE' ? (
                  <AssistantActionLink
                    action={message.response.suggestedAction}
                    startHref={startHref}
                  />
                ) : null}
              </div>
            </article>
          ))}
          {isPending ? (
            <article className="chat-bubble chat-bubble--assistant chat-bubble--typing">
              <span>
                <Icon name="sparkle" />
              </span>
              <div>
                <i />
                <i />
                <i />
              </div>
            </article>
          ) : null}
        </div>

        {messages.length === 1 ? (
          <div className="assistant-starters">
            {starterQuestions.map((question) => (
              <button
                disabled={isPending}
                key={question}
                onClick={() => send(question)}
                type="button"
              >
                {question}
              </button>
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}{' '}
            {error.includes('điều phối viên') ? <Link href="/messages">Mở tin nhắn</Link> : null}
          </p>
        ) : null}

        <form className="assistant-composer" onSubmit={submit}>
          <textarea
            aria-label="Tin nhắn cho AI"
            disabled={isPending}
            maxLength={2_000}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ví dụ: Tôi mất một răng và muốn tìm hiểu Implant…"
            rows={2}
            value={input}
          />
          <button aria-label="Gửi" disabled={isPending || !input.trim()} type="submit">
            <Icon name="arrow" />
          </button>
        </form>
      </section>
    </main>
  );
}

function AssistantActionLink({
  action,
  startHref,
}: {
  action: AssistantAction;
  startHref: string;
}) {
  if (action === 'EMERGENCY_CARE') {
    return (
      <a className="assistant-action assistant-action--urgent" href="tel:115">
        {actionLabels[action]}
      </a>
    );
  }
  const href =
    action === 'START_REQUEST' || action === 'COMPLETE_INTAKE'
      ? startHref
      : action === 'VIEW_MATCHES'
        ? '/discover'
        : action === 'OPEN_BOOKING'
          ? '/booking'
          : action === 'REVIEW_PLAN' || action === 'VIEW_JOURNEY'
            ? '/journey'
            : '/messages';
  return (
    <Link className="assistant-action" href={href}>
      {actionLabels[action]} <Icon name="arrow" />
    </Link>
  );
}

function mergeFields(current: CollectedFields, incoming: CollectedFields): CollectedFields {
  return {
    procedureCode: incoming.procedureCode ?? current.procedureCode,
    preferredLocation: incoming.preferredLocation ?? current.preferredLocation,
    timingPreference: incoming.timingPreference ?? current.timingPreference,
    decisionPriority: incoming.decisionPriority ?? current.decisionPriority,
  };
}
