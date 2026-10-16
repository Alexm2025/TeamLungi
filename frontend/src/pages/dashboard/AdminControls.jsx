import { useCallback, useEffect, useState } from "react";
import { isAddress, ZeroAddress } from "ethers";
import { Alert, Badge, Button, Card, Input } from "../../components/ui";
import { ROLE, getReadContract } from "./chain";
import { friendlyError } from "./errors";
import { shortAddress } from "./format";
import { useTx } from "./useTx";

// Admin powers, and their limits: pause/resume hand-offs in an emergency and hand admin rights to
// another wallet in two steps. The admin can't edit or delete any record; recalls work while paused.
export default function AdminControls() {
  const [state, setState] = useState({ paused: null, pendingAdmin: null, pendingInfo: null, error: "" });
  const [newAdmin, setNewAdmin] = useState("");
  const { run, busy } = useTx();

  const load = useCallback(async () => {
    try {
      const c = await getReadContract();
      const [paused, pendingAdmin] = await Promise.all([c.paused(), c.pendingAdmin()]);
      const pending = pendingAdmin === ZeroAddress ? null : pendingAdmin;
      // The proposed wallet accepts from its own dashboard, so it must be able to sign in with a role.
      const pendingInfo = pending ? await c.participants(pending) : null;
      setState({ paused, pendingAdmin: pending, pendingInfo, error: "" });
    } catch (err) {
      setState((s) => ({ ...s, error: friendlyError(err) }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const togglePause = async () => {
    const receipt = await run(state.paused ? "Resume hand-offs" : "Emergency pause", (c) =>
      state.paused ? c.unpause() : c.pause()
    );
    if (receipt) load();
  };

  const propose = async (e) => {
    e.preventDefault();
    const receipt = await run("Propose new admin", (c) => c.proposeAdmin(newAdmin.trim()));
    if (receipt) {
      setNewAdmin("");
      load();
    }
  };

  const validAddress = isAddress(newAdmin.trim());

  return (
    <Card
      title="Admin controls, with limits"
      subtitle="The admin can pause the system and hand over admin rights, but can never edit or delete a record."
      actions={
        state.paused === null ? null : (
          <Badge tone={state.paused ? "red" : "green"}>{state.paused ? "PAUSED" : "Running"}</Badge>
        )
      }
    >
      {state.error && <Alert type="error">{state.error}</Alert>}

      <h3 className="admin-h">Emergency controls</h3>
      <p className="muted">
        Pausing stops batch creation and every hand-off step, for example if a company's wallet is compromised.
        Recalls keep working while paused, because safety actions must never be blocked.
      </p>
      <Button variant={state.paused ? "primary" : "danger"} loading={busy} disabled={state.paused === null} onClick={togglePause}>
        {state.paused ? "Resume hand-offs" : "Pause all hand-offs"}
      </Button>

      <h3 className="admin-h">Hand over admin rights (2 steps)</h3>
      <p className="muted">
        Propose a new admin (e.g. a regulator's multisig). The proposal goes to that wallet's dashboard, and nothing
        changes until it signs "accept", so a typo can't lock everyone out. Proposing again replaces the old proposal.
      </p>
      {state.pendingAdmin &&
        (state.pendingInfo?.active ? (
          <Alert type="info">
            Proposal sent to {state.pendingInfo.name} ({ROLE[Number(state.pendingInfo.role)]},{" "}
            {shortAddress(state.pendingAdmin)}). They accept it by signing in with that wallet and clicking "Accept
            admin rights" on their dashboard. You stay admin until then.
          </Alert>
        ) : (
          <Alert type="error">
            Proposal sent to {shortAddress(state.pendingAdmin)}, but that wallet isn't an active participant, so it
            can't sign in to accept. Register it first (e.g. as Regulator), or propose a different wallet.
          </Alert>
        ))}
      <form onSubmit={propose} className="admin-row">
        <Input
          label="New admin address"
          value={newAdmin}
          onChange={(e) => setNewAdmin(e.target.value)}
          placeholder="0x…"
          error={newAdmin && !validAddress ? "Not a valid address" : ""}
        />
        <Button type="submit" variant="secondary" loading={busy} disabled={!validAddress}>
          Propose
        </Button>
      </form>
    </Card>
  );
}
