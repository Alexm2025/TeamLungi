import { Link } from "react-router-dom";
import { addressUrl, blockUrl, txUrl } from "../../lib/contract";
import { short } from "./format";

// A shortened hash that links to our own explorer page, with a small ↗ to the public explorer
// (Polygonscan/Etherscan), so anyone can cross-check what we show against an independent source.
export default function HashLink({ kind, value, full = false }) {
  if (value === null || value === undefined || value === "") return <span className="muted">—</span>;
  const text = kind === "block" ? `#${value}` : full ? value : short(String(value), 10, 6);
  const internal =
    kind === "tx" ? `/ledger/tx/${value}` : kind === "block" ? `/ledger/block/${value}` : `/ledger?address=${value}`;
  const external = kind === "tx" ? txUrl(value) : kind === "block" ? blockUrl(value) : addressUrl(value);

  return (
    <span className="hash-link">
      <Link to={internal} className="mono" title={String(value)}>
        {text}
      </Link>
      {external && (
        <a href={external} target="_blank" rel="noreferrer" className="ext" title="Open in public block explorer">
          ↗
        </a>
      )}
    </span>
  );
}
