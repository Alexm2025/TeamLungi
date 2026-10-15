const EXPLORER = "https://amoy.polygonscan.com";

// 0x1234567890abcdef... -> 0x1234…cdef
export function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function sameAddress(a, b) {
  return Boolean(a && b) && a.toLowerCase() === b.toLowerCase();
}

export const txUrl = (hash) => `${EXPLORER}/tx/${hash}`;

// "2026-10-15" from a date picker -> unix seconds at midnight UTC (what the contract stores)
export function dateInputToUnix(value) {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / 1000);
}

// Batch dates are UTC midnights, so show them in UTC too; otherwise users west of
// Greenwich would see the day before.
export function formatDate(seconds) {
  if (!seconds) return "–";
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Block timestamps are real moments, so show them in the viewer's own time.
export function formatDateTime(seconds) {
  if (!seconds) return "–";
  return new Date(seconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
