// Turns an ethers v6 / MetaMask error into one short sentence for the UI.
export function friendlyError(err) {
  if (!err) return "Unknown error";
  if (err.code === "ACTION_REJECTED" || err.code === 4001) {
    return "Request rejected in MetaMask.";
  }
  // Contract reverts: ethers puts the require() message (e.g. "Wrong role") in `reason`
  if (err.reason) return err.reason;
  if (err.shortMessage) return err.shortMessage;
  return err.message || String(err);
}
