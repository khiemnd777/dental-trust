import { forwardCareFormData } from '@/lib/care-actions';

export async function POST(request: Request) {
  return forwardCareFormData('/assistant/transcriptions', await request.formData(), 35_000);
}
