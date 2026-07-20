import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@dental-trust/ui/styles.css';
import './styles.css';
import { logoutOperationsAction } from '@/app/actions';
import { OperationsShell } from '@/components/operations-shell';
import { requireOperationsSession } from '@/lib/require-session';
export const metadata: Metadata = {
  title: 'Dental Trust Operations',
  description: 'Coordination, verification, and platform administration console.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#081b2c' };
export default async function Layout({ children }: { children: ReactNode }) {
  const session = await requireOperationsSession();
  const initials = session.roles.some((role) => ['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(role))
    ? 'AD'
    : session.roles.includes('VERIFICATION_OFFICER')
      ? 'VO'
      : session.roles.includes('CONCIERGE_AGENT')
        ? 'ĐP'
        : session.roles.includes('FINANCE_ADMIN')
          ? 'FA'
          : session.roles.includes('CONTENT_ADMIN')
            ? 'CA'
            : session.roles.includes('SUPPORT_AGENT')
              ? 'SA'
              : 'OP';
  const label = session.roles.includes('SUPER_ADMIN')
    ? 'Quản trị nền tảng'
    : session.roles.includes('VERIFICATION_OFFICER')
      ? 'Chuyên viên xác minh'
      : session.roles.includes('CONCIERGE_AGENT')
        ? 'Điều phối viên'
        : session.roles.includes('FINANCE_ADMIN')
          ? 'Quản trị tài chính'
          : session.roles.includes('CONTENT_ADMIN')
            ? 'Quản trị nội dung'
            : session.roles.includes('SUPPORT_AGENT')
              ? 'Chuyên viên hỗ trợ'
              : 'Operations member';
  return (
    <html lang="vi">
      <body>
        <OperationsShell
          logout={logoutOperationsAction}
          mfaRequired={!session.mfaVerified}
          roles={session.roles}
          userInitials={initials}
          userLabel={label}
        >
          {children}
        </OperationsShell>
      </body>
    </html>
  );
}
