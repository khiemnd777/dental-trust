export const assistantActionCodes = [
  'NONE',
  'START_REQUEST',
  'COMPLETE_INTAKE',
  'VIEW_MATCHES',
  'REQUEST_CONSULTATION',
  'REVIEW_PLAN',
  'OPEN_BOOKING',
  'VIEW_JOURNEY',
  'HUMAN_SUPPORT',
  'EMERGENCY_CARE',
] as const;

export type AssistantActionCode = (typeof assistantActionCodes)[number];
export type AssistantSafetyLevel = 'ROUTINE' | 'ATTENTION' | 'URGENT';

export interface AssistantJourneyContext {
  readonly hasCase: boolean;
  readonly stage?: string;
  readonly hasAppointment: boolean;
  readonly hasCheckoutOption: boolean;
}

const urgentPatterns = [
  /kh[oô]ng (?:th[ởo]|h[oô] h[ấa]p)|kh[oó] th[ởo]|ngh[eẹ]t th[ởo]/iu,
  /ch[ảa]y m[aá]u (?:kh[oô]ng c[ầa]m|li[eê]n t[ụu]c|nhi[eề]u)/iu,
  /s[uư]ng (?:lan nhanh|m[aặ]t|c[ổo])|swell(?:ing)? (?:spreading|face|neck)/iu,
  /b[ấa]t t[ỉi]nh|m[ấa]t [yý] th[ứu]c|unconscious/iu,
  /ch[ấa]n th[uư][oơ]ng (?:n[ặa]ng|h[aà]m m[aặ]t)|severe (?:dental|facial) trauma/iu,
  /trouble breathing|cannot breathe|uncontrolled bleeding/iu,
] as const;

const attentionPatterns = [
  /s[oố]t|fever/iu,
  /s[uư]ng|swelling/iu,
  /[đd]au (?:d[ữu] d[ộo]i|nhi[eề]u|t[aă]ng)|severe pain/iu,
  /m[ủu]|nhi[eễ]m tr[uù]ng|infection|pus/iu,
  /g[aã]y r[aă]ng|r[aă]ng b[ịi] b[ậa]t|broken tooth|knocked[- ]out tooth/iu,
] as const;

export function classifyAssistantSafety(message: string): AssistantSafetyLevel {
  if (urgentPatterns.some((pattern) => pattern.test(message))) return 'URGENT';
  if (attentionPatterns.some((pattern) => pattern.test(message))) return 'ATTENTION';
  return 'ROUTINE';
}

export function assistantEmergencyReply(locale: 'vi-VN' | 'en-US'): string {
  if (locale === 'en-US') {
    return 'This may need urgent in-person care. Contact your local emergency service or go to the nearest emergency department now. Do not wait for a reply here.';
  }
  return 'Tình trạng này có thể cần được xử trí khẩn cấp trực tiếp. Hãy gọi dịch vụ cấp cứu tại nơi bạn đang ở hoặc đến khoa cấp cứu gần nhất ngay bây giờ; đừng chờ phản hồi trong ứng dụng.';
}

export function permittedAssistantActions(
  context: AssistantJourneyContext,
  safety: AssistantSafetyLevel,
): ReadonlySet<AssistantActionCode> {
  if (safety === 'URGENT') return new Set(['EMERGENCY_CARE', 'HUMAN_SUPPORT']);

  const actions = new Set<AssistantActionCode>(['NONE', 'HUMAN_SUPPORT', 'VIEW_JOURNEY']);
  if (!context.hasCase) actions.add('START_REQUEST');
  if (context.hasCheckoutOption) actions.add('OPEN_BOOKING');

  switch (context.stage) {
    case 'DISCOVERY':
    case 'INTAKE':
      actions.add('COMPLETE_INTAKE');
      break;
    case 'MATCHING':
      actions.add('VIEW_MATCHES');
      actions.add('REQUEST_CONSULTATION');
      break;
    case 'PLAN_REVIEW':
      actions.add('REVIEW_PLAN');
      actions.add('REQUEST_CONSULTATION');
      break;
    case 'BOOKING':
      actions.add('REQUEST_CONSULTATION');
      break;
    default:
      if (context.hasCase && !context.hasAppointment) actions.add('REQUEST_CONSULTATION');
  }
  return actions;
}

export function normalizeAssistantAction(
  requested: AssistantActionCode,
  context: AssistantJourneyContext,
  safety: AssistantSafetyLevel,
): AssistantActionCode {
  if (safety === 'URGENT') return 'EMERGENCY_CARE';
  return permittedAssistantActions(context, safety).has(requested) ? requested : 'NONE';
}
