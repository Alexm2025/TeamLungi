import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { blockTimestamp } from "../../lib/activity";
import { isContractConfigured } from "../../lib/contract";
import { useWallet } from "../../pages/dashboard/WalletContext";
import { useToast } from "../ui";
import { buildNotifications, headline } from "./compute";
import "./notifications.css";

const Ctx = createContext(null);
const REFRESH_MS = 15000;
const URGENT = ["critical", "action"];

const readKey = (who) => `medichain.read.${who}`;
function loadRead(who) {
  try {
    return new Set(JSON.parse(localStorage.getItem(readKey(who)) || "[]"));
  } catch {
    return new Set();
  }
}
function saveRead(who, set) {
  try {
    localStorage.setItem(readKey(who), JSON.stringify([...set].slice(-500)));
  } catch {
    // storage blocked: read state just won't persist
  }
}

function timeAgo(sec) {
  if (!sec) return "";
  const d = Math.max(0, Date.now() / 1000 - sec);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

/** Computes notifications for the signed-in role, refreshes them, and pops up toasts for new ones. */
export function NotificationsProvider({ children }) {
  const { signedIn, account, sessionRole, isAdmin } = useWallet();
  const toast = useToast();
  const who = signedIn ? account.toLowerCase() : "public";
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [read, setRead] = useState(() => loadRead(who));
  const seen = useRef(null); // ids already shown, so only genuinely new ones pop up
  const running = useRef(false);
  const again = useRef(false); // a refresh was requested while one was running
  const generation = useRef(0); // bumps when the user/role changes, so stale results are dropped

  useEffect(() => {
    generation.current += 1;
    setRead(loadRead(who));
    seen.current = null;
    setItems([]);
    setLoaded(false);
  }, [who]);

  const refresh = useCallback(async () => {
    if (!isContractConfigured()) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    const gen = generation.current;
    try {
      const list = await buildNotifications({ account: signedIn ? account : null, role: signedIn ? sessionRole : null, isAdmin });
      await Promise.all(list.filter((i) => i.block && !i.time).map(async (i) => (i.time = await blockTimestamp(i.block))));
      if (gen !== generation.current) return; // signed in/out meanwhile: this list is for someone else
      // Pop up anything new since the last refresh (not on the first load).
      if (seen.current) {
        for (const i of list) {
          if (!seen.current.has(i.id) && i.severity !== "info") {
            const type = i.severity === "success" ? "success" : i.severity === "critical" || i.severity === "warning" ? "error" : "info";
            toast.show({ type, title: i.title, message: i.detail });
          }
        }
      }
      seen.current = new Set(list.map((i) => i.id));
      setItems(list);
      setLoaded(true);
    } catch {
      // network hiccup: keep the last list and try again on the next tick
    } finally {
      running.current = false;
      if (again.current || gen !== generation.current) {
        again.current = false;
        refreshRef.current();
      }
    }
  }, [signedIn, account, sessionRole, isAdmin, toast]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    const now = () => refresh();
    window.addEventListener("medichain:changed", now);
    window.addEventListener("focus", now);
    return () => {
      clearInterval(t);
      window.removeEventListener("medichain:changed", now);
      window.removeEventListener("focus", now);
    };
  }, [refresh]);

  const markRead = useCallback(
    (ids) => {
      setRead((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        saveRead(who, next);
        return next;
      });
    },
    [who]
  );

  // Urgent items always count until resolved on-chain; others count until read.
  const unread = items.filter((i) => URGENT.includes(i.severity) || !read.has(i.id)).length;
  const value = useMemo(() => ({ items, loaded, unread, read, markRead, refresh, signedIn, role: sessionRole }), [items, loaded, unread, read, markRead, refresh, signedIn, sessionRole]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNotifications = () => useContext(Ctx);

const ICON = { critical: "!", action: "→", warning: "!", success: "✓", info: "i" };

/** Bell in the top bar with a badge and a dropdown list. */
export function NotificationBell() {
  const n = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  if (!n || !isContractConfigured()) return null;

  const title = n.signedIn ? "Notifications" : "Public safety alerts";
  return (
    <div className="nt" ref={ref}>
      <button
        type="button"
        className={`nt-bell${n.unread ? " has-unread" : ""}`}
        aria-label={`${title}${n.unread ? `, ${n.unread} new` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {n.unread > 0 && <span className="nt-badge">{n.unread > 9 ? "9+" : n.unread}</span>}
      </button>
      {open && (
        <div className="nt-panel" role="dialog" aria-label={title}>
          <header className="nt-head">
            <strong>{title}</strong>
            {n.items.length > 0 && (
              <button type="button" onClick={() => n.markRead(n.items.map((i) => i.id))}>Mark all read</button>
            )}
          </header>
          <div className="nt-list">
            {!n.loaded && <p className="nt-empty">Checking the blockchain…</p>}
            {n.loaded && n.items.length === 0 && (
              <p className="nt-empty">{n.signedIn ? "You're all caught up." : "No safety alerts right now."}</p>
            )}
            {n.items.map((i) => {
              const fresh = URGENT.includes(i.severity) || !n.read.has(i.id);
              return (
                <article key={i.id} className={`nt-item nt-${i.severity}${fresh ? " is-new" : ""}`}>
                  <span className="nt-icon" aria-hidden="true">{ICON[i.severity]}</span>
                  <div className="nt-body">
                    <strong>{i.title}</strong>
                    <p>{i.detail}</p>
                    <div className="nt-meta">
                      {i.time && <span>{timeAgo(i.time)}</span>}
                      {i.href && (
                        <Link to={i.href} onClick={() => { n.markRead([i.id]); setOpen(false); }}>
                          {i.cta ?? "Open"} →
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Slim bar under the top bar, on every page, for whatever needs action right now. */
export function AlertBar() {
  const n = useNotifications();
  const [hidden, setHidden] = useState(null);
  if (!n?.loaded) return null;
  const h = headline(n.items, n.role);
  if (!h || hidden === h.text) return null;
  return (
    <div className={`nt-bar nt-bar-${h.severity}`} role="status">
      <span className="nt-bar-dot" aria-hidden="true" />
      <span className="nt-bar-text">{h.text}</span>
      {h.item?.href && <Link to={h.item.href} className="nt-bar-cta">{h.item.cta ?? "Review"} →</Link>}
      <button type="button" className="nt-bar-close" aria-label="Hide" onClick={() => setHidden(h.text)}>✕</button>
    </div>
  );
}
