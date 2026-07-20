export default function Loading() {
  return (
    <main aria-busy="true" aria-live="polite" className="ops-main">
      <header className="ops-page-header">
        <div>
          <span className="ops-eyebrow">Operations</span>
          <h1>Đang tải dữ liệu vận hành</h1>
          <p>Đang kiểm tra quyền truy cập và trạng thái các nguồn dữ liệu.</p>
        </div>
      </header>
      <section className="ops-panel">
        <div className="ops-detail-loading">
          <i />
          <i />
          <i />
        </div>
      </section>
    </main>
  );
}
