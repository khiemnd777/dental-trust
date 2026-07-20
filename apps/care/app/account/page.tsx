import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon, type IconName } from '@/components/icon';
import { logoutCareAction } from '@/lib/account-actions';
import { getAccountData } from '@/lib/care-data';
import { initials } from '@/lib/presentation';

import styles from './account.module.css';

export const metadata: Metadata = { title: 'Tài khoản' };

const sections: readonly {
  title: string;
  rows: readonly { href: string; icon: IconName; label: string }[];
}[] = [
  {
    title: 'Hồ sơ',
    rows: [
      {
        href: '/account/profile',
        icon: 'user',
        label: 'Thông tin cá nhân',
      },
      {
        href: '/account/documents',
        icon: 'document',
        label: 'Tài liệu nha khoa',
      },
      {
        href: '/account/saved',
        icon: 'heart',
        label: 'Phòng khám đã lưu',
      },
    ],
  },
  {
    title: 'Cài đặt',
    rows: [
      {
        href: '/account/privacy',
        icon: 'lock',
        label: 'Quyền riêng tư',
      },
      {
        href: '/account/preferences',
        icon: 'bell',
        label: 'Thông báo & ngôn ngữ',
      },
      {
        href: '/account/help',
        icon: 'support',
        label: 'Trợ giúp',
      },
    ],
  },
];

function verificationLabel(status: string) {
  if (status === 'VERIFIED' || status === 'ACTIVE') return 'Đã xác minh';
  if (status === 'VERIFICATION_EXPIRING') return 'Xác minh sắp hết hạn';
  if (status === 'PENDING' || status === 'UNDER_REVIEW') return 'Đang xác minh';
  return 'Xem trạng thái xác minh';
}

export default async function AccountPage() {
  const { profile, saved } = await getAccountData();
  const fullName = profile?.identity?.fullName ?? profile?.email ?? 'Tài khoản của bạn';
  const locale = profile?.preferredLocale === 'en-US' ? 'English' : 'Tiếng Việt';
  const currency = profile?.preferredCurrency ?? 'VND';

  return (
    <main className={`care-main ${styles.page}`}>
      <header className={styles.profileCard}>
        <div className={styles.profileIdentity}>
          <span className={styles.avatar}>{initials(fullName)}</span>
          <div>
            <h1>{fullName}</h1>
            {profile?.email ? <p>{profile.email}</p> : null}
          </div>
          <Link href="/account/profile">Chỉnh sửa</Link>
        </div>

        <div className={styles.profileStatus}>
          <span>
            <Icon name="shield" /> Hồ sơ được bảo vệ
          </span>
          <strong>{profile?.onboardingCompletedAt ? 'Đã hoàn tất' : 'Cần bổ sung'}</strong>
        </div>

        <dl className={styles.preferenceSummary}>
          <div>
            <dt>Ngôn ngữ</dt>
            <dd>{locale}</dd>
          </div>
          <div>
            <dt>Múi giờ</dt>
            <dd>{profile?.timezone ?? 'Chưa thiết lập'}</dd>
          </div>
          <div>
            <dt>Tiền tệ</dt>
            <dd>{currency}</dd>
          </div>
        </dl>
      </header>

      {saved.length ? (
        <section className={styles.savedPreview} aria-labelledby="saved-title">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="saved-title">Phòng khám đã lưu</h2>
            </div>
            <Link href="/account/saved">Tất cả ({saved.length})</Link>
          </div>
          <div className={styles.savedList}>
            {saved.slice(0, 4).map((clinic, index) => (
              <Link href={`/discover/${clinic.clinicSlug}`} key={clinic.id}>
                <span className={`${styles.savedArt} clinic-visual--${(index % 4) + 1}`} />
                <span className={styles.savedCopy}>
                  <strong>{clinic.clinicName}</strong>
                  <small>
                    <Icon name="shield" /> {verificationLabel(clinic.verificationStatus)}
                  </small>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className={styles.settingsGrid}>
        {sections.map((section) => (
          <section className={styles.accountSection} key={section.title}>
            <header>
              <h2>{section.title}</h2>
            </header>
            <div className={styles.accountRows}>
              {section.rows.map((row) => (
                <Link href={row.href} key={row.href}>
                  <span className={styles.rowIcon}>
                    <Icon name={row.icon} />
                  </span>
                  <span className={styles.rowCopy}>
                    <strong>{row.label}</strong>
                  </span>
                  <Icon name="chevron" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className={styles.footer}>
        <div>
          <strong>Dental Trust Care</strong>
          <span>
            Phiên bản 0.1
            {process.env.NODE_ENV !== 'production' ? ' · Môi trường phát triển' : ''}
          </span>
        </div>
        <form action={logoutCareAction}>
          <button type="submit">Đăng xuất</button>
        </form>
      </footer>
    </main>
  );
}
