import { useCallback, useEffect, useState } from "react";
import { isAddress, ZeroAddress } from "ethers";
import { Alert, Badge, Button, Card, Input } from "../../components/ui";
import { getReadContract } from "./chain";
import { friendlyError } from "./errors";
import { shortAddress } from "./format";
import { useTx } from "./useTx";

// Admin powers, and their limits: pause/resume hand-offs in an emergency and hand admin rights to
// another wallet in two steps. The admin can't edit or delete any record; recalls work while paused.
export default function AdminControls() {
  const [state, setState] = useState({ paused: null, pendingAdmin: null, error: "" });
  const [newAdmin, setNewAdmin] = useState("");
  const { run, busy } = useTx();

  const load = useCallback(async () => {
    try {
      const c = await getReadContract();
      const [paused, pendingAdmin] = await Promise.all([c.paused(), c.pendingAdmin()]);
      setState({ paused, pendingAdmin: pendingAdmin === ZeroAddress ? null : pendingAdmin, error: "" });
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
        Propose a new admin (e.g. a regulator's multisig). Nothing changes until that wallet signs "accept", so a
        typo can't lock everyone out.
      </p>
      {state.pendingAdmin && (
        <Alert type="info">Waiting for {shortAddress(state.pendingAdmin)} to accept admin rights.</Alert>
      )}
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
