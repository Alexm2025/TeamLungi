import { useState } from "react";
import { isAddress } from "ethers";
import { Badge, Button, Card, Input } from "../../components/ui";
import { ROLE } from "./chain";
import { fetchParticipants } from "./data";
import { friendlyError } from "./errors";
import { useTx } from "./useTx";
import { useWallet } from "./WalletContext";

// Admin / Regulator: check what role an address has. The admin can also deactivate it.
export default function ParticipantLookup({ canDeactivate }) {
  const { account } = useWallet();
  const [address, setAddress] = useState("");
  const [result, setResult] = useState(null); // { address, role, name, location, active }
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { run, busy } = useTx();

  const lookup = async (addr) => {
    setLoading(true);
    setError("");
    try {
      const found = await fetchParticipants([addr]);
      setResult({ address: addr, ...found[addr.toLowerCase()] });
    } catch (err) {
      setResult(null);
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const addr = address.trim();
    if (!isAddress(addr)) return setError("Enter a valid 0x… wallet address");
    lookup(addr);
  };

  const deactivate = async () => {
    const receipt = await run("Deactivate participant", (c) =>
      c.deactivateParticipant(result.address)
    );
    if (receipt) lookup(result.address);
  };

  return (
    <Card title="Participant lookup" subtitle="See the role registered for any address.">
      <form onSubmit={onSubmit} className="inline-form" noValidate>
        <Input
          label="Wallet address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x…"
          error={error}
          className="mono"
        />
        <Button type="submit" variant="secondary" loading={loading}>
          Look up
        </Button>
      </form>

      {result && (
        <dl className="details">
          <dt>Role</dt>
          <dd>
            <span className={`role-pill role-${result.role}`}>{ROLE[result.role]}</span>
          </dd>
          <dt>Name</dt>
          <dd>{result.name || "–"}</dd>
          <dt>Location</dt>
          <dd>{result.location || "–"}</dd>
          <dt>Status</dt>
          <dd>
            {result.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
          </dd>
        </dl>
      )}

      {/* The admin deactivating its own wallet would switch off the regulator, so it isn't offered. */}
      {result?.active && canDeactivate && result.address.toLowerCase() !== account?.toLowerCase() && (
        <Button variant="danger" size="sm" onClick={deactivate} loading={busy}>
          Deactivate
        </Button>
      )}
      {result?.active && canDeactivate && result.address.toLowerCase() === account?.toLowerCase() && (
        <p className="muted">This is your own admin wallet; it can't be deactivated from here.</p>
      )}
    </Card>
  );
}
