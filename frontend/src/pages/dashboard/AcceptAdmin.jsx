import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card } from "../../components/ui";
import { getReadContract } from "./chain";
import { shortAddress } from "./format";
import { useTx } from "./useTx";
import { useWallet } from "./WalletContext";

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

// Step 2 of the admin handover. Shown only to the wallet the current admin proposed:
// signing acceptAdmin() proves this wallet controls its key, and only then do admin rights move.
export default function AcceptAdmin({ account }) {
  const { refresh } = useWallet();
  const { run, busy } = useTx();
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [isProposed, setIsProposed] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await getReadContract();
      const [pending, admin] = await Promise.all([c.pendingAdmin(), c.admin()]);
      setIsProposed(same(pending, account));
      setCurrentAdmin(admin);
    } catch {
      setIsProposed(false); // nothing to show if the chain can't be read
    }
  }, [account]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isProposed) return null;

  const accept = async () => {
    const receipt = await run("Accept admin rights", (c) => c.acceptAdmin());
    if (receipt) {
      setIsProposed(false);
      refresh(); // this wallet is now the admin, so the admin panels appear
    }
  };

  return (
    <Card
      title="You've been proposed as network admin"
      subtitle="The current admin started a 2-step handover of admin rights to this wallet."
    >
      <Alert type="info">
        Proposed by {shortAddress(currentAdmin)}. Admin rights move only when you sign below. Until then the current
        admin keeps them and can propose a different wallet instead.
      </Alert>
      <p className="muted">
        As admin you can register and deactivate participants, and pause or resume hand-offs. You can't edit or
        delete any record.
      </p>
      <Button loading={busy} onClick={accept}>
        Accept admin rights
      </Button>
    </Card>
  );
}
