import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

import PDFDocument from 'pdfkit';

import type { ServerEnvironment } from '@dental-trust/config/server';

const MAX_EXTERNAL_PDF_BYTES = 10 * 1024 * 1024;
const FONT_PATH = resolve(import.meta.dirname, '../../assets/fonts/NotoSans-Variable.ttf');

export interface PassportPdfInput {
  readonly caseNumber: string;
  readonly version: number;
  readonly schemaVersion: number;
  readonly clinicName: string;
  readonly dentistName: string;
  readonly treatmentCompletedAt: string;
  readonly treatmentSummary: string;
  readonly dischargeInstructions: string;
  readonly followUpInstructions: string;
  readonly implants: readonly {
    readonly toothNumber: number;
    readonly system: string;
    readonly manufacturer: string;
    readonly dimensions: string;
    readonly abutmentDetails?: string;
    readonly lotNumber?: string;
  }[];
  readonly materials: readonly {
    readonly procedureCode: string;
    readonly material: string;
    readonly manufacturer?: string;
    readonly lotNumber?: string;
  }[];
  readonly prescriptions: readonly {
    readonly medication: string;
    readonly dosage: string;
    readonly instructions: string;
    readonly prescribedAt: string;
  }[];
  readonly contentChecksum: string;
  readonly previousVersionChecksum?: string;
  readonly generatedAt: string;
}

export class PassportPdfProvider {
  constructor(private readonly environment: ServerEnvironment) {}

  async render(input: PassportPdfInput): Promise<Buffer> {
    if (this.environment.PASSPORT_PDF_ADAPTER === 'external') {
      return this.renderExternal(input);
    }
    return renderBuiltInPassport(input);
  }

  private async renderExternal(input: PassportPdfInput): Promise<Buffer> {
    const endpoint = this.environment.PASSPORT_PDF_SERVICE_URL;
    const token = this.environment.PASSPORT_PDF_SERVICE_TOKEN;
    if (!endpoint || !token) throw new Error('External passport PDF renderer is not configured.');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new Error(`External passport PDF renderer failed with ${response.status}.`);
    const mediaType = response.headers.get('content-type')?.split(';')[0]?.trim();
    if (mediaType !== 'application/pdf') {
      throw new Error('External passport PDF renderer returned an unexpected media type.');
    }
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > MAX_EXTERNAL_PDF_BYTES) {
      throw new Error('External passport PDF exceeds the configured size limit.');
    }
    const result = await readBoundedBody(response);
    assertPdf(result);
    return result;
  }
}

async function readBoundedBody(response: Response): Promise<Buffer> {
  if (!response.body) throw new Error('External passport PDF renderer returned no body.');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    totalBytes += chunk.value.byteLength;
    if (totalBytes > MAX_EXTERNAL_PDF_BYTES) {
      await reader.cancel('passport PDF size limit exceeded');
      throw new Error('External passport PDF exceeds the configured size limit.');
    }
    chunks.push(Buffer.from(chunk.value));
  }
  return Buffer.concat(chunks, totalBytes);
}

export async function renderBuiltInPassport(input: PassportPdfInput): Promise<Buffer> {
  await access(FONT_PATH);
  const generatedAt = new Date(input.generatedAt);
  if (Number.isNaN(generatedAt.valueOf())) throw new Error('Passport PDF timestamp is invalid.');
  const document = new PDFDocument({
    size: 'A4',
    margins: { top: 48, right: 48, bottom: 72, left: 48 },
    compress: false,
    bufferPages: true,
    info: {
      Title: `DENTAL TRUST Dental Passport ${input.caseNumber} v${input.version}`,
      Author: 'DENTAL TRUST',
      Subject: 'Provider-authored treatment record / Hồ sơ điều trị do nhà cung cấp lập',
      Keywords: `dental passport,${input.contentChecksum}`,
      CreationDate: generatedAt,
      ModDate: generatedAt,
    },
  });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolvePromise, reject) => {
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolvePromise(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  document.registerFont('NotoSans', FONT_PATH);
  document.font('NotoSans');

  drawHeader(document, input);
  drawSummary(document, input);
  drawCollection(document, 'Implants / Trụ implant', input.implants, (implant) => [
    `Tooth / Răng: ${implant.toothNumber}`,
    `System / Hệ thống: ${implant.system}`,
    `Manufacturer / Nhà sản xuất: ${implant.manufacturer}`,
    `Dimensions / Kích thước: ${implant.dimensions}`,
    ...(implant.abutmentDetails ? [`Abutment / Trụ phục hình: ${implant.abutmentDetails}`] : []),
    ...(implant.lotNumber ? [`Lot / Số lô: ${implant.lotNumber}`] : []),
  ]);
  drawCollection(document, 'Materials / Vật liệu', input.materials, (material) => [
    `Procedure / Thủ thuật: ${material.procedureCode}`,
    `Material / Vật liệu: ${material.material}`,
    ...(material.manufacturer ? [`Manufacturer / Nhà sản xuất: ${material.manufacturer}`] : []),
    ...(material.lotNumber ? [`Lot / Số lô: ${material.lotNumber}`] : []),
  ]);
  drawCollection(document, 'Prescriptions / Đơn thuốc', input.prescriptions, (prescription) => [
    `Medication / Thuốc: ${prescription.medication}`,
    `Dosage / Liều dùng: ${prescription.dosage}`,
    `Instructions / Hướng dẫn: ${prescription.instructions}`,
    `Prescribed / Ngày kê: ${prescription.prescribedAt}`,
  ]);
  drawIntegrity(document, input);
  addFooters(document, input);
  document.end();
  const output = await completed;
  assertPdf(output);
  return output;
}

function drawHeader(document: PDFKit.PDFDocument, input: PassportPdfInput): void {
  document
    .fillColor('#075985')
    .fontSize(10)
    .text('DENTAL TRUST', { characterSpacing: 1.4 })
    .moveDown(0.4)
    .fillColor('#0f172a')
    .fontSize(24)
    .text('Dental Passport / Hộ chiếu nha khoa')
    .moveDown(0.45)
    .fontSize(9.5)
    .fillColor('#475569')
    .text(
      'Provider-authored record. It does not replace an examination, diagnosis, prescription, or emergency care. / Hồ sơ do nhà cung cấp lập; không thay thế khám, chẩn đoán, kê đơn hoặc chăm sóc cấp cứu.',
    );
  document
    .moveDown(0.8)
    .roundedRect(48, document.y, 499, 70, 8)
    .fillAndStroke('#ecfeff', '#bae6fd');
  const y = document.y + 12;
  document
    .fillColor('#0f172a')
    .fontSize(10)
    .text(`Case / Hồ sơ: ${input.caseNumber}`, 62, y)
    .text(`Version / Phiên bản: ${input.version}`, 62, y + 17)
    .text(`Clinic / Phòng khám: ${input.clinicName}`, 285, y)
    .text(`Dentist / Nha sĩ: ${input.dentistName}`, 285, y + 17)
    .text(`Treatment completed / Hoàn tất điều trị: ${input.treatmentCompletedAt}`, 62, y + 34);
  document.y = y + 72;
}

function drawSummary(document: PDFKit.PDFDocument, input: PassportPdfInput): void {
  drawTextSection(document, 'Treatment summary / Tóm tắt điều trị', input.treatmentSummary);
  drawTextSection(
    document,
    'Discharge instructions / Hướng dẫn khi xuất viện',
    input.dischargeInstructions,
  );
  drawTextSection(
    document,
    'Follow-up instructions / Hướng dẫn tái khám',
    input.followUpInstructions,
  );
}

function drawTextSection(document: PDFKit.PDFDocument, title: string, body: string): void {
  ensureSpace(document, 90);
  document.moveDown(0.7).fillColor('#075985').fontSize(13).text(title);
  document.moveDown(0.25).fillColor('#1e293b').fontSize(10).text(body, { lineGap: 3 });
}

function drawCollection<T>(
  document: PDFKit.PDFDocument,
  title: string,
  items: readonly T[],
  lines: (item: T) => readonly string[],
): void {
  ensureSpace(document, 80);
  document.moveDown(0.8).fillColor('#075985').fontSize(13).text(title);
  if (items.length === 0) {
    document
      .moveDown(0.25)
      .fillColor('#64748b')
      .fontSize(10)
      .text('None recorded / Không ghi nhận');
    return;
  }
  for (const [index, item] of items.entries()) {
    const itemLines = lines(item);
    const content = `${index + 1}. ${itemLines.join('\n')}`;
    document.fontSize(10);
    const contentHeight = document.heightOfString(content, { width: 470, lineGap: 2 });
    if (contentHeight > 580) {
      ensureSpace(document, 60);
      document.moveDown(0.25).fillColor('#0f172a').text(content, { width: 470, lineGap: 2 });
      continue;
    }
    const height = Math.max(56, contentHeight + 20);
    ensureSpace(document, height + 18);
    const startY = document.y + 7;
    document.roundedRect(48, startY, 499, height, 6).fillAndStroke('#f8fafc', '#e2e8f0');
    document
      .fillColor('#0f172a')
      .fontSize(10)
      .text(content, 62, startY + 10, {
        width: 470,
        lineGap: 2,
      });
    document.y = startY + height + 3;
  }
}

function drawIntegrity(document: PDFKit.PDFDocument, input: PassportPdfInput): void {
  ensureSpace(document, 100);
  document
    .moveDown(0.8)
    .fillColor('#075985')
    .fontSize(13)
    .text('Integrity metadata / Siêu dữ liệu toàn vẹn')
    .moveDown(0.3)
    .fillColor('#334155')
    .fontSize(8.5)
    .text(`Schema: ${input.schemaVersion}`)
    .text(`Content SHA-256: ${input.contentChecksum}`)
    .text(`Previous version SHA-256: ${input.previousVersionChecksum ?? 'None / Không có'}`)
    .text(`Generated / Tạo lúc: ${input.generatedAt}`);
}

function addFooters(document: PDFKit.PDFDocument, input: PassportPdfInput): void {
  const range = document.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    document.switchToPage(page);
    const originalBottomMargin = document.page.margins.bottom;
    document.page.margins.bottom = 0;
    const footerLineY = document.page.height - 52;
    const footerTextY = footerLineY + 7;
    document
      .strokeColor('#cbd5e1')
      .moveTo(48, footerLineY)
      .lineTo(547, footerLineY)
      .stroke()
      .fillColor('#64748b')
      .fontSize(8)
      .text(`DENTAL TRUST - ${input.caseNumber}`, 48, footerTextY, {
        width: 330,
        lineBreak: false,
      })
      .text(`Page / Trang ${page + 1} of ${range.count}`, 420, footerTextY, {
        width: 127,
        align: 'right',
        lineBreak: false,
      });
    document.page.margins.bottom = originalBottomMargin;
  }
}

function ensureSpace(document: PDFKit.PDFDocument, points: number): void {
  if (document.y + points <= document.page.height - document.page.margins.bottom - 12) return;
  document.addPage();
}

function assertPdf(value: Buffer): void {
  if (
    value.length < 500 ||
    value.length > MAX_EXTERNAL_PDF_BYTES ||
    !value.subarray(0, 5).equals(Buffer.from('%PDF-'))
  ) {
    throw new Error('Passport renderer did not produce a valid bounded PDF.');
  }
}
