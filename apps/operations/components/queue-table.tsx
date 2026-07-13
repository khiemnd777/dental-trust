interface Row {
  ref: string;
  subject: string;
  work: string;
  owner: string;
  due: string;
  risk: 'urgent' | 'attention' | 'normal';
}
export function QueueTable({ rows }: { rows: readonly Row[] }) {
  return (
    <div className="ops-table-wrap">
      <table className="ops-table">
        <thead>
          <tr>
            <th>Tham chiếu</th>
            <th>Đối tượng</th>
            <th>Công việc</th>
            <th>Phụ trách</th>
            <th>Thời hạn</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ref}>
              <td>
                <code>{row.ref}</code>
              </td>
              <td>
                <strong>{row.subject}</strong>
              </td>
              <td>
                <span className={`ops-risk ops-risk--${row.risk}`}>{row.work}</span>
              </td>
              <td>{row.owner}</td>
              <td className={`ops-due ops-due--${row.risk}`}>{row.due}</td>
              <td>
                <button aria-label={`Mở ${row.ref}`} type="button">
                  ›
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
