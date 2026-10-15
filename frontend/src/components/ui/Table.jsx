// columns: [{ key, header, render?(row), className? }]
// On narrow screens each row becomes a stacked card; the CSS reads the
// column name from each cell's data-label attribute.
export default function Table({ columns, rows, rowKey, empty = "Nothing here yet.", onRowClick }) {
  if (!rows.length) return <p className="table-empty">{empty}</p>;

  const rowProps = (row) =>
    onRowClick
      ? {
          className: "clickable",
          tabIndex: 0,
          onClick: () => onRowClick(row),
          onKeyDown: (e) => e.key === "Enter" && onRowClick(row),
        }
      : {};

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row) : i} {...rowProps(row)}>
              {columns.map((col) => (
                <td key={col.key} data-label={col.header} className={col.className}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
