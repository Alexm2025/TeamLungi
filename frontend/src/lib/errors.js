// Turns ethers / MetaMask errors into one short sentence for a toast or alert.
export function toUserMessage(err) {
  if (!err) return "Unknown error";

  // User clicked "Reject" in MetaMask
  if (err.code === "ACTION_REJECTED" || err.code === 4001 || err.info?.error?.code === 4001) {
    return "Transaction rejected in wallet.";
  }
  // Revert message from the contract's require(...), e.g. "Not current owner"
  if (err.reason) return err.reason;
  if (err.revert?.args?.[0]) return err.revert.args[0];

  if (err.code === "INSUFFICIENT_FUNDS") return "Not enough POL for gas. Get test POL from the Amoy faucet.";
  if (err.code === "NETWORK_ERROR" || err.code === "TIMEOUT") return "Network problem. Check your connection and try again.";

  return err.shortMessage || err.message || String(err);
}
