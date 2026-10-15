// Small rotating ring. Pass `label` to show text next to it.
export default function Spinner({ size = "md", label }) {
  return (
    <span className="spinner-wrap" role="status">
      <span className={`spinner spinner-${size}`} aria-hidden="true" />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}
