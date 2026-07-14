import type { Metadata } from 'next';

import { CareBooking } from '@/components/care-booking';
import { getBookingOptions } from '@/lib/care-data';

export const metadata: Metadata = { title: 'Booking' };

export default async function BookingPage() {
  return <CareBooking options={await getBookingOptions()} />;
}
