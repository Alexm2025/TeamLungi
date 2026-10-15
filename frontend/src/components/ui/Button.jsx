import Spinner from "./Spinner.jsx";

// variant: primary | secondary | ghost | danger. `loading` shows a spinner and blocks clicks,
// so a transaction can't be sent twice. Defaults to type="button"; pass type="submit" in forms.
export default function Button({
  variant = "primary",
  size,
  loading = false,
  disabled,
  type = "button",
  className = "",
  children,
  ...rest
}) {
  const classes = ["btn", `btn-${variant}`, size === "sm" && "btn-sm", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
