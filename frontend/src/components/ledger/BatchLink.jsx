import { Link } from "react-router-dom";

// A batch ID that opens its Verify page, which checks the batch on-chain straight away and shows
// the details, lab report check, 3-step verification, custody history and transactions.
export default function BatchLink({ id, onClick }) {
  if (!id) return <span className="muted">—</span>;
  return (
    <Link
      to={`/verify/${encodeURIComponent(id)}`}
      className="mono batch-link"
      title={`View and verify batch ${id}`}
      // stopPropagation: inside a clickable table row, the link must win over the row
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
    >
      {id}
    </Link>
  );
}
