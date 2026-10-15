import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Alert from "./Alert.jsx";

const ToastContext = createContext(null);

// How long each kind stays on screen (ms). 0 = stays until updated or dismissed.
const DURATION = { success: 5000, info: 5000, error: 9000, pending: 0 };

// Pop-up messages in the corner. A toast is { type, title?, message?, link?: { href, label } }.
// A pending toast can later be turned into success/error with update(), which is how
// one toast follows a transaction from "waiting" to "confirmed".
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const startTimer = useCallback(
    (id, type, duration) => {
      clearTimeout(timers.current.get(id));
      const ms = duration ?? DURATION[type];
      if (ms > 0) timers.current.set(id, setTimeout(() => dismiss(id), ms));
    },
    [dismiss]
  );

  const show = useCallback(
    (toast) => {
      const id = nextId.current++;
      const type = toast.type ?? "info";
      setToasts((list) => [...list, { ...toast, type, id }]);
      startTimer(id, type, toast.duration);
      return id;
    },
    [startTimer]
  );

  // Pass the new `type` along with the changes so the right timer starts.
  const update = useCallback(
    (id, changes) => {
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, ...changes } : t)));
      startTimer(id, changes.type ?? "info", changes.duration);
    },
    [startTimer]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const api = useMemo(
    () => ({
      show,
      update,
      dismiss,
      success: (message, opts) => show({ ...opts, type: "success", message }),
      error: (message, opts) => show({ ...opts, type: "error", message }),
      info: (message, opts) => show({ ...opts, type: "info", message }),
      pending: (message, opts) => show({ ...opts, type: "pending", message }),
    }),
    [show, update, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <Alert
            key={t.id}
            type={t.type}
            title={t.title}
            link={t.link}
            onClose={() => dismiss(t.id)}
            className="toast"
          >
            {t.message}
          </Alert>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
