'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import type { CaseDocumentView } from '@dental-trust/contracts/documents';
import type { Messages } from '@dental-trust/i18n';
import { Alert, Badge, Button, Card, Field, Icon } from '@dental-trust/ui';

interface FileRecord {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly status?: string;
  readonly scanStatus: string;
}

interface UploadInitiation {
  readonly fileAssetId?: string;
  readonly uploadUrl?: string;
  readonly requiredHeaders?: Record<string, string>;
  readonly status?: string;
  readonly scanStatus?: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function CaseRecordUpload({
  resourceId,
  files,
  messages,
}: {
  readonly resourceId: string;
  readonly files: readonly CaseDocumentView[];
  readonly messages: Messages;
}) {
  const [uploaded, setUploaded] = useState<FileRecord[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState(false);
  const active = useRef(true);
  const w = messages.workflows;

  useEffect(
    () => () => {
      active.current = false;
    },
    [],
  );

  const rows = useMemo(
    () => [
      ...files.map((file) => ({
        id: file.fileAssetId,
        name: file.originalFileName,
        size: file.sizeBytes,
        status: file.status,
        scanStatus: file.scanStatus,
      })),
      ...uploaded,
    ],
    [files, uploaded],
  );

  const uploadFiles = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selected = form.getAll('file').filter((value): value is File => value instanceof File);
    if (selected.length === 0 || selected.every((file) => file.size === 0)) return;
    setSending(true);
    setError(false);
    setNotice(false);
    try {
      for (const file of selected) {
        const initiated = await initiateUpload(resourceId, file);
        if (initiated.adapter !== 'development') {
          await putObject(file, initiated.data);
        }
        const finalized = await finalizeUpload(resourceId, initiated.data.fileAssetId);
        if (!active.current) return;
        setUploaded((current) => [
          ...current,
          {
            id: initiated.data.fileAssetId,
            name: file.name,
            size: file.size,
            status: finalized.status,
            scanStatus: finalized.scanStatus,
          },
        ]);
        if (!isTerminal(finalized.status, finalized.scanStatus)) {
          void pollUploadStatus(resourceId, initiated.data.fileAssetId, active, setUploaded);
        }
      }
      if (active.current) {
        setNotice(true);
        event.currentTarget.reset();
      }
    } catch {
      if (active.current) setError(true);
    } finally {
      if (active.current) setSending(false);
    }
  };

  return (
    <div className="workspace-grid">
      <Card className="workflow-card">
        <h2>{w.documents}</h2>
        {notice ? <Alert tone="success" title={messages.auth.success} /> : null}
        {error ? <Alert tone="danger" title={w.unavailable} /> : null}
        <div className="document-list">
          {rows.map((file) => (
            <div className="document-row" key={file.id}>
              <span className="document-row__icon">
                <Icon name="file" />
              </span>
              <div>
                <strong>{file.name}</strong>
                <small>{(file.size / 1_000_000).toFixed(1)} MB</small>
              </div>
              <Badge
                tone={
                  file.status === 'AVAILABLE' && file.scanStatus === 'CLEAN'
                    ? 'verified'
                    : 'attention'
                }
              >
                {file.status === 'REJECTED'
                  ? `REJECTED · ${file.scanStatus}`
                  : file.status === 'AVAILABLE' && file.scanStatus === 'CLEAN'
                    ? w.fileStatus
                    : file.scanStatus}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
      <Card className="side-card">
        <h2>{w.uploadNow}</h2>
        <form className="workflow-form" onSubmit={(event) => void uploadFiles(event)}>
          <Field
            accept=".pdf,.jpg,.jpeg,.png,.dcm"
            label={messages.forms.upload}
            multiple
            name="file"
            required
            type="file"
          />
          <p>{messages.forms.uploadHint}</p>
          <Button disabled={sending} type="submit">
            <Icon name="upload" />
            {sending ? messages.forms.submitting : w.uploadNow}
          </Button>
        </form>
      </Card>
    </div>
  );
}

async function initiateUpload(
  resourceId: string,
  file: File,
): Promise<{
  readonly adapter?: string;
  readonly data: Required<Pick<UploadInitiation, 'fileAssetId'>> & UploadInitiation;
}> {
  const response = await fetch('/api/portal/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'initiate',
      resourceId,
      fileName: file.name,
      declaredMediaType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      category: 'OTHER',
    }),
  });
  if (!response.ok) throw new Error('upload_initiation_failed');
  const envelope = (await response.json()) as { data?: UploadInitiation; adapter?: string };
  if (!envelope.data?.fileAssetId || !uuidPattern.test(envelope.data.fileAssetId)) {
    throw new Error('invalid_upload_initiation');
  }
  return {
    ...(envelope.adapter ? { adapter: envelope.adapter } : {}),
    data: { ...envelope.data, fileAssetId: envelope.data.fileAssetId },
  };
}

async function putObject(file: File, initiation: UploadInitiation): Promise<void> {
  if (!initiation.uploadUrl) throw new Error('missing_upload_url');
  const uploadUrl = new URL(initiation.uploadUrl);
  if (!['http:', 'https:'].includes(uploadUrl.protocol)) throw new Error('invalid_upload_url');
  const requiredHeaders = Object.fromEntries(
    Object.entries(initiation.requiredHeaders ?? {}).filter(
      ([name, value]) =>
        typeof value === 'string' &&
        (name.toLowerCase() === 'content-type' || name.toLowerCase().startsWith('x-amz-')),
    ),
  );
  const response = await fetch(uploadUrl, { method: 'PUT', headers: requiredHeaders, body: file });
  if (!response.ok) throw new Error('object_upload_failed');
}

async function finalizeUpload(
  resourceId: string,
  fileAssetId: string,
): Promise<{ readonly status: string; readonly scanStatus: string }> {
  const response = await fetch('/api/portal/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'finalize', resourceId, fileAssetId }),
  });
  if (!response.ok) throw new Error('upload_finalization_failed');
  const envelope = (await response.json()) as { data?: UploadInitiation };
  return {
    status: envelope.data?.status ?? 'SCANNING',
    scanStatus: envelope.data?.scanStatus ?? 'PENDING',
  };
}

async function pollUploadStatus(
  resourceId: string,
  fileAssetId: string,
  active: { readonly current: boolean },
  update: (operation: (files: FileRecord[]) => FileRecord[]) => void,
): Promise<void> {
  for (let attempt = 0; attempt < 10 && active.current; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    try {
      const query = new URLSearchParams({ resourceId, fileAssetId });
      const response = await fetch(`/api/portal/uploads?${query.toString()}`, {
        cache: 'no-store',
      });
      if (!response.ok) continue;
      const envelope = (await response.json()) as { data?: UploadInitiation };
      const status = envelope.data?.status;
      const scanStatus = envelope.data?.scanStatus;
      if (!status || !scanStatus || !active.current) continue;
      update((files) =>
        files.map((file) => (file.id === fileAssetId ? { ...file, status, scanStatus } : file)),
      );
      if (isTerminal(status, scanStatus)) return;
    } catch {
      // A transient poll failure does not alter the server-side scan state.
    }
  }
}

function isTerminal(status: string, scanStatus: string): boolean {
  return (
    status === 'AVAILABLE' ||
    status === 'REJECTED' ||
    scanStatus === 'ERROR' ||
    scanStatus === 'INFECTED'
  );
}
