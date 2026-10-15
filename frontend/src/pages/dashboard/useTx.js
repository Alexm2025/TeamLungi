import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import { DEMO_MODE, getContract } from "./chain";
import { friendlyError } from "./errors";
import { txUrl } from "./format";

// Sends one contract transaction while a single toast follows it:
// "confirm in MetaMask" -> "waiting for the block" -> "confirmed" (or the revert reason).
//   const { run, busy } = useTx();
//   const receipt = await run("Create batch", (c) => c.createBatch(...));
// Returns the receipt, or null if it failed (the toast already explains why).
export function useTx() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (title, send) => {
      // Preview mode has no contract to write to, so say so instead of failing.
      if (DEMO_MODE) {
        toast.info(
          "This is a preview with sample data. Actions are enabled once the MediChain contract is live on Polygon Amoy.",
          { title }
        );
        return null;
      }
      setBusy(true);
      const id = toast.pending("Confirm the transaction in MetaMask…", { title });
      try {
        const contract = await getContract(true);
        // If the contract would revert ("Wrong role" etc.), ethers finds out while
        // estimating gas, before MetaMask opens, so a bad request costs nothing.
        const tx = await send(contract);
        const link = { href: txUrl(tx.hash), label: "View on PolygonScan" };
        toast.update(id, { type: "pending", message: "Waiting for the block to be mined…", link });
        const receipt = await tx.wait();
        toast.update(id, { type: "success", message: "Confirmed on-chain.", link });
        return receipt;
      } catch (err) {
        toast.update(id, { type: "error", message: friendlyError(err), link: undefined });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast]
  );

  return { run, busy };
}
