import type { AppointmentView } from '@dental-trust/contracts';

export type AppointmentLifecycleMutation = 'reschedule' | 'cancel' | 'attendance';

export function appointmentMutationsAt(
  appointment: Pick<AppointmentView, 'endsAt' | 'startsAt' | 'status'>,
  now = Date.now(),
): readonly AppointmentLifecycleMutation[] {
  if (appointment.status !== 'TENTATIVE' && appointment.status !== 'CONFIRMED') return [];
  if (Date.parse(appointment.startsAt) > now) return ['reschedule', 'cancel'];
  if (Date.parse(appointment.endsAt) <= now) return ['attendance'];
  return [];
}
