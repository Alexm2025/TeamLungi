// Turns an ethers v6 / MetaMask error into one short sentence for the UI.
export function friendlyError(err) {
  if (!err) return "Unknown error";
  const code = err.code ?? err.info?.error?.code ?? err.error?.code;
  if (code === "ACTION_REJECTED" || code === 4001) {
    return "Request rejected in MetaMask.";
  }
  // MetaMask already has a pop-up open for this site (often hidden behind the browser window)
  if (code === -32002) {
    return "MetaMask already has a request waiting. Click the MetaMask fox icon in the toolbar to finish it.";
  }
  // Contract reverts: ethers puts the require() message (e.g. "Wrong role") in `reason`
  if (err.reason) return err.reason;
  if (err.shortMessage) return err.shortMessage;
  return err.message || String(err);
}
