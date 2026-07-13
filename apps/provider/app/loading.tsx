export default function ProviderLoading() {
  return (
    <main aria-busy="true" aria-label="Đang tải không gian làm việc" className="provider-main">
      <header className="provider-page-header provider-loading-header">
        <div>
          <span className="provider-skeleton provider-skeleton--eyebrow" />
          <span className="provider-skeleton provider-skeleton--title" />
          <span className="provider-skeleton provider-skeleton--copy" />
        </div>
      </header>
      <section
        aria-label="Đang tải tổng quan"
        className="provider-metrics provider-loading-metrics"
      >
        {Array.from({ length: 3 }, (_, index) => (
          <article className="provider-panel provider-loading-card" key={index}>
            <span className="provider-skeleton provider-skeleton--icon" />
            <span className="provider-skeleton provider-skeleton--label" />
            <span className="provider-skeleton provider-skeleton--value" />
          </article>
        ))}
      </section>
      <section aria-label="Đang tải nội dung" className="provider-panel provider-loading-panel">
        <span className="provider-skeleton provider-skeleton--section" />
        {Array.from({ length: 4 }, (_, index) => (
          <span className="provider-skeleton provider-skeleton--row" key={index} />
        ))}
      </section>
    </main>
  );
}
