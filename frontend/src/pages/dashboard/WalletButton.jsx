import { useNavigate } from "react-router-dom";
import { ROLE } from "./chain";
import { shortAddress } from "./format";
import { useWallet } from "./WalletContext";

// Top-right account status. Signing in happens only on the home page, so this shows nothing
// until a role session is active; then it shows the role, the wallet and a log-out button.
export default function WalletButton() {
  const { signedIn, account, participant, isAdmin, loadingRole, signOut } = useWallet();
  const navigate = useNavigate();
  if (!signedIn) return null;

  const role = loadingRole ? "…" : ROLE[participant.role] ?? "Unknown";
  const logOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="wallet" title={account}>
      <span className={`role-pill role-${participant.role}`}>{isAdmin ? `Admin · ${role}` : role}</span>
      <span className="wallet-address">{shortAddress(account)}</span>
      <button type="button" className="logout-btn" onClick={logOut}>
        Log out
      </button>
    </div>
  );
}
