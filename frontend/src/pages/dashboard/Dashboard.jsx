import { useCallback, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Button, Card, Spinner } from "../../components/ui";
import { DEMO_MODE, ROLE } from "./chain";
import CreateBatch from "./CreateBatch.jsx";
import { DEMO_ACCOUNTS } from "./demo";
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

      {isRegulator && <RecallList version={version} onRefresh={changed} />}
    </div>
  );
}

// The role picked on the home page (?role=manufacturer), if it's one we know.
function useRequestedRole() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("role");
  const valid = requested && Object.hasOwn(DEMO_ACCOUNTS, requested) ? requested : null;
  const setRequested = (key) => setParams({ role: key }, { replace: true });
  return [valid, setRequested];
}

// Real dashboard: the role comes from the connected wallet.
function LiveDashboard() {
  const { account, participant, isAdmin, loadingRole, connecting, connect } = useWallet();
  const [requested] = useRequestedRole();

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

  // A home-page box can't change a wallet's role (the blockchain decides it), so if the
  // two differ, say which dashboard this wallet actually gets.
  const requestedRole = requested && DEMO_ACCOUNTS[requested].participant.role;
  const mismatch = participant.active && requestedRole && requestedRole !== participant.role;

  return (
    <>
      {mismatch && (
        <Alert type="info" className="mb">
          You chose {DEMO_ACCOUNTS[requested].label}, but this wallet is registered as{" "}
          {ROLE[participant.role]}, so this is the {ROLE[participant.role]} dashboard. Switch
          accounts in MetaMask to use another role.
        </Alert>
      )}
      <DashboardPanels account={account} participant={participant} isAdmin={isAdmin} />
    </>
  );
}

// Preview before the contract is deployed: pick a sample company and see its dashboard.
// The tab follows ?role= in the address, so the home-page boxes open the matching one.
function PreviewDashboard() {
  const [requested, setRequested] = useRequestedRole();
  const roleKey = requested ?? "manufacturer";
  const who = DEMO_ACCOUNTS[roleKey];

  return (
    <div className="dashboard">
      <Alert type="info" title="Preview with sample data">
        Choose a role to see that company's dashboard. Buttons that write to the blockchain are
        switched on once the MediChain contract is live on Polygon Amoy.
      </Alert>
      <div className="role-tabs" role="tablist" aria-label="Preview as">
        {Object.entries(DEMO_ACCOUNTS).map(([key, acc]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === roleKey}
            className={`role-tab role-${acc.participant.role}${key === roleKey ? " selected" : ""}`}
            onClick={() => setRequested(key)}
          >
            {acc.label}
          </button>
        ))}
      </div>
      {/* key: switching role starts that dashboard fresh */}
      <DashboardPanels
        key={roleKey}
        account={who.address}
        participant={who.participant}
        isAdmin={roleKey === "regulator"}
      />
    </div>
  );
}

export default function Dashboard() {
  return DEMO_MODE ? <PreviewDashboard /> : <LiveDashboard />;
}
