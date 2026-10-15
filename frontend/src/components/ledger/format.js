// Small display helpers shared by the ledger components.
export const short = (value, head = 6, tail = 4) =>
  value ? `${value.slice(0, head)}…${value.slice(-tail)}` : "—";

export const dateTime = (secs) => (secs ? new Date(Number(secs) * 1000).toLocaleString() : "—");

export function timeAgo(secs) {
  if (!secs) return "";
  const diff = Math.max(0, Date.now() / 1000 - Number(secs));
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Event type -> badge colour
export const EVENT_TONE = {
  ParticipantRegistered: "blue",
  ParticipantDeactivated: "neutral",
  BatchCreated: "green",
  TransferInitiated: "amber",
  TransferAccepted: "purple",
  TransferApproved: "green",
  TransferRejected: "red",
  TransferCancelled: "neutral",
  BatchRecalled: "red",
  AdminTransferStarted: "purple",
  AdminTransferred: "purple",
  Paused: "red",
  Unpaused: "green",
};

export const EVENT_TYPES = Object.keys(EVENT_TONE);
