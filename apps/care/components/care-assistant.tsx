'use client';

import Link from 'next/link';
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@/components/icon';
import { extensionFor, preferredRecordingType } from '@/lib/assistant-audio';
import {
  AssistantRequestError,
  fetchAssistant,
  type AssistantFailureKind,
} from '@/lib/assistant-request';

type AssistantLocale = 'vi-VN' | 'en-US';
type VoiceState = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'synthesizing' | 'speaking';
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

interface TranscriptionView {
  readonly text: string;
  readonly locale: AssistantLocale;
}

interface RetryRequest {
  readonly clientMessageId: string;
  readonly message: string;
  readonly locale: AssistantLocale;
  readonly speakReply: boolean;
  readonly source: 'keyboard' | 'voice';
}

const copy = {
  'vi-VN': {
    eyebrow: 'AI giọng nói · có người giám sát',
    title: 'Bác cần hỗ trợ gì?',
    subtitle: 'Chạm nút lớn bên dưới và nói tự nhiên. Không cần gõ chữ.',
    noticeTitle: 'Trước khi bắt đầu',
    noticeBody:
      'AI có thể nhầm và chỉ hướng dẫn chung, không thay thế bác sĩ hoặc dùng cho cấp cứu. Nội dung được lưu bảo mật để duy trì phiên.',
    noticeAccept: 'Tôi hiểu và muốn tiếp tục',
    noticeRequired: 'Vui lòng chọn “Tôi hiểu và muốn tiếp tục” trước khi nói.',
    language: 'Ngôn ngữ',
    tapToTalk: 'Chạm để nói',
    tapToStop: 'Chạm để dừng',
    stopSpeaking: 'Chạm để ngừng đọc',
    idleStatus: 'Tôi đang sẵn sàng nghe bác',
    recordingStatus: 'Đang nghe… Bác cứ nói tự nhiên',
    transcribingStatus: 'Đang nhận dạng lời nói…',
    thinkingStatus: 'Đang tìm bước phù hợp…',
    synthesizingStatus: 'Đang chuẩn bị câu trả lời bằng giọng nói…',
    speakingStatus: 'AI đang trả lời…',
    example: 'Ví dụ: “Tôi muốn về Việt Nam làm Implant vào tháng tới.”',
    replay: 'Nghe lại',
    slowSpeech: 'Nói chậm',
    humanSupport: 'Gặp nhân viên',
    aiVoiceDisclosure: 'Giọng nói này do AI tạo, không phải giọng người thật.',
    heard: 'Tôi nghe bác nói',
    answer: 'Hướng dẫn tiếp theo',
    transcript: 'Xem nội dung cuộc trò chuyện',
    keyboard: 'Dùng bàn phím',
    keyboardPlaceholder: 'Nhập câu hỏi nếu bác không muốn dùng microphone…',
    send: 'Gửi',
    unsupported: 'Trình duyệt này chưa hỗ trợ thu âm. Bác có thể dùng bàn phím hoặc gặp nhân viên.',
    permissionDenied:
      'Microphone chưa được cho phép. Hãy bật quyền microphone rồi thử lại, hoặc gặp nhân viên.',
    tooShort: 'Tôi chưa nghe rõ. Bác vui lòng chạm và nói lại.',
    transcriptionFailed: 'Chưa thể nhận dạng lời nói. Bác vui lòng thử lại.',
    assistantUnavailable: 'AI đang tạm nghỉ. Bác có thể gặp điều phối viên ngay.',
    sendFailed: 'Chưa thể gửi nội dung. Bác vui lòng thử lại.',
    requestTimeout: 'Hệ thống phản hồi hơi lâu. Nội dung của bác vẫn còn và có thể thử lại.',
    rateLimited: 'AI đang nhận nhiều yêu cầu. Bác vui lòng đợi một chút rồi thử lại.',
    sessionExpired: 'Phiên đăng nhập đã hết hạn. Bác vui lòng đăng nhập lại để tiếp tục.',
    speechUnavailable: 'Chưa thể tự phát âm thanh. Bác hãy chạm “Nghe lại”.',
    retry: 'Thử lại',
    signIn: 'Đăng nhập lại',
    urgentNote: 'Nếu đang ở ngoài Việt Nam, hãy gọi số cấp cứu tại nơi bác đang ở.',
    welcome:
      'Chào bác, tôi là AI Hướng dẫn của Dental Trust. Bác có thể nói nhu cầu; mọi quyết định y khoa và xác nhận lịch vẫn do bác cùng đội ngũ chăm sóc thực hiện.',
  },
  'en-US': {
    eyebrow: 'Voice AI · human supervised',
    title: 'How can we help?',
    subtitle: 'Tap the large button below and speak naturally. No typing needed.',
    noticeTitle: 'Before you begin',
    noticeBody:
      'AI can make mistakes and provides general guidance only. It does not replace a dentist and is not for emergencies. Your conversation is securely stored to maintain the session.',
    noticeAccept: 'I understand and want to continue',
    noticeRequired: 'Please select “I understand and want to continue” before speaking.',
    language: 'Language',
    tapToTalk: 'Tap to talk',
    tapToStop: 'Tap to stop',
    stopSpeaking: 'Tap to stop audio',
    idleStatus: 'I am ready to listen',
    recordingStatus: 'Listening… Speak naturally',
    transcribingStatus: 'Understanding your speech…',
    thinkingStatus: 'Finding the right next step…',
    synthesizingStatus: 'Preparing a spoken answer…',
    speakingStatus: 'AI is answering…',
    example: 'For example: “I want to travel to Vietnam for an implant next month.”',
    replay: 'Hear again',
    slowSpeech: 'Speak slowly',
    humanSupport: 'Talk to a person',
    aiVoiceDisclosure: 'This is an AI-generated voice, not a human voice.',
    heard: 'I heard you say',
    answer: 'Your next step',
    transcript: 'View conversation transcript',
    keyboard: 'Use keyboard',
    keyboardPlaceholder: 'Type a question if you prefer not to use the microphone…',
    send: 'Send',
    unsupported: 'This browser cannot record audio. You can use the keyboard or talk to a person.',
    permissionDenied:
      'Microphone access is not enabled. Allow microphone access and try again, or talk to a person.',
    tooShort: 'I did not hear enough. Please tap and speak again.',
    transcriptionFailed: 'I could not understand the recording. Please try again.',
    assistantUnavailable: 'AI is temporarily unavailable. You can talk to a coordinator now.',
    sendFailed: 'Your message could not be sent. Please try again.',
    requestTimeout: 'The response is taking longer than expected. Your message is ready to retry.',
    rateLimited: 'The AI is receiving many requests. Please wait a moment and try again.',
    sessionExpired: 'Your session has expired. Please sign in again to continue.',
    speechUnavailable: 'Audio could not autoplay. Tap “Hear again”.',
    retry: 'Try again',
    signIn: 'Sign in again',
    urgentNote: 'If you are outside Vietnam, call the emergency number where you are.',
    welcome:
      'Hello, I am the Dental Trust AI Guide. You can tell me what you need; medical decisions and appointment confirmation remain with you and the care team.',
  },
} as const;

const starterQuestions: Readonly<Record<AssistantLocale, readonly string[]>> = {
  'vi-VN': [
    'Tôi chưa biết nên bắt đầu từ đâu',
    'Giúp tôi chuẩn bị yêu cầu Implant',
    'Khi nào tôi có thể đặt lịch?',
  ],
  'en-US': [
    'I do not know where to start',
    'Help me prepare an implant request',
    'When can I book an appointment?',
  ],
};

const actionLabels: Readonly<Record<AssistantLocale, Readonly<Record<AssistantAction, string>>>> = {
  'vi-VN': {
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
  },
  'en-US': {
    NONE: '',
    START_REQUEST: 'Review and start request',
    COMPLETE_INTAKE: 'Continue profile',
    VIEW_MATCHES: 'View suitable clinics',
    REQUEST_CONSULTATION: 'Message a coordinator',
    REVIEW_PLAN: 'View care journey',
    OPEN_BOOKING: 'Review and book',
    VIEW_JOURNEY: 'View care journey',
    HUMAN_SUPPORT: 'Talk to a person',
    EMERGENCY_CARE: 'Call emergency services',
  },
};

const emptyFields: CollectedFields = {
  procedureCode: null,
  preferredLocation: null,
  timingPreference: null,
  decisionPriority: null,
};

export function CareAssistant({
  initialLocale,
  loginHref,
}: {
  readonly initialLocale: AssistantLocale;
  readonly loginHref: string;
}) {
  const [locale, setLocale] = useState(initialLocale);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState<AssistantFailureKind>();
  const [collected, setCollected] = useState<CollectedFields>(emptyFields);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([
    { id: 'welcome', role: 'ASSISTANT', content: copy[initialLocale].welcome },
  ]);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [slowSpeech, setSlowSpeech] = useState(true);
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastAssistantReply, setLastAssistantReply] = useState<AssistantReply>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryRequest, setRetryRequest] = useState<RetryRequest>();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStopFallbackRef = useRef<number | null>(null);
  const recordingFinalizeRef = useRef<(() => void) | null>(null);
  const discardRecordingRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef('');
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const ui = copy[locale];

  useEffect(() => {
    setVoiceSupported('mediaDevices' in navigator && 'MediaRecorder' in window);
    document.documentElement.lang = locale === 'vi-VN' ? 'vi' : 'en';
  }, [locale]);

  useEffect(
    () => () => {
      if (recordingTimerRef.current !== null) window.clearTimeout(recordingTimerRef.current);
      if (recordingStopFallbackRef.current !== null)
        window.clearTimeout(recordingStopFallbackRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        discardRecordingRef.current = true;
        recorder.stop();
      }
      stopMediaStream(recordingStreamRef.current);
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = slowSpeech ? 0.86 : 1;
  }, [slowSpeech]);

  const startHref = useMemo(() => {
    const parameters = new URLSearchParams();
    if (collected.procedureCode) parameters.set('procedure', collected.procedureCode);
    if (collected.preferredLocation) parameters.set('location', collected.preferredLocation);
    if (collected.timingPreference) parameters.set('timing', collected.timingPreference);
    if (collected.decisionPriority) parameters.set('priority', collected.decisionPriority);
    const query = parameters.toString();
    return query ? `/start?${query}` : '/start';
  }, [collected]);

  const latestResponse = useMemo(
    () => [...messages].reverse().find((message) => message.response),
    [messages],
  );

  useEffect(() => {
    if (!error && !latestResponse) return;
    const frame = window.requestAnimationFrame(() =>
      feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [error, latestResponse]);

  function clearError() {
    setError('');
    setErrorKind(undefined);
  }

  function showError(message: string, kind?: AssistantFailureKind) {
    setError(message);
    setErrorKind(kind);
  }

  function selectLocale(nextLocale: AssistantLocale) {
    if (nextLocale === locale) return;
    setLocale(nextLocale);
    clearError();
    if (messages.length === 1) {
      setMessages([{ id: 'welcome', role: 'ASSISTANT', content: copy[nextLocale].welcome }]);
    }
  }

  async function send(
    message: string,
    responseLocale = locale,
    speakReply = true,
    source: RetryRequest['source'] = 'keyboard',
    existingClientMessageId?: string,
  ): Promise<boolean> {
    const normalized = message.trim();
    if (!normalized || requestInFlightRef.current) return false;
    if (!noticeAccepted) {
      showError(copy[responseLocale].noticeRequired);
      setVoiceState('idle');
      return false;
    }
    const clientMessageId = existingClientMessageId ?? crypto.randomUUID();
    requestInFlightRef.current = true;
    setIsSubmitting(true);
    setMessages((current) =>
      current.some((item) => item.id === clientMessageId)
        ? current
        : [...current, { id: clientMessageId, role: 'USER', content: normalized }],
    );
    clearError();
    setRetryRequest(undefined);
    setVoiceState('thinking');

    try {
      const response = await fetchAssistant(
        '/api/care/assistant',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            clientMessageId,
            ...(sessionId ? { sessionId } : {}),
            locale: responseLocale,
            message: normalized,
            acknowledgedAiNotice: true,
          }),
        },
        25_000,
      );
      const envelope = (await response.json()) as { readonly data: AssistantReply };
      const reply = envelope.data;
      setSessionId(reply.sessionId);
      setCollected((current) => mergeFields(current, reply.collectedFields));
      setMessages((current) =>
        current.some((item) => item.id === reply.assistantMessageId)
          ? current
          : [
              ...current,
              {
                id: reply.assistantMessageId,
                role: 'ASSISTANT',
                content: reply.reply,
                response: reply,
              },
            ],
      );
      setLastAssistantReply(reply);
      if (source === 'keyboard') {
        setInput((current) => (current.trim() === normalized ? '' : current));
      }
      if (speakReply) {
        await prepareSpeech(reply, responseLocale);
      } else {
        setVoiceState('idle');
      }
      return true;
    } catch (caught) {
      setMessages((current) => current.filter((item) => item.id !== clientMessageId));
      setVoiceState('idle');
      setRetryRequest({
        clientMessageId,
        message: normalized,
        locale: responseLocale,
        speakReply,
        source,
      });
      showError(
        errorMessage(caught, copy[responseLocale], copy[responseLocale].sendFailed),
        failureKind(caught),
      );
      return false;
    } finally {
      requestInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function prepareSpeech(reply: AssistantReply, speechLocale = locale) {
    setVoiceState('synthesizing');
    stopAudio(false);
    try {
      const response = await fetchAssistant(
        '/api/care/assistant/speech',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: reply.sessionId,
            assistantMessageId: reply.assistantMessageId,
            locale: speechLocale,
          }),
        },
        40_000,
      );
      const blob = await response.blob();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = URL.createObjectURL(blob);
      playCurrentAudio(speechLocale);
    } catch (caught) {
      setVoiceState('idle');
      const kind = failureKind(caught);
      showError(
        kind === 'SESSION_EXPIRED'
          ? copy[speechLocale].sessionExpired
          : copy[speechLocale].speechUnavailable,
        kind,
      );
    }
  }

  function playCurrentAudio(speechLocale = locale) {
    if (!audioUrlRef.current) {
      if (lastAssistantReply) void prepareSpeech(lastAssistantReply, speechLocale);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(audioUrlRef.current);
    audio.playbackRate = slowSpeech ? 0.86 : 1;
    audioRef.current = audio;
    setVoiceState('speaking');
    audio.onended = () => setVoiceState('idle');
    audio.onerror = () => {
      setVoiceState('idle');
      showError(copy[speechLocale].speechUnavailable);
    };
    void audio.play().catch(() => {
      setVoiceState('idle');
      showError(copy[speechLocale].speechUnavailable);
    });
  }

  function stopAudio(reset = true) {
    if (audioRef.current) {
      audioRef.current.pause();
      if (reset) audioRef.current.currentTime = 0;
    }
    if (reset) setVoiceState('idle');
  }

  async function startRecording() {
    if (!noticeAccepted) {
      showError(ui.noticeRequired);
      return;
    }
    if (!voiceSupported) {
      showError(ui.unsupported);
      return;
    }
    stopAudio();
    clearError();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
      });
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      discardRecordingRef.current = false;
      const mimeType = preferredRecordingType((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const recordingLocale = locale;
      let finalized = false;
      const finalizeRecording = () => {
        if (finalized) return;
        finalized = true;
        if (recordingTimerRef.current !== null) {
          window.clearTimeout(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        if (recordingStopFallbackRef.current !== null) {
          window.clearTimeout(recordingStopFallbackRef.current);
          recordingStopFallbackRef.current = null;
        }
        stopMediaStream(stream);
        recordingStreamRef.current = null;
        recorderRef.current = null;
        recordingFinalizeRef.current = null;
        const discard = discardRecordingRef.current;
        const blob = new Blob(recordingChunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        });
        recordingChunksRef.current = [];
        if (discard) return;
        if (blob.size < 256) {
          setVoiceState('idle');
          showError(copy[recordingLocale].tooShort);
          return;
        }
        void transcribe(blob, recordingLocale);
      };
      recorderRef.current = recorder;
      recordingFinalizeRef.current = finalizeRecording;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        discardRecordingRef.current = true;
        finalizeRecording();
        setVoiceState('idle');
        showError(copy[recordingLocale].transcriptionFailed);
      };
      recorder.onstop = finalizeRecording;
      recorder.start(250);
      setVoiceState('recording');
      recordingTimerRef.current = window.setTimeout(() => stopRecording(), 45_000);
    } catch {
      stopMediaStream(recordingStreamRef.current);
      recordingStreamRef.current = null;
      setVoiceState('idle');
      showError(ui.permissionDenied);
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recordingTimerRef.current !== null) {
      window.clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setVoiceState('transcribing');
    try {
      if (recorder.state === 'recording') recorder.requestData();
      if (recorder.state !== 'inactive') recorder.stop();
      else recordingFinalizeRef.current?.();
    } catch {
      recordingFinalizeRef.current?.();
    }
    recordingStopFallbackRef.current = window.setTimeout(
      () => recordingFinalizeRef.current?.(),
      1_500,
    );
  }

  async function transcribe(blob: Blob, localeHint: AssistantLocale) {
    setVoiceState('transcribing');
    clearError();
    const form = new FormData();
    form.append('file', blob, `voice-${Date.now()}.${extensionFor(blob.type)}`);
    form.append('locale', localeHint);
    try {
      const response = await fetchAssistant(
        '/api/care/assistant/transcriptions',
        { method: 'POST', body: form },
        40_000,
      );
      const envelope = (await response.json()) as { readonly data: TranscriptionView };
      const result = envelope.data;
      setLastTranscript(result.text);
      setLocale(result.locale);
      await send(result.text, result.locale, true, 'voice');
    } catch (caught) {
      setVoiceState('idle');
      showError(
        errorMessage(caught, copy[localeHint], copy[localeHint].transcriptionFailed),
        failureKind(caught),
      );
    }
  }

  function handleVoiceButton() {
    if (voiceState === 'recording') {
      stopRecording();
      return;
    }
    if (voiceState === 'speaking') {
      stopAudio();
      return;
    }
    void startRecording();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(input, locale, true, 'keyboard');
  }

  function handleKeyboardKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  const busy = ['transcribing', 'thinking', 'synthesizing'].includes(voiceState) || isSubmitting;
  const voiceLabel =
    voiceState === 'recording'
      ? ui.tapToStop
      : voiceState === 'speaking'
        ? ui.stopSpeaking
        : ui.tapToTalk;
  const voiceStatus = statusFor(voiceState, ui);

  return (
    <main className="care-main assistant-page">
      <header className="assistant-intro">
        <span className="assistant-intro__icon">
          <Icon name="microphone" />
        </span>
        <div>
          <p className="eyebrow">{ui.eyebrow}</p>
          <h1>{ui.title}</h1>
          <p>{ui.subtitle}</p>
        </div>
      </header>

      <section className="ai-notice" aria-labelledby="ai-notice-title">
        <Icon name="shield" />
        <div>
          <strong id="ai-notice-title">{ui.noticeTitle}</strong>
          <p>{ui.noticeBody}</p>
          <label>
            <input
              checked={noticeAccepted}
              onChange={(event) => {
                setNoticeAccepted(event.target.checked);
                if (event.target.checked) clearError();
              }}
              type="checkbox"
            />
            <span>{ui.noticeAccept}</span>
          </label>
        </div>
      </section>

      <section className="assistant-voice" aria-labelledby="voice-assistant-title">
        <div className="assistant-language" aria-label={ui.language}>
          <span>{ui.language}</span>
          <div>
            <button
              aria-pressed={locale === 'vi-VN'}
              onClick={() => selectLocale('vi-VN')}
              type="button"
            >
              Tiếng Việt
            </button>
            <button
              aria-pressed={locale === 'en-US'}
              onClick={() => selectLocale('en-US')}
              type="button"
            >
              English
            </button>
          </div>
        </div>

        <p className="assistant-voice__status" id="voice-assistant-title" aria-live="polite">
          <span className={`assistant-voice__dot assistant-voice__dot--${voiceState}`} />
          {voiceStatus}
        </p>

        <button
          aria-label={voiceLabel}
          className={`assistant-voice__button assistant-voice__button--${voiceState}`}
          disabled={busy || !voiceSupported}
          onClick={handleVoiceButton}
          type="button"
        >
          <Icon
            name={voiceState === 'recording' || voiceState === 'speaking' ? 'close' : 'microphone'}
          />
        </button>
        <strong className="assistant-voice__label">{voiceLabel}</strong>
        <p className="assistant-voice__example">{voiceSupported ? ui.example : ui.unsupported}</p>

        <div className="assistant-voice__actions">
          <button
            disabled={!lastAssistantReply || voiceState === 'recording' || busy}
            onClick={() => playCurrentAudio(locale)}
            type="button"
          >
            <Icon name="volume" /> {ui.replay}
          </button>
          <Link href="/messages">
            <Icon name="support" /> {ui.humanSupport}
          </Link>
        </div>

        <label className="assistant-slow-speech">
          <input
            checked={slowSpeech}
            onChange={(event) => setSlowSpeech(event.target.checked)}
            type="checkbox"
          />
          <span>{ui.slowSpeech}</span>
        </label>
        <small className="assistant-ai-voice-disclosure">{ui.aiVoiceDisclosure}</small>

        {lastTranscript ? (
          <div className="assistant-voice__heard">
            <small>{ui.heard}</small>
            <p>“{lastTranscript}”</p>
          </div>
        ) : null}
      </section>

      {error || latestResponse ? (
        <div className="assistant-feedback" ref={feedbackRef}>
          {error ? (
            <div className="assistant-error" role="alert">
              <p>{error}</p>
              <div className="assistant-error__actions">
                {errorKind === 'SESSION_EXPIRED' ? (
                  <a href={loginHref}>{ui.signIn}</a>
                ) : retryRequest ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void send(
                        retryRequest.message,
                        retryRequest.locale,
                        retryRequest.speakReply,
                        retryRequest.source,
                        retryRequest.clientMessageId,
                      )
                    }
                    type="button"
                  >
                    {ui.retry}
                  </button>
                ) : null}
                <Link href="/messages">{ui.humanSupport}</Link>
              </div>
            </div>
          ) : null}

          {latestResponse ? (
            <div className="assistant-voice__answer" aria-live="polite">
              <small>{ui.answer}</small>
              <p>{latestResponse.content}</p>
              {latestResponse.response?.safetyLevel === 'URGENT' ? (
                <span className="urgent-note">{ui.urgentNote}</span>
              ) : null}
              {latestResponse.response && latestResponse.response.suggestedAction !== 'NONE' ? (
                <AssistantActionLink
                  action={latestResponse.response.suggestedAction}
                  locale={locale}
                  startHref={startHref}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <details className="assistant-transcript">
        <summary>{ui.transcript}</summary>
        <section aria-label={ui.transcript} className="assistant-chat">
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
                </div>
              </article>
            ))}
          </div>
        </section>
      </details>

      <details className="assistant-keyboard">
        <summary>
          <Icon name="keyboard" /> {ui.keyboard}
        </summary>
        <div className="assistant-keyboard__body">
          {messages.length === 1 ? (
            <div className="assistant-starters">
              {starterQuestions[locale].map((question) => (
                <button
                  disabled={busy}
                  key={question}
                  onClick={() => void send(question)}
                  type="button"
                >
                  {question}
                </button>
              ))}
            </div>
          ) : null}
          <form className="assistant-composer" onSubmit={submit}>
            <textarea
              aria-label={ui.keyboard}
              disabled={busy}
              maxLength={2_000}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyboardKeyDown}
              placeholder={ui.keyboardPlaceholder}
              rows={2}
              value={input}
            />
            <button aria-label={ui.send} disabled={busy || !input.trim()} type="submit">
              <Icon name="arrow" />
            </button>
          </form>
          {busy ? (
            <p className="assistant-keyboard__status" role="status">
              <span className={`assistant-voice__dot assistant-voice__dot--${voiceState}`} />
              {voiceStatus}
            </p>
          ) : null}
        </div>
      </details>
    </main>
  );
}

function AssistantActionLink({
  action,
  locale,
  startHref,
}: {
  readonly action: AssistantAction;
  readonly locale: AssistantLocale;
  readonly startHref: string;
}) {
  if (action === 'EMERGENCY_CARE') {
    return (
      <a className="assistant-action assistant-action--urgent" href="tel:115">
        {actionLabels[locale][action]}
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
      {actionLabels[locale][action]} <Icon name="arrow" />
    </Link>
  );
}

function statusFor(state: VoiceState, ui: (typeof copy)[AssistantLocale]): string {
  switch (state) {
    case 'recording':
      return ui.recordingStatus;
    case 'transcribing':
      return ui.transcribingStatus;
    case 'thinking':
      return ui.thinkingStatus;
    case 'synthesizing':
      return ui.synthesizingStatus;
    case 'speaking':
      return ui.speakingStatus;
    default:
      return ui.idleStatus;
  }
}

function failureKind(error: unknown): AssistantFailureKind | undefined {
  return error instanceof AssistantRequestError ? error.kind : undefined;
}

function errorMessage(
  error: unknown,
  ui: (typeof copy)[AssistantLocale],
  fallback: string,
): string {
  switch (failureKind(error)) {
    case 'SESSION_EXPIRED':
      return ui.sessionExpired;
    case 'RATE_LIMITED':
      return ui.rateLimited;
    case 'TIMEOUT':
      return ui.requestTimeout;
    case 'UNAVAILABLE':
      return ui.assistantUnavailable;
    default:
      return fallback;
  }
}

function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function mergeFields(current: CollectedFields, incoming: CollectedFields): CollectedFields {
  return {
    procedureCode: incoming.procedureCode ?? current.procedureCode,
    preferredLocation: incoming.preferredLocation ?? current.preferredLocation,
    timingPreference: incoming.timingPreference ?? current.timingPreference,
    decisionPriority: incoming.decisionPriority ?? current.decisionPriority,
  };
}
