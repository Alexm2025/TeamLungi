import { Button, Spinner } from "../../components/ui";
import { ROLE } from "./chain";
import { useWallet } from "./WalletContext";

// Placeholder: the role-specific panels (admin, manufacturer, transfers, batch detail) come in step 4.
export default function Dashboard() {
  const { account, participant, isAdmin, loadingRole, connecting, connect } = useWallet();

  if (!account) {
    return (
      <section className="panel center">
        <h1>Connect your wallet</h1>
        <p className="muted">Your dashboard depends on the role registered for your address.</p>
        <Button onClick={connect} loading={connecting}>
          {connecting ? "Connecting…" : "Connect wallet"}
        </Button>
      </section>
    );
  }

  if (loadingRole) return <Spinner label="Loading your role…" />;

  return (
    <section className="panel">
      <h1>Dashboard</h1>
      <p>
        Signed in as <strong>{participant.name || "an unregistered address"}</strong>
        {participant.role > 0 && ` (${ROLE[participant.role]})`}
        {isAdmin && ", contract admin"}.
      </p>
      <p className="muted">Role-specific panels are coming next.</p>
    </section>
  );
}
