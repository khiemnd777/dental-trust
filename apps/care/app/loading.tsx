export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Đang tải nội dung" className="care-main skeleton-page">
      <span className="skeleton-line skeleton-line--small" />
      <span className="skeleton-line skeleton-line--title" />
      <span className="skeleton-card skeleton-card--hero" />
      <span className="skeleton-card" />
      <span className="skeleton-card" />
    </main>
  );
}
