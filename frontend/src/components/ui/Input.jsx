import { useId } from "react";

// Label + control + hint/error line. useId() links the label and message to the
// control, so screen readers read them together.
function Field({ id, label, hint, error, children }) {
  return (
    <div className="field">
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
        </label>
      )}
      {children}
      {(error || hint) && (
        <p id={`${id}-msg`} className={error ? "field-error" : "field-hint"}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

function controlProps(id, error, hint, className) {
  return {
    id,
    className: `input ${error ? "input-invalid" : ""} ${className}`.trim(),
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error || hint ? `${id}-msg` : undefined,
  };
}

export default function Input({ label, hint, error, className = "", id, ...rest }) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <Field id={fieldId} label={label} hint={hint} error={error}>
      <input {...controlProps(fieldId, error, hint, className)} {...rest} />
    </Field>
  );
}

// options: [{ value, label }]
export function Select({ label, hint, error, options, className = "", id, ...rest }) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <Field id={fieldId} label={label} hint={hint} error={error}>
      <select {...controlProps(fieldId, error, hint, className)} {...rest}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
