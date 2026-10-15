import Spinner from "./Spinner.jsx";

const ICONS = { success: "✓", error: "!", info: "i" };

// Coloured message box. type: success | error | info | pending.
// Used inline in pages and as the body of each toast.
export default function Alert({ type = "info", title, link, onClose, className = "", children }) {
  return (
    <div
      className={`alert alert-${type} ${className}`.trim()}
      role={type === "error" ? "alert" : "status"}
    >
      <span className="alert-icon" aria-hidden="true">
        {type === "pending" ? <Spinner size="sm" /> : ICONS[type]}
      </span>
      <div className="alert-body">
        {title && <strong className="alert-title">{title}</strong>}
        {children && <div>{children}</div>}
        {link && (
          <a href={link.href} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        )}
      </div>
      {onClose && (
        <button type="button" className="alert-close" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
