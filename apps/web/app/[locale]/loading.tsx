import { Skeleton } from '@dental-trust/ui';

export default function LocaleLoading() {
  return (
    <main className="section">
      <div className="container">
        <Skeleton style={{ height: '1.2rem', width: '8rem' }} />
        <Skeleton style={{ height: '4rem', marginTop: '1rem', maxWidth: '42rem' }} />
        <Skeleton style={{ height: '14rem', marginTop: '2rem' }} />
      </div>
    </main>
  );
}
