'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type { Locale, Messages } from '@dental-trust/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Icon,
  SelectField,
  Skeleton,
  TextAreaField,
} from '@dental-trust/ui';

type GovernanceView =
  'content' | 'taxonomy' | 'templates' | 'feature-flags' | 'configuration' | 'locations';
type GovernanceRecord = Record<string, unknown>;

const supported = new Set(['admin:content', 'admin:taxonomy', 'admin:flags']);

const copy = {
  en: {
    tabs: {
      'feature-flags': 'Feature flags',
      configuration: 'Configuration',
      locations: 'Locales',
    },
    content: 'Content versions',
    taxonomy: 'Service and procedure taxonomy',
    templates: 'Localized notification templates',
    'feature-flags': 'Versioned feature flags',
    configuration: 'Non-secret system configuration',
    locations: 'Country, city, and locale configuration',
    add: 'Create version',
    edit: 'Create next version',
    key: 'Key or slug',
    status: 'Status',
    version: 'Version',
    details: 'Details',
    updated: 'Updated',
    title: 'Title',
    summary: 'Summary',
    body: 'Body',
    locale: 'Locale',
    reason: 'Reason and evidence',
    reasonHint: 'Include the approved ticket and business reason. Minimum 12 characters.',
    confirmation: 'I confirm this governed administrative change.',
    save: 'Save immutable version',
    saved: 'The governed version was saved, audited, and queued for downstream processing.',
    active: 'Active',
    enabled: 'Enabled',
    vietnameseName: 'Vietnamese name',
    englishName: 'English name',
    kind: 'Record type',
    code: 'Code',
    parentId: 'Parent category ID (optional)',
    categoryId: 'Service category ID',
    vietnameseDescription: 'Vietnamese description',
    englishDescription: 'English description',
    category: 'Notification category',
    channel: 'Channel',
    subject: 'Subject',
    description: 'Description',
    environment: 'Environment',
    audiences: 'Audiences (comma-separated)',
    valueType: 'Value type',
    value: 'Value',
    currency: 'Currency',
    callingCode: 'Calling code',
    timezone: 'IANA timezone',
    countryId: 'Country ID',
    isDefault: 'Default locale',
    cancel: 'Cancel',
  },
  vi: {
    tabs: { 'feature-flags': 'Cờ tính năng', configuration: 'Cấu hình', locations: 'Ngôn ngữ' },
    content: 'Phiên bản nội dung',
    taxonomy: 'Phân loại dịch vụ và thủ thuật',
    templates: 'Mẫu thông báo đa ngôn ngữ',
    'feature-flags': 'Cờ tính năng có phiên bản',
    configuration: 'Cấu hình hệ thống không chứa bí mật',
    locations: 'Cấu hình quốc gia, thành phố và ngôn ngữ',
    add: 'Tạo phiên bản',
    edit: 'Tạo phiên bản tiếp theo',
    key: 'Khóa hoặc đường dẫn',
    status: 'Trạng thái',
    version: 'Phiên bản',
    details: 'Chi tiết',
    updated: 'Cập nhật',
    title: 'Tiêu đề',
    summary: 'Tóm tắt',
    body: 'Nội dung',
    locale: 'Ngôn ngữ',
    reason: 'Lý do và bằng chứng',
    reasonHint: 'Nêu mã yêu cầu đã duyệt và lý do nghiệp vụ. Tối thiểu 12 ký tự.',
    confirmation: 'Tôi xác nhận thay đổi quản trị có kiểm soát này.',
    save: 'Lưu phiên bản bất biến',
    saved: 'Phiên bản đã được lưu, kiểm toán và đưa vào hàng đợi xử lý.',
    active: 'Đang hoạt động',
    enabled: 'Đang bật',
    vietnameseName: 'Tên tiếng Việt',
    englishName: 'Tên tiếng Anh',
    kind: 'Loại bản ghi',
    code: 'Mã',
    parentId: 'Mã danh mục cha (không bắt buộc)',
    categoryId: 'Mã danh mục dịch vụ',
    vietnameseDescription: 'Mô tả tiếng Việt',
    englishDescription: 'Mô tả tiếng Anh',
    category: 'Nhóm thông báo',
    channel: 'Kênh',
    subject: 'Chủ đề',
    description: 'Mô tả',
    environment: 'Môi trường',
    audiences: 'Nhóm người dùng (phân cách bằng dấu phẩy)',
    valueType: 'Kiểu giá trị',
    value: 'Giá trị',
    currency: 'Tiền tệ',
    callingCode: 'Mã điện thoại',
    timezone: 'Múi giờ IANA',
    countryId: 'Mã quốc gia',
    isDefault: 'Ngôn ngữ mặc định',
    cancel: 'Hủy',
  },
} as const;

export function isAdminGovernanceWorkspace(area: string, pageKey: string) {
  return supported.has(`${area}:${pageKey}`);
}

export function AdminGovernanceWorkspace({
  pageKey,
  title,
  description,
  locale,
  messages,
}: {
  readonly pageKey: string;
  readonly title: string;
  readonly description: string;
  readonly locale: Locale;
  readonly messages: Messages;
  readonly development: boolean;
}) {
  const language = locale.startsWith('vi') ? 'vi' : 'en';
  const [flagView, setFlagView] = useState<GovernanceView>('feature-flags');
  const view: GovernanceView =
    pageKey === 'content' ? 'content' : pageKey === 'taxonomy' ? 'taxonomy' : flagView;
  return (
    <main className="portal-content" id="main-content">
      <div className="portal-heading">
        <div>
          <p className="eyebrow">
            {messages.portal.sections.admin} · {messages.portal.secure}
          </p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <Badge tone="info">
          <Icon name="shield" />
          {messages.portal.secure}
        </Badge>
      </div>
      {pageKey === 'flags' ? (
        <div aria-label={title} className="filter-tabs" role="tablist">
          {(['feature-flags', 'configuration', 'locations'] as const).map((candidate) => (
            <Button
              aria-selected={view === candidate}
              key={candidate}
              role="tab"
              size="sm"
              variant={view === candidate ? 'primary' : 'quiet'}
              onClick={() => setFlagView(candidate)}
            >
              {copy[language].tabs[candidate]}
            </Button>
          ))}
        </div>
      ) : null}
      <GovernancePanel locale={locale} messages={messages} view={view} />
    </main>
  );
}

export function NotificationTemplateGovernancePanel({
  locale,
  messages,
}: {
  readonly locale: Locale;
  readonly messages: Messages;
}) {
  return <GovernancePanel locale={locale} messages={messages} view="templates" />;
}

function GovernancePanel({
  locale,
  messages,
  view,
}: {
  readonly locale: Locale;
  readonly messages: Messages;
  readonly view: GovernanceView;
}) {
  const language = locale.startsWith('vi') ? 'vi' : 'en';
  const t = copy[language];
  const [records, setRecords] = useState<GovernanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState(false);
  const [selected, setSelected] = useState<GovernanceRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(`/api/portal/admin-governance?view=${view}`, {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) throw new Error('admin_governance_unavailable');
      const envelope = (await response.json()) as { data?: unknown };
      if (!Array.isArray(envelope.data)) throw new Error('invalid_admin_governance_data');
      setRecords(envelope.data as GovernanceRecord[]);
    },
    [view],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setCreating(false);
    setSelected(null);
    void load(controller.signal)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [load]);

  const submit = async (command: Record<string, unknown>) => {
    setSending(true);
    setError(false);
    setNotice(false);
    try {
      const response = await fetch('/api/portal/admin-governance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ view, command, idempotencyKey: crypto.randomUUID() }),
      });
      if (!response.ok) throw new Error('governance_change_rejected');
      await load();
      setSelected(null);
      setCreating(false);
      setNotice(true);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-labelledby={`governance-${view}`} style={{ marginTop: '1rem' }}>
      <div className="workspace-card__head" style={{ padding: 0 }}>
        <div>
          <h2 id={`governance-${view}`}>{t[view]}</h2>
          <p>{governanceDescription(view, language)}</p>
        </div>
        <Button
          onClick={() => {
            setSelected(null);
            setCreating(true);
          }}
        >
          <Icon name="plus" />
          {t.add}
        </Button>
      </div>
      {notice ? <Alert tone="success" title={t.saved} /> : null}
      {error ? (
        <Alert tone="danger" title={messages.common.errorTitle}>
          {messages.common.errorBody}
        </Alert>
      ) : null}
      {loading ? (
        <Card style={{ marginTop: '1rem', padding: '1rem' }}>
          <Skeleton style={{ height: '10rem' }} />
        </Card>
      ) : records.length ? (
        <GovernanceTable
          locale={locale}
          records={records}
          text={t}
          onSelect={(record) => {
            setSelected(record);
            setCreating(true);
          }}
        />
      ) : (
        <EmptyState title={messages.common.emptyTitle} body={messages.common.emptyBody} />
      )}
      {creating ? (
        <GovernanceForm
          key={`${view}:${recordId(selected) ?? 'new'}`}
          locale={language}
          record={selected}
          sending={sending}
          view={view}
          onCancel={() => {
            setCreating(false);
            setSelected(null);
          }}
          onSubmit={(command) => void submit(command)}
        />
      ) : null}
    </section>
  );
}

function GovernanceTable({
  records,
  locale,
  text,
  onSelect,
}: {
  readonly records: readonly GovernanceRecord[];
  readonly locale: Locale;
  readonly text: (typeof copy)['en'] | (typeof copy)['vi'];
  readonly onSelect: (record: GovernanceRecord) => void;
}) {
  return (
    <Card className="workspace-card" style={{ marginTop: '1rem' }}>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{text.key}</th>
              <th>{text.status}</th>
              <th>{text.version}</th>
              <th>{text.details}</th>
              <th>{text.updated}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={recordId(record)}>
                <td className="data-table__primary" data-label={text.key}>
                  {recordLabel(record, locale)}
                </td>
                <td data-label={text.status}>
                  <Badge tone={recordEnabled(record) ? 'verified' : 'info'}>
                    {recordStatus(record)}
                  </Badge>
                </td>
                <td data-label={text.version}>{recordVersion(record)}</td>
                <td data-label={text.details}>{recordDetails(record, locale)}</td>
                <td data-label={text.updated}>{formatDate(recordDate(record), locale)}</td>
                <td data-label={text.edit}>
                  <Button size="sm" variant="secondary" onClick={() => onSelect(record)}>
                    {text.edit}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GovernanceForm({
  view,
  record,
  locale,
  sending,
  onCancel,
  onSubmit,
}: {
  readonly view: GovernanceView;
  readonly record: GovernanceRecord | null;
  readonly locale: 'en' | 'vi';
  readonly sending: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (command: Record<string, unknown>) => void;
}) {
  const t = copy[locale];
  const [kind, setKind] = useState(
    stringValue(record, 'kind') ?? (view === 'locations' ? 'country' : 'service_category'),
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('confirmed') !== 'on' || !event.currentTarget.reportValidity()) return;
    onSubmit(buildCommand(view, kind, form, record));
  };
  return (
    <Card style={{ marginTop: '1rem', padding: '1.2rem' }}>
      <form className="auth-form" onSubmit={submit}>
        {view === 'content' ? <ContentFields record={record} text={t} /> : null}
        {view === 'taxonomy' ? (
          <TaxonomyFields kind={kind} record={record} text={t} onKind={setKind} />
        ) : null}
        {view === 'templates' ? <TemplateFields record={record} text={t} /> : null}
        {view === 'feature-flags' ? <FlagFields record={record} text={t} /> : null}
        {view === 'configuration' ? <ConfigurationFields record={record} text={t} /> : null}
        {view === 'locations' ? (
          <LocationFields kind={kind} record={record} text={t} onKind={setKind} />
        ) : null}
        <TextAreaField hint={t.reasonHint} label={t.reason} minLength={12} name="reason" required />
        <Checkbox label={t.confirmation} name="confirmed" required />
        <div className="button-row">
          <Button disabled={sending} type="submit">
            {t.save}
          </Button>
          <Button type="button" variant="quiet" onClick={onCancel}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ContentFields({ record, text }: FieldGroupProps) {
  return (
    <>
      <Field defaultValue={stringValue(record, 'slug')} label={text.key} name="slug" required />
      <SelectField
        defaultValue={stringValue(record, 'locale') ?? 'vi-VN'}
        label={text.locale}
        name="locale"
      >
        <option value="vi-VN">vi-VN</option>
        <option value="en-US">en-US</option>
      </SelectField>
      <Field defaultValue={stringValue(record, 'title')} label={text.title} name="title" required />
      <Field defaultValue={stringValue(record, 'summary')} label={text.summary} name="summary" />
      <TextAreaField label={text.body} minLength={20} name="body" required />
      <PublicationField record={record} text={text} />
    </>
  );
}

function TaxonomyFields({ kind, record, text, onKind }: KindFieldGroupProps) {
  return (
    <>
      <SelectField
        label={text.kind}
        name="kind"
        value={kind}
        onChange={(event) => onKind(event.target.value)}
      >
        <option value="service_category">Service category</option>
        <option value="procedure">Procedure</option>
      </SelectField>
      <Field defaultValue={stringValue(record, 'code')} label={text.code} name="code" required />
      <LocalizedNameFields record={record} text={text} />
      {kind === 'service_category' ? (
        <Field
          defaultValue={stringValue(record, 'parentId')}
          label={text.parentId}
          name="parentId"
        />
      ) : (
        <>
          <Field
            defaultValue={stringValue(record, 'serviceCategoryId')}
            label={text.categoryId}
            name="serviceCategoryId"
            required
          />
          <Field label={text.vietnameseDescription} name="descriptionVi" required />
          <Field label={text.englishDescription} name="descriptionEn" required />
        </>
      )}
      <Checkbox
        defaultChecked={booleanValue(record, 'active', true)}
        label={text.active}
        name="active"
      />
    </>
  );
}

function TemplateFields({ record, text }: FieldGroupProps) {
  const latest = objectValue(record, 'latestVersion');
  return (
    <>
      <Field defaultValue={stringValue(record, 'key')} label={text.key} name="key" required />
      <SelectField
        defaultValue={stringValue(record, 'category') ?? 'CASE_UPDATES'}
        label={text.category}
        name="category"
      >
        {notificationCategories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </SelectField>
      <SelectField
        defaultValue={stringValue(record, 'channel') ?? 'EMAIL'}
        label={text.channel}
        name="channel"
      >
        {['IN_APP', 'EMAIL', 'SMS', 'MESSAGING'].map((channel) => (
          <option key={channel} value={channel}>
            {channel}
          </option>
        ))}
      </SelectField>
      <SelectField
        defaultValue={stringValue(record, 'locale') ?? 'vi-VN'}
        label={text.locale}
        name="locale"
      >
        <option value="vi-VN">vi-VN</option>
        <option value="en-US">en-US</option>
      </SelectField>
      <Field
        defaultValue={stringValue(latest, 'subject')}
        label={text.subject}
        name="subject"
        required
      />
      <TextAreaField label={text.body} minLength={20} name="body" required />
      <PublicationField record={latest} text={text} />
    </>
  );
}

function FlagFields({ record, text }: FieldGroupProps) {
  const latest = objectValue(record, 'latestVersion');
  return (
    <>
      <Field defaultValue={stringValue(record, 'key')} label={text.key} name="key" required />
      <TextAreaField
        defaultValue={stringValue(record, 'description')}
        label={text.description}
        name="description"
        required
      />
      <SelectField
        defaultValue={stringValue(latest, 'environment') ?? 'production'}
        label={text.environment}
        name="environment"
      >
        {['development', 'test', 'staging', 'production', 'all'].map((environment) => (
          <option key={environment} value={environment}>
            {environment}
          </option>
        ))}
      </SelectField>
      <Field
        defaultValue={arrayValue(latest, 'audiences').join(', ')}
        label={text.audiences}
        name="audiences"
      />
      <Checkbox
        defaultChecked={booleanValue(latest, 'enabled')}
        label={text.enabled}
        name="enabled"
      />
    </>
  );
}

function ConfigurationFields({ record, text }: FieldGroupProps) {
  const latest = objectValue(record, 'latestVersion');
  return (
    <>
      <Field defaultValue={stringValue(record, 'key')} label={text.key} name="key" required />
      <TextAreaField
        defaultValue={stringValue(record, 'description')}
        label={text.description}
        name="description"
        required
      />
      <SelectField
        defaultValue={stringValue(record, 'valueType') ?? 'STRING'}
        label={text.valueType}
        name="valueType"
      >
        {['STRING', 'BOOLEAN', 'INTEGER', 'DECIMAL'].map((valueType) => (
          <option key={valueType} value={valueType}>
            {valueType}
          </option>
        ))}
      </SelectField>
      <Field defaultValue={stringValue(latest, 'value')} label={text.value} name="value" required />
    </>
  );
}

function LocationFields({ kind, record, text, onKind }: KindFieldGroupProps) {
  return (
    <>
      <SelectField
        label={text.kind}
        name="kind"
        value={kind}
        onChange={(event) => onKind(event.target.value)}
      >
        <option value="country">Country</option>
        <option value="city">City</option>
        <option value="locale">Locale</option>
      </SelectField>
      {kind === 'locale' ? (
        <SelectField
          defaultValue={stringValue(record, 'locale') ?? 'vi-VN'}
          label={text.locale}
          name="locale"
        >
          <option value="vi-VN">vi-VN</option>
          <option value="en-US">en-US</option>
        </SelectField>
      ) : (
        <Field defaultValue={stringValue(record, 'code')} label={text.code} name="code" required />
      )}
      <LocalizedNameFields record={record} text={text} />
      {kind === 'country' ? (
        <>
          <SelectField
            defaultValue={stringValue(record, 'currency') ?? 'VND'}
            label={text.currency}
            name="currency"
          >
            <option value="VND">VND</option>
            <option value="USD">USD</option>
          </SelectField>
          <Field
            defaultValue={stringValue(record, 'callingCode')}
            label={text.callingCode}
            name="callingCode"
            required
          />
        </>
      ) : null}
      {kind === 'city' ? (
        <>
          <Field
            defaultValue={stringValue(record, 'countryId')}
            label={text.countryId}
            name="countryId"
            required
          />
          <Field
            defaultValue={stringValue(record, 'timezone')}
            label={text.timezone}
            name="timezone"
            required
          />
        </>
      ) : null}
      <Checkbox
        defaultChecked={booleanValue(record, 'active', true)}
        label={text.active}
        name="active"
      />
      {kind === 'locale' ? (
        <Checkbox
          defaultChecked={booleanValue(record, 'isDefault')}
          label={text.isDefault}
          name="isDefault"
        />
      ) : null}
    </>
  );
}

function LocalizedNameFields({ record, text }: FieldGroupProps) {
  const names = objectValue(record, 'names');
  return (
    <>
      <Field
        defaultValue={stringValue(names, 'vi-VN')}
        label={text.vietnameseName}
        name="nameVi"
        required
      />
      <Field
        defaultValue={stringValue(names, 'en-US')}
        label={text.englishName}
        name="nameEn"
        required
      />
    </>
  );
}

function PublicationField({ record, text }: FieldGroupProps) {
  return (
    <SelectField
      defaultValue={stringValue(record, 'publicationStatus') ?? 'DRAFT'}
      label={text.status}
      name="publicationStatus"
    >
      <option value="DRAFT">DRAFT</option>
      <option value="PUBLISHED">PUBLISHED</option>
      <option value="ARCHIVED">ARCHIVED</option>
    </SelectField>
  );
}

interface FieldGroupProps {
  readonly record: GovernanceRecord | null;
  readonly text: (typeof copy)['en'] | (typeof copy)['vi'];
}
interface KindFieldGroupProps extends FieldGroupProps {
  readonly kind: string;
  readonly onKind: (kind: string) => void;
}

function buildCommand(
  view: GovernanceView,
  kind: string,
  form: FormData,
  record: GovernanceRecord | null,
) {
  const reason = value(form, 'reason');
  const expectedVersion = recordVersion(record);
  if (view === 'content')
    return {
      slug: value(form, 'slug'),
      locale: value(form, 'locale'),
      expectedVersion,
      title: value(form, 'title'),
      ...(value(form, 'summary') ? { summary: value(form, 'summary') } : {}),
      body: value(form, 'body'),
      publicationStatus: value(form, 'publicationStatus'),
      reason,
      confirmation: 'SAVE CONTENT VERSION',
    };
  if (view === 'templates')
    return {
      key: value(form, 'key'),
      category: value(form, 'category'),
      channel: value(form, 'channel'),
      locale: value(form, 'locale'),
      expectedVersion,
      subject: value(form, 'subject'),
      body: value(form, 'body'),
      publicationStatus: value(form, 'publicationStatus'),
      reason,
      confirmation: 'SAVE NOTIFICATION TEMPLATE',
    };
  if (view === 'feature-flags')
    return {
      key: value(form, 'key'),
      description: value(form, 'description'),
      expectedVersion,
      enabled: checked(form, 'enabled'),
      environment: value(form, 'environment'),
      audiences: value(form, 'audiences')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      reason,
      confirmation: 'CHANGE FEATURE FLAG',
    };
  if (view === 'configuration')
    return {
      key: value(form, 'key'),
      description: value(form, 'description'),
      valueType: value(form, 'valueType'),
      expectedVersion,
      value: value(form, 'value'),
      reason,
      confirmation: 'CHANGE SYSTEM CONFIGURATION',
    };
  if (view === 'taxonomy') {
    const base = {
      kind,
      code: value(form, 'code'),
      names: { 'vi-VN': value(form, 'nameVi'), 'en-US': value(form, 'nameEn') },
      active: checked(form, 'active'),
      expectedVersion,
      reason,
      confirmation: 'CHANGE TAXONOMY',
    };
    return kind === 'procedure'
      ? {
          ...base,
          serviceCategoryId: value(form, 'serviceCategoryId'),
          descriptions: {
            'vi-VN': value(form, 'descriptionVi'),
            'en-US': value(form, 'descriptionEn'),
          },
        }
      : { ...base, parentId: value(form, 'parentId') || null };
  }
  const base = {
    kind,
    ...(recordId(record) ? { id: recordId(record) } : {}),
    names: { 'vi-VN': value(form, 'nameVi'), 'en-US': value(form, 'nameEn') },
    active: checked(form, 'active'),
    expectedVersion,
    reason,
    confirmation: 'CHANGE LOCATION CONFIGURATION',
  };
  if (kind === 'country')
    return {
      ...base,
      code: value(form, 'code'),
      currency: value(form, 'currency'),
      callingCode: value(form, 'callingCode'),
    };
  if (kind === 'city')
    return {
      ...base,
      countryId: value(form, 'countryId'),
      code: value(form, 'code'),
      timezone: value(form, 'timezone'),
    };
  return {
    ...base,
    locale: value(form, 'locale'),
    isDefault: checked(form, 'isDefault'),
  };
}

const notificationCategories = [
  'ACCOUNT_SECURITY',
  'CASE_UPDATES',
  'MISSING_DOCUMENTS',
  'TREATMENT_PLANS',
  'CONSULTATIONS',
  'APPOINTMENTS',
  'PAYMENTS',
  'TRAVEL_PREPARATION',
  'TREATMENT_MILESTONES',
  'AFTERCARE',
  'INCIDENTS',
  'WARRANTY',
  'VERIFICATION_EXPIRY',
  'ADMINISTRATIVE_ALERTS',
] as const;

function governanceDescription(view: GovernanceView, locale: 'en' | 'vi') {
  const descriptions = {
    en: {
      content:
        'Every save creates immutable localized history; publishing never overwrites a prior version.',
      taxonomy:
        'Optimistic version checks protect clinic-service references while categories evolve.',
      templates:
        'Published copy is versioned by key, channel, and locale; secure data remains in the portal.',
      'feature-flags':
        'Every environment change is append-only, reasoned, confirmed, and auditable.',
      configuration:
        'Only validated non-secret values belong here; credentials remain in secret management.',
      locations: 'Supported locales and locations use bilingual names and optimistic concurrency.',
    },
    vi: {
      content:
        'Mỗi lần lưu tạo lịch sử đa ngôn ngữ bất biến; xuất bản không ghi đè phiên bản trước.',
      taxonomy: 'Kiểm tra phiên bản bảo vệ tham chiếu dịch vụ khi hệ thống phân loại thay đổi.',
      templates:
        'Nội dung được quản lý theo khóa, kênh và ngôn ngữ; dữ liệu riêng tư vẫn ở trong cổng.',
      'feature-flags': 'Mọi thay đổi môi trường đều có phiên bản, lý do, xác nhận và kiểm toán.',
      configuration:
        'Chỉ lưu giá trị không bí mật đã được kiểm tra; thông tin xác thực ở kho bí mật.',
      locations: 'Ngôn ngữ và địa điểm được hỗ trợ có tên song ngữ và kiểm soát đồng thời.',
    },
  } as const;
  return descriptions[locale][view];
}

function value(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim();
}
function checked(form: FormData, key: string) {
  return form.get(key) === 'on';
}
function objectValue(record: GovernanceRecord | null, key: string): GovernanceRecord | null {
  const candidate = record?.[key];
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? (candidate as GovernanceRecord)
    : null;
}
function stringValue(record: GovernanceRecord | null, key: string) {
  const candidate = record?.[key];
  return typeof candidate === 'string' ? candidate : undefined;
}
function booleanValue(record: GovernanceRecord | null, key: string, fallback = false) {
  const candidate = record?.[key];
  return typeof candidate === 'boolean' ? candidate : fallback;
}
function arrayValue(record: GovernanceRecord | null, key: string) {
  const candidate = record?.[key];
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === 'string')
    : [];
}
function recordId(record: GovernanceRecord | null) {
  return stringValue(record, 'id');
}
function recordVersion(record: GovernanceRecord | null) {
  const direct = record?.version;
  if (typeof direct === 'number') return direct;
  const latest = objectValue(record, 'latestVersion');
  return typeof latest?.version === 'number' ? latest.version : 0;
}
function recordLabel(record: GovernanceRecord, locale: Locale) {
  const names = objectValue(record, 'names');
  return (
    stringValue(record, 'title') ??
    stringValue(record, 'key') ??
    stringValue(record, 'code') ??
    stringValue(record, 'locale') ??
    stringValue(names, locale.startsWith('vi') ? 'vi-VN' : 'en-US') ??
    recordId(record) ??
    '—'
  );
}
function recordStatus(record: GovernanceRecord) {
  const latest = objectValue(record, 'latestVersion');
  return (
    stringValue(record, 'publicationStatus') ??
    stringValue(latest, 'publicationStatus') ??
    (recordEnabled(record) ? 'ACTIVE' : 'INACTIVE')
  );
}
function recordEnabled(record: GovernanceRecord) {
  const latest = objectValue(record, 'latestVersion');
  return booleanValue(latest, 'enabled', booleanValue(record, 'active', true));
}
function recordDetails(record: GovernanceRecord, locale: Locale) {
  const latest = objectValue(record, 'latestVersion');
  const names = objectValue(record, 'names');
  return (
    stringValue(latest, 'subject') ??
    stringValue(record, 'description') ??
    stringValue(latest, 'value') ??
    stringValue(record, 'summary') ??
    stringValue(record, 'timezone') ??
    stringValue(names, locale.startsWith('vi') ? 'vi-VN' : 'en-US') ??
    '—'
  );
}
function recordDate(record: GovernanceRecord) {
  const latest = objectValue(record, 'latestVersion');
  return (
    stringValue(latest, 'createdAt') ??
    stringValue(record, 'updatedAt') ??
    stringValue(record, 'createdAt') ??
    ''
  );
}
function formatDate(value: string, locale: Locale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value || '—'
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}
