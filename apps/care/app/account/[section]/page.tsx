import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Icon, type IconName } from '@/components/icon';
import { getAccountData } from '@/lib/care-data';

const content: Readonly<
  Record<
    string,
    {
      title: string;
      eyebrow: string;
      icon: IconName;
      description: string;
      rows: readonly { label: string; value: string }[];
    }
  >
> = {
  profile: {
    title: 'Hồ sơ cá nhân và sức khỏe',
    eyebrow: 'Giúp đội ngũ hiểu bạn',
    icon: 'user',
    description: 'Chỉ thông tin cần thiết mới được chia sẻ và luôn cần đúng quyền truy cập.',
    rows: [
      { label: 'Thông tin cá nhân', value: 'Tên, ngày sinh và liên hệ' },
      { label: 'Tình trạng sức khỏe', value: 'Bệnh nền, thuốc và dị ứng' },
      { label: 'Liên hệ khẩn cấp', value: 'Người có thể hỗ trợ bạn' },
    ],
  },
  documents: {
    title: 'Tài liệu và hồ sơ nha khoa',
    eyebrow: 'Tất cả trong một nơi',
    icon: 'document',
    description: 'Tài liệu được quét an toàn trước khi cung cấp cho đội ngũ điều trị.',
    rows: [
      { label: 'Ảnh chụp và phim', value: 'Tài liệu chẩn đoán' },
      { label: 'Phương án điều trị', value: 'Các phiên bản đã nhận' },
      { label: 'Dental Passport', value: 'Hồ sơ sau điều trị' },
    ],
  },
  saved: {
    title: 'Phòng khám đã lưu',
    eyebrow: 'Xem lại khi bạn muốn',
    icon: 'heart',
    description: 'Lưu không đồng nghĩa với đặt lịch hoặc chia sẻ hồ sơ.',
    rows: [],
  },
  preferences: {
    title: 'Thông báo và ngôn ngữ',
    eyebrow: 'Theo cách phù hợp với bạn',
    icon: 'bell',
    description: 'Các cập nhật quan trọng về an toàn và lịch hẹn luôn được ưu tiên.',
    rows: [
      { label: 'Ngôn ngữ', value: 'Tiếng Việt' },
      { label: 'Nhắc lịch hẹn', value: 'Đang bật' },
      { label: 'Cập nhật hành trình', value: 'Tin nhắn trong ứng dụng' },
    ],
  },
  privacy: {
    title: 'Quyền riêng tư và đồng ý',
    eyebrow: 'Bạn kiểm soát dữ liệu của mình',
    icon: 'lock',
    description: 'Xem, rút lại đồng ý hoặc yêu cầu bản sao dữ liệu bất cứ lúc nào.',
    rows: [
      { label: 'Các đồng ý đang hiệu lực', value: 'Xem lịch sử đầy đủ' },
      { label: 'Chia sẻ với phòng khám', value: 'Theo từng yêu cầu' },
      { label: 'Tải dữ liệu của tôi', value: 'Tạo bản xuất an toàn' },
      { label: 'Yêu cầu xóa dữ liệu', value: 'Xem điều kiện và phạm vi' },
    ],
  },
  help: {
    title: 'Trợ giúp và an toàn',
    eyebrow: 'Luôn có người hỗ trợ',
    icon: 'support',
    description: 'Nếu có dấu hiệu khẩn cấp, hãy liên hệ dịch vụ y tế tại nơi bạn đang ở.',
    rows: [
      { label: 'Nhắn đội ngũ chăm sóc', value: 'Phản hồi theo mức độ ưu tiên' },
      { label: 'Báo cáo sự cố', value: 'Ưu tiên an toàn và bảo mật' },
      { label: 'Câu hỏi thường gặp', value: 'Điều trị, thanh toán và dữ liệu' },
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const item = content[(await params).section];
  return { title: item?.title ?? 'Tài khoản' } satisfies Metadata;
}

export default async function AccountSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const section = (await params).section;
  const item = content[section];
  if (!item) notFound();
  const { profile, saved } = await getAccountData();
  const publicAppUrl = process.env.PUBLIC_APP_URL ?? 'http://localhost:3003';
  const rows =
    section === 'saved'
      ? saved.map((clinic) => ({ label: clinic.clinicName, value: 'Đã xác minh' }))
      : section === 'profile' && profile
        ? [
            { label: 'Họ và tên', value: profile.identity?.fullName ?? 'Chưa bổ sung' },
            { label: 'Số điện thoại', value: profile.contact?.phoneE164 ?? 'Chưa bổ sung' },
            { label: 'Khu vực hiện tại', value: profile.currentCity ?? 'Chưa bổ sung' },
            ...item.rows.slice(1),
          ]
        : item.rows;

  return (
    <main className="care-main account-detail-page">
      <header className="subpage-header">
        <Link aria-label="Quay lại tài khoản" href="/account">
          <Icon className="icon-back" name="arrow" />
        </Link>
        <div>
          <p className="eyebrow">{item.eyebrow}</p>
          <h1>{item.title}</h1>
        </div>
      </header>
      <section className="account-detail-hero">
        <span>
          <Icon name={item.icon} />
        </span>
        <p>{item.description}</p>
      </section>
      <section className="settings-list">
        {rows.map((row) => (
          <div className="settings-row" key={row.label}>
            <span>
              <strong>{row.label}</strong>
              <small>{row.value}</small>
            </span>
          </div>
        ))}
        {!rows.length ? (
          <div className="empty-state">
            <h2>Chưa có nội dung</h2>
            <p>Nội dung sẽ xuất hiện ở đây khi sẵn sàng.</p>
          </div>
        ) : null}
      </section>
      {section === 'profile' ? (
        <Link
          className="primary-button primary-button--wide"
          href={`${publicAppUrl}/vi/app/onboarding`}
        >
          Cập nhật hồ sơ bảo mật
        </Link>
      ) : section === 'preferences' ? (
        <Link
          className="primary-button primary-button--wide"
          href={`${publicAppUrl}/vi/app/settings`}
        >
          Mở trung tâm cài đặt
        </Link>
      ) : section === 'privacy' ? (
        <Link
          className="primary-button primary-button--wide"
          href={`${publicAppUrl}/vi/app/privacy`}
        >
          Quản lý quyền riêng tư
        </Link>
      ) : section === 'help' ? (
        <Link className="primary-button primary-button--wide" href="/messages">
          Nhắn đội ngũ chăm sóc
        </Link>
      ) : null}
    </main>
  );
}
