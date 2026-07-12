import { headers } from 'next/headers';
import Link from 'next/link';
import { Icon } from '@dental-trust/ui';

const copy = {
  vi: {
    title: 'Không tìm thấy trang',
    body: 'Địa chỉ có thể đã thay đổi hoặc bạn không có quyền truy cập trang này.',
    home: 'Về trang chủ',
  },
  en: {
    title: 'Page not found',
    body: 'The address may have changed or you may not have access to this page.',
    home: 'Return home',
  },
} as const;

export default async function NotFound() {
  const locale = (await headers()).get('x-dental-trust-locale') === 'en' ? 'en' : 'vi';
  const text = copy[locale];
  return (
    <main className="section">
      <div className="container narrow">
        <div className="dt-empty">
          <span className="dt-empty__icon">
            <Icon name="search" />
          </span>
          <h1>{text.title}</h1>
          <p>{text.body}</p>
          <Link className="dt-button dt-button--primary button-link" href={`/${locale}`}>
            {text.home}
          </Link>
        </div>
      </div>
    </main>
  );
}
