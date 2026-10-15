import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, Spinner } from "../../components/ui";
import ApprovalQueue from "../../components/ledger/ApprovalQueue.jsx";
import { CONTRACT_READY, NETWORK, ROLE } from "./chain";
import AdminControls from "./AdminControls.jsx";
import CreateBatch from "./CreateBatch.jsx";
import MyBatches from "./MyBatches.jsx";
import ParticipantLookup from "./ParticipantLookup.jsx";
import RecallCard from "./RecallCard.jsx";
import RecallList from "./RecallList.jsx";
import RegisterParticipant from "./RegisterParticipant.jsx";
import TransferCard from "./TransferCard.jsx";
import { useWallet } from "./WalletContext";

function NotRegistered({ account, deactivated }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
    } catch {
      // clipboard blocked: the address is still shown for manual copying
    }
  };
  return (
    <Card title={deactivated ? "Your access was deactivated" : "You're not registered yet"}>
      <p className="muted">
        Send this address to the MediChain admin so they can register it with your role
        (manufacturer, distributor or pharmacy).
      </p>
      <div className="copy-row">
        <code className="mono">{account}</code>
        <Button size="sm" variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </Card>
  );
}

// The panels for one account. Each panel shows only to the role allowed to use it; the
// contract enforces the same rules, so hiding a panel is about clarity, not security.
function DashboardPanels({ account, participant, isAdmin }) {
  const [version, setVersion] = useState(0); // bump to make lists reload after a transaction
  const [sendTarget, setSendTarget] = useState({ id: "", n: 0 });
  const transferRef = useRef(null);
  const changed = useCallback(() => setVersion((v) => v + 1), []);

  const { role, active } = participant;
  const isHolder = active && role >= 1 && role <= 3; // can hold custody of batches
  const canSend = active && (role === 1 || role === 2); // pharmacies are the last stop
  const isRegulator = active && role === 4;

  // "Send…" in the table: fill the transfer form with that batch and scroll to it.
  // `n` changes on every click, so the form resets even when the same batch is picked again.
  const pickForSend = (id) => {
    setSendTarget({ id, n: Date.now() });
    transferRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const heading = isAdmin ? "Admin dashboard" : active ? `${ROLE[role]} dashboard` : "Dashboard";

  return (
    <div className="dashboard">
      <header className="page-header">
        <h1>{heading}</h1>
        {participant.name && (
          <p className="muted">
            {participant.name}
            {participant.location && ` · ${participant.location}`}
          </p>
        )}
      </header>

      {!active && !isAdmin && <NotRegistered account={account} deactivated={role > 0} />}

      {isHolder && (
        <MyBatches
          account={account}
          version={version}
          canSend={canSend}
          onSend={pickForSend}
          onChange={changed}
        />
      )}

      <div className="dash-grid">
        {active && role === 1 && <CreateBatch onCreated={changed} />}
        {isHolder && (
          <div ref={transferRef}>
            <TransferCard
              key={sendTarget.n}
              batchId={sendTarget.id}
              actions={canSend ? ["send", "accept", "cancel"] : ["accept"]}
              onDone={changed}
            />
          </div>
        )}
        {/* The contract lets the regulator recall any batch and a manufacturer its own */}
        {(isRegulator || (active && role === 1)) && <RecallCard onDone={changed} />}
        {isAdmin && <RegisterParticipant />}
        {(isAdmin || isRegulator) && <ParticipantLookup canDeactivate={isAdmin} />}
      </div>

      {isRegulator && <ApprovalQueue key={version} />}
      {isAdmin && <AdminControls />}
      {isRegulator && <RecallList version={version} onRefresh={changed} />}
    </div>
  );
}

// Real dashboard: you get here after signing in with a role on the home page.
function LiveDashboard() {
  const { signedIn, account, participant, isAdmin, loadingRole } = useWallet();

  if (!signedIn) {
    return (
      <section className="panel center">
        <h1>Sign in to continue</h1>
        <p className="muted">Choose your role and connect MetaMask on the home page to open your dashboard.</p>
        <Link to="/" className="btn btn-primary">Go to sign in</Link>
      </section>
    );
  }
  // Only block the page on the first load; later role refreshes (e.g. after registering someone)
  // keep the dashboard on screen so forms don't lose what was typed.
  if (loadingRole && !participant.role) return <Spinner label="Loading your role…" />;
  return <DashboardPanels account={account} participant={participant} isAdmin={isAdmin} />;
}

// Shown only if the site was built without a contract address.
function NotConnected() {
  return (
    <Card title="Contract not connected">
      <p className="muted">
        This build has no MediChain contract address, so there is nothing to show. Set{" "}
        <code>VITE_CONTRACT_ADDRESS</code> to the address deployed on {NETWORK.name}.
      </p>
    </Card>
  );
}

export default function Dashboard() {
  return CONTRACT_READY ? <LiveDashboard /> : <NotConnected />;
}
