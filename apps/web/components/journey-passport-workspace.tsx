'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import type { Locale, Messages } from '@dental-trust/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Progress,
  SelectField,
  Skeleton,
  TextAreaField,
} from '@dental-trust/ui';

import type { PortalArea } from '@/lib/routing';

interface Milestone {
  id: string;
  code: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  version: number;
}

interface Instruction {
  id: string;
  type: string;
  locale: string;
  content: string;
  createdAt: string;
}

interface PlanChange {
  id: string;
  fromPlanVersionId: string;
  kind: string;
  reason: string;
  changes: { field: string; beforeValue: string; afterValue: string }[];
  createdAt: string;
  acknowledgedAt: string | null;
}

interface JourneyData {
  caseId: string;
  caseNumber: string;
  status: string;
  milestones: Milestone[];
  instructions: Instruction[];
  planChanges: PlanChange[];
}

interface PassportData {
  id: string;
  caseId: string;
  caseNumber: string;
  version: number;
  status: string;
  clinic: { id: string; name: string };
  treatingDentist: { id: string; fullName: string };
  treatmentCompletedAt: string;
  treatmentSummary: string;
  dischargeInstructions: string;
  followUpInstructions: string;
  materials: { procedureCode: string; material: string }[];
  integrity: {
    algorithm: string;
    contentChecksum: string;
    previousVersionChecksum: string | null;
    verified: boolean;
  };
  downloadable: boolean;
}

interface CommandEnvelope {
  data?: Record<string, unknown>;
  accepted?: boolean;
}

const workspaceKeys = new Set([
  'patient:journey',
  'patient:passport',
  'clinic:progress',
  'clinic:passport',
]);

export function isJourneyPassportWorkspace(area: PortalArea, pageKey: string): boolean {
  return workspaceKeys.has(`${area}:${pageKey}`);
}

export function JourneyPassportWorkspace({
  area,
  pageKey,
  locale,
  title,
  description,
  messages,
  resourceId,
  development,
}: {
  area: PortalArea;
  pageKey: string;
  locale: Locale;
  title: string;
  description: string;
  messages: Messages;
  resourceId?: string | undefined;
  development: boolean;
}) {
  const passportMode = pageKey === 'passport';
  const clinicMode = area === 'clinic';
  const [data, setData] = useState<JourneyData | PassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [sending, setSending] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const idempotencyKeys = useRef(new Map<string, string>());

  useEffect(() => {
    if (!resourceId) {
      setLoading(false);
      setError(true);
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams({ area, pageKey, resourceId });
    setLoading(true);
    setError(false);
    void fetch(`/api/portal/data?${query.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404 && passportMode) return null;
        if (!response.ok) throw new Error('data_unavailable');
        const envelope = (await response.json()) as { data?: JourneyData | PassportData };
        if (!envelope.data) throw new Error('invalid_data');
        return envelope.data;
      })
      .then((value) => setData(value))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [area, pageKey, passportMode, resourceId, revision]);

  const sendCommand = async (command: string, payload: Record<string, unknown>) => {
    if (!resourceId) return null;
    const operationKey = `${command}:${JSON.stringify(payload)}`;
    const idempotencyKey = idempotencyKeys.current.get(operationKey) ?? crypto.randomUUID();
    idempotencyKeys.current.set(operationKey, idempotencyKey);
    setSending(true);
    setError(false);
    try {
      const response = await fetch('/api/portal/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          area,
          pageKey,
          command,
          entityId: resourceId,
          payload,
          idempotencyKey,
        }),
      });
      if (!response.ok) throw new Error('command_failed');
      idempotencyKeys.current.delete(operationKey);
      return (await response.json()) as CommandEnvelope;
    } catch {
      setError(true);
      return null;
    } finally {
      setSending(false);
    }
  };

  const journey = !passportMode ? (data as JourneyData | null) : null;
  const passport = passportMode ? (data as PassportData | null) : null;
  const completion = useMemo(() => {
    const milestones = journey?.milestones ?? [];
    if (milestones.length === 0) return 0;
    return Math.round(
      (milestones.filter(({ status }) => status === 'COMPLETED').length / milestones.length) * 100,
    );
  }, [journey?.milestones]);

  const createInstruction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void sendCommand('create_treatment_instruction', {
      type: String(form.get('type')),
      locale: String(form.get('locale')),
      content: String(form.get('content')),
    }).then((result) => {
      if (result) {
        setNotice(locale === 'vi' ? 'Đã lưu hướng dẫn của nha sĩ.' : 'Provider instruction saved.');
        setRevision((value) => value + 1);
        event.currentTarget.reset();
      }
    });
  };

  const createPlanChange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void sendCommand('create_plan_change', {
      fromPlanVersionId: String(form.get('planVersionId')),
      kind: String(form.get('kind')),
      reason: String(form.get('reason')),
      changes: [
        {
          field: String(form.get('field')),
          beforeValue: String(form.get('beforeValue')),
          afterValue: String(form.get('afterValue')),
        },
      ],
    }).then((result) => {
      if (result) {
        setNotice(
          locale === 'vi' ? 'Đã ghi nhận thay đổi bất biến.' : 'Immutable change recorded.',
        );
        setRevision((value) => value + 1);
      }
    });
  };

  const createDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void sendCommand('create_passport_draft', {
      treatingDentistId: String(form.get('dentistId')),
      treatmentCompletedAt: String(form.get('completedAt')),
      treatmentSummary: String(form.get('summary')),
      dischargeInstructions: String(form.get('discharge')),
      followUpInstructions: String(form.get('followUp')),
      implants: [],
      materials: [
        {
          procedureCode: String(form.get('procedureCode')),
          material: String(form.get('material')),
        },
      ],
      prescriptions: [],
    }).then((result) => {
      if (result) {
        setNotice(locale === 'vi' ? 'Đã tạo bản nháp hộ chiếu.' : 'Passport draft created.');
        setRevision((value) => value + 1);
      }
    });
  };

  const createShare = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!passport) return;
    void sendCommand('create_passport_share', {
      versionId: passport.id,
      expiresInMinutes: Number(form.get('expiresInMinutes')),
      maxAccessCount: Number(form.get('maxAccessCount')),
    }).then((result) => {
      const url = result?.data?.url;
      if (typeof url === 'string') {
        setShareUrl(url);
        setNotice(locale === 'vi' ? 'Đã tạo liên kết chia sẻ.' : 'Share link created.');
      }
    });
  };

  const prepareDownload = async () => {
    if (!resourceId || !passport) return;
    setSending(true);
    setError(false);
    try {
      const query = new URLSearchParams({ area, caseId: resourceId, versionId: passport.id });
      const response = await fetch(`/api/portal/passport-download?${query.toString()}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('download_unavailable');
      const envelope = (await response.json()) as { data?: { url?: string } };
      if (!envelope.data?.url) throw new Error('invalid_download');
      setDownloadUrl(envelope.data.url);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="portal-content" id="main-content">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">
            {messages.portal.sections[area]} ·{' '}
            {development ? messages.portal.demo : messages.portal.secure}
          </p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {data?.caseNumber ? <Badge tone="info">{data.caseNumber}</Badge> : null}
      </div>
      {notice ? <Alert tone="success" title={notice} /> : null}
      {error ? <Alert tone="danger" title={messages.workflows.unavailable} /> : null}
      {loading ? (
        <Card style={{ padding: '1.2rem' }}>
          <Skeleton style={{ height: '2rem', width: '45%' }} />
          <Skeleton style={{ height: '12rem', marginTop: '1rem' }} />
        </Card>
      ) : null}

      {!loading && journey ? (
        <div className="workspace-grid">
          <Card className="workflow-card">
            <Progress
              label={locale === 'vi' ? 'Tiến độ điều trị' : 'Treatment progress'}
              value={completion}
            />
            <div className="document-list" style={{ marginTop: '1rem' }}>
              {journey.milestones.map((milestone) => (
                <div className="document-row" key={milestone.id}>
                  <div>
                    <strong>{milestone.title}</strong>
                    <small>{milestone.scheduledAt ?? milestone.code}</small>
                  </div>
                  <Badge tone={milestone.status === 'COMPLETED' ? 'verified' : 'attention'}>
                    {milestone.status}
                  </Badge>
                  {clinicMode && milestone.status !== 'COMPLETED' ? (
                    <Button
                      disabled={sending}
                      size="sm"
                      onClick={() =>
                        void sendCommand('complete_milestone', {
                          milestoneId: milestone.id,
                          expectedVersion: milestone.version,
                        }).then((result) => {
                          if (result) setRevision((value) => value + 1);
                        })
                      }
                    >
                      {locale === 'vi' ? 'Hoàn tất' : 'Complete'}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
          <Card className="side-card">
            <h2>{locale === 'vi' ? 'Hướng dẫn của nha sĩ' : 'Provider instructions'}</h2>
            {journey.instructions.map((instruction) => (
              <div key={instruction.id} style={{ marginBottom: '1rem' }}>
                <Badge tone="info">{instruction.type}</Badge>
                <p>{instruction.content}</p>
                <small>{instruction.locale}</small>
              </div>
            ))}
          </Card>
          <Card className="workflow-card">
            <h2>{locale === 'vi' ? 'Thay đổi điều trị và giá' : 'Treatment and price changes'}</h2>
            {journey.planChanges.map((change) => (
              <div className="document-row" key={change.id}>
                <div>
                  <strong>{change.reason}</strong>
                  {change.changes.map((item) => (
                    <small key={item.field}>
                      {item.field}: {item.beforeValue} → {item.afterValue}
                    </small>
                  ))}
                </div>
                {change.acknowledgedAt ? (
                  <Badge tone="verified">ACKNOWLEDGED</Badge>
                ) : area === 'patient' ? (
                  <Button
                    disabled={sending}
                    size="sm"
                    onClick={() =>
                      void sendCommand('acknowledge_plan_change', { changeId: change.id }).then(
                        (result) => {
                          if (result) setRevision((value) => value + 1);
                        },
                      )
                    }
                  >
                    {locale === 'vi' ? 'Xác nhận đã xem' : 'Acknowledge'}
                  </Button>
                ) : (
                  <Badge tone="attention">PENDING</Badge>
                )}
              </div>
            ))}
          </Card>
          {clinicMode ? (
            <Card className="side-card">
              <h2>{locale === 'vi' ? 'Hướng dẫn mới' : 'New provider instruction'}</h2>
              <form className="workflow-form" onSubmit={createInstruction}>
                <SelectField label="Type / Loại" name="type" required>
                  <option value="MEDICATION">Medication / Thuốc</option>
                  <option value="DISCHARGE">Discharge / Xuất viện</option>
                  <option value="FOLLOW_UP">Follow-up / Tái khám</option>
                </SelectField>
                <SelectField label="Language / Ngôn ngữ" name="locale" required>
                  <option value="vi-VN">Tiếng Việt</option>
                  <option value="en-US">English</option>
                </SelectField>
                <TextAreaField label="Provider-authored content" name="content" required />
                <Button disabled={sending} type="submit">
                  {locale === 'vi' ? 'Lưu hướng dẫn' : 'Save instruction'}
                </Button>
              </form>
            </Card>
          ) : null}
          {clinicMode ? (
            <Card className="workflow-card">
              <h2>{locale === 'vi' ? 'Ghi nhận thay đổi' : 'Record a change'}</h2>
              <form className="workflow-form" onSubmit={createPlanChange}>
                <Field label="Baseline plan version ID" name="planVersionId" required />
                <SelectField label="Kind / Loại" name="kind" required>
                  <option value="TREATMENT">Treatment / Điều trị</option>
                  <option value="PRICE">Price / Giá</option>
                  <option value="TREATMENT_AND_PRICE">Treatment and price</option>
                </SelectField>
                <SelectField label="Field / Trường" name="field" required>
                  <option value="PROCEDURE">Procedure</option>
                  <option value="MATERIAL">Material</option>
                  <option value="TOTAL_PRICE_MINOR">Total price</option>
                  <option value="CURRENCY">Currency</option>
                </SelectField>
                <div className="workflow-form__two">
                  <Field label="Before / Trước" name="beforeValue" required />
                  <Field label="After / Sau" name="afterValue" required />
                </div>
                <TextAreaField label="Reason / Lý do" name="reason" required />
                <Button disabled={sending} type="submit">
                  {locale === 'vi' ? 'Ghi nhận' : 'Record change'}
                </Button>
              </form>
            </Card>
          ) : null}
        </div>
      ) : null}

      {!loading && passport ? (
        <div className="workspace-grid">
          <Card className="workflow-card">
            <div className="workspace-card__head">
              <div>
                <h2>Dental Passport · v{passport.version}</h2>
                <p>
                  {passport.clinic.name} · {passport.treatingDentist.fullName}
                </p>
              </div>
              <Badge tone={passport.status === 'PUBLISHED' ? 'verified' : 'attention'}>
                {passport.status}
              </Badge>
            </div>
            <h3>Treatment summary / Tóm tắt điều trị</h3>
            <p>{passport.treatmentSummary}</p>
            <h3>Discharge / Hướng dẫn xuất viện</h3>
            <p>{passport.dischargeInstructions}</p>
            <h3>Follow-up / Hướng dẫn tái khám</h3>
            <p>{passport.followUpInstructions}</p>
            <Alert
              tone={passport.integrity.verified ? 'success' : 'danger'}
              title={
                passport.integrity.verified
                  ? 'Integrity verified / Đã xác minh toàn vẹn'
                  : 'Integrity check failed'
              }
            >
              <code>{passport.integrity.contentChecksum}</code>
            </Alert>
            {passport.downloadable ? (
              <Button disabled={sending} onClick={() => void prepareDownload()}>
                {locale === 'vi' ? 'Chuẩn bị tải PDF' : 'Prepare PDF download'}
              </Button>
            ) : null}
            {downloadUrl ? (
              <p>
                <a href={downloadUrl} rel="noreferrer" target="_blank">
                  {locale === 'vi' ? 'Mở bản tải xuống an toàn' : 'Open secure download'}
                </a>
              </p>
            ) : null}
          </Card>
          {area === 'patient' && passport.status === 'PUBLISHED' ? (
            <Card className="side-card">
              <h2>{locale === 'vi' ? 'Chia sẻ có thời hạn' : 'Expiring secure share'}</h2>
              <form className="workflow-form" onSubmit={createShare}>
                <Field
                  defaultValue="1440"
                  label="Expiry in minutes / Số phút hiệu lực"
                  max={10080}
                  min={5}
                  name="expiresInMinutes"
                  type="number"
                  required
                />
                <Field
                  defaultValue="5"
                  label="Maximum access count / Số lần truy cập"
                  max={100}
                  min={1}
                  name="maxAccessCount"
                  type="number"
                  required
                />
                <Button disabled={sending} type="submit">
                  {locale === 'vi' ? 'Tạo liên kết' : 'Create share link'}
                </Button>
              </form>
              {shareUrl ? (
                <Alert tone="success" title="Opaque share link / Liên kết bảo mật">
                  <a href={shareUrl} rel="noreferrer" target="_blank">
                    {shareUrl}
                  </a>
                  <p>
                    {locale === 'vi'
                      ? 'Liên kết không chứa mã hồ sơ hoặc dữ liệu lâm sàng.'
                      : 'The link embeds no case identifier or clinical data.'}
                  </p>
                </Alert>
              ) : null}
            </Card>
          ) : null}
          {clinicMode && passport.status === 'DRAFT' ? (
            <Card className="side-card">
              <h2>{locale === 'vi' ? 'Phát hành bản này' : 'Publish this version'}</h2>
              <p>
                {locale === 'vi'
                  ? 'Nội dung sẽ được khóa và tạo PDF song ngữ.'
                  : 'Content will be locked and rendered as a bilingual PDF.'}
              </p>
              <Button
                disabled={sending}
                onClick={() =>
                  void sendCommand('publish_passport', { versionId: passport.id }).then(
                    (result) => {
                      if (result) {
                        setNotice(
                          locale === 'vi' ? 'Đã phát hành hộ chiếu.' : 'Passport published.',
                        );
                        setRevision((value) => value + 1);
                      }
                    },
                  )
                }
              >
                {locale === 'vi' ? 'Phát hành' : 'Publish passport'}
              </Button>
            </Card>
          ) : null}
        </div>
      ) : null}

      {!loading && clinicMode && passportMode ? (
        <Card className="workflow-card" style={{ marginTop: '1rem' }}>
          <h2>
            {locale === 'vi' ? 'Tạo phiên bản hộ chiếu mới' : 'Create a new passport version'}
          </h2>
          <Alert title="Provider-authored content only / Chỉ nội dung do nhà cung cấp lập">
            {locale === 'vi'
              ? 'Không tự suy diễn chẩn đoán, thuốc hoặc hướng dẫn lâm sàng.'
              : 'Do not infer diagnoses, medications, or clinical instructions.'}
          </Alert>
          <form className="workflow-form" onSubmit={createDraft}>
            <Field label="Treating dentist ID" name="dentistId" required />
            <Field
              label="Treatment completed / Hoàn tất điều trị"
              name="completedAt"
              type="date"
              required
            />
            <TextAreaField label="Treatment summary / Tóm tắt điều trị" name="summary" required />
            <TextAreaField
              label="Discharge instructions / Hướng dẫn xuất viện"
              name="discharge"
              required
            />
            <TextAreaField
              label="Follow-up instructions / Hướng dẫn tái khám"
              name="followUp"
              required
            />
            <div className="workflow-form__two">
              <Field label="Procedure code" name="procedureCode" required />
              <Field label="Material / Vật liệu" name="material" required />
            </div>
            <Button disabled={sending} type="submit">
              {locale === 'vi' ? 'Tạo bản nháp' : 'Create draft'}
            </Button>
          </form>
        </Card>
      ) : null}
    </main>
  );
}
