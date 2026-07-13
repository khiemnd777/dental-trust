import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon, type IconName } from '@/components/icon';
import { logoutCareAction } from '@/lib/account-actions';
import { getAccountData } from '@/lib/care-data';
import { initials } from '@/lib/presentation';

export const metadata: Metadata = { title: 'Tài khoản' };

const sections: readonly {
  title: string;
  rows: readonly { href: string; icon: IconName; label: string; description: string }[];
}[] = [
  {
    title: 'Chăm sóc của tôi',
    rows: [
      {
        href: '/account/profile',
        icon: 'user',
        label: 'Hồ sơ cá nhân và sức khỏe',
        description: 'Thông tin giúp bác sĩ hiểu bạn',
      },
      {
        href: '/account/documents',
        icon: 'document',
        label: 'Tài liệu và hồ sơ nha khoa',
        description: 'Ảnh chụp, hướng dẫn và Dental Passport',
      },
      {
        href: '/account/saved',
        icon: 'heart',
        label: 'Đã lưu',
        description: 'Phòng khám bạn muốn xem lại',
      },
    ],
  },
  {
    title: 'Cài đặt',
    rows: [
      {
        href: '/account/preferences',
        icon: 'bell',
        label: 'Thông báo và ngôn ngữ',
        description: 'Cách Dental Trust liên hệ với bạn',
      },
      {
        href: '/account/privacy',
        icon: 'lock',
        label: 'Quyền riêng tư và đồng ý',
        description: 'Kiểm soát dữ liệu và quyền chia sẻ',
      },
      {
        href: '/account/help',
        icon: 'support',
        label: 'Trợ giúp và an toàn',
        description: 'Hỗ trợ, sự cố và câu hỏi thường gặp',
      },
    ],
  },
];

export default async function AccountPage() {
  const { profile, saved } = await getAccountData();
  const fullName = profile?.identity?.fullName ?? profile?.email ?? 'Tài khoản của bạn';
  return (
    <main className="care-main account-page">
      <header className="account-profile-card">
        <span className="account-profile-card__avatar">{initials(fullName)}</span>
        <div>
          <p className="eyebrow">Tài khoản của tôi</p>
          <h1>{fullName}</h1>
          <p>{profile?.email}</p>
        </div>
        <Link aria-label="Chỉnh sửa hồ sơ" href="/account/profile">
          Chỉnh sửa
        </Link>
        <div className="profile-completeness">
          <span>
            <Icon name="check" /> Hồ sơ đã được bảo vệ
          </span>
          <strong>{profile?.onboardingCompletedAt ? '100%' : '70%'}</strong>
        </div>
      </header>

      {saved.length ? (
        <section className="saved-preview">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Xem lại nhanh</p>
              <h2>Đã lưu gần đây</h2>
            </div>
            <Link href="/account/saved">Tất cả ({saved.length})</Link>
          </div>
          <div className="saved-preview__scroll">
            {saved.slice(0, 4).map((clinic, index) => (
              <Link href={`/discover/${clinic.clinicSlug}`} key={clinic.id}>
                <span className={`saved-preview__art clinic-visual--${(index % 4) + 1}`} />
                <strong>{clinic.clinicName}</strong>
                <small>
                  <Icon name="shield" /> Đã xác minh
                </small>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {sections.map((section) => (
        <section className="account-section" key={section.title}>
          <h2>{section.title}</h2>
          <div>
            {section.rows.map((row) => (
              <Link href={row.href} key={row.href}>
                <span className="account-row-icon">
                  <Icon name={row.icon} />
                </span>
                <span>
                  <strong>{row.label}</strong>
                  <small>{row.description}</small>
                </span>
                <Icon name="chevron" />
              </Link>
            ))}
          </div>
        </section>
      ))}

      <footer className="account-footer">
        <strong>Dental Trust Care</strong>
        <span>Phiên bản 0.1 · Môi trường phát triển</span>
        <form action={logoutCareAction}>
          <button type="submit">Đăng xuất</button>
        </form>
      </footer>
    </main>
  );
}
