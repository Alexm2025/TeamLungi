// tone: neutral | blue | amber | purple | green | red
export default function Badge({ tone = "neutral", children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

// Contract Status enum -> readable label and colour.
const STATUS_STYLES = {
  0: { label: "Created", tone: "blue" },
  1: { label: "In transit", tone: "amber" },
  2: { label: "At distributor", tone: "purple" },
  3: { label: "At pharmacy", tone: "green" },
  4: { label: "Recalled", tone: "red" },
};

// `status` can be a number or the BigInt ethers returns for enums.
export function StatusBadge({ status }) {
  const style = STATUS_STYLES[Number(status)] ?? { label: "Unknown", tone: "neutral" };
  return <Badge tone={style.tone}>{style.label}</Badge>;
}
