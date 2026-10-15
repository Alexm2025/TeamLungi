import { Button } from "../../components/ui";
import { DEMO_MODE, ROLE } from "./chain";
import { shortAddress } from "./format";
import { useWallet } from "./WalletContext";

function roleLabel({ role, active }, isAdmin) {
  if (!role) return isAdmin ? "Admin" : "Not registered";
  const label = active ? ROLE[role] : `${ROLE[role]} (deactivated)`;
  return isAdmin ? `Admin · ${label}` : label;
}

export default function WalletButton() {
  const { account, participant, isAdmin, connecting, loadingRole, error, connect } = useWallet();

  if (!account) {
    return (
      <div className="wallet">
        <Button onClick={connect} loading={connecting}>
          {connecting ? "Connecting…" : "Connect wallet"}
        </Button>
        {error && <span className="wallet-error">{error}</span>}
      </div>
    );
  }

  return (
    <div className="wallet" title={error || account}>
      <span className={`role-pill role-${participant.role}`}>
        {DEMO_MODE
          ? "Preview mode"
          : loadingRole
            ? "Loading role…"
            : roleLabel(participant, isAdmin)}
      </span>
      <span className="wallet-address">{shortAddress(account)}</span>
      {error && <span className="wallet-error">{error}</span>}
    </div>
  );
}
