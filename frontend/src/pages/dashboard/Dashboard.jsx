import { useCallback, useRef, useState } from "react";
import { Button, Card, Spinner } from "../../components/ui";
import BatchLookup from "./BatchLookup.jsx";
import { CONTRACT_READY, ROLE } from "./chain";
import CreateBatch from "./CreateBatch.jsx";
import MyBatches from "./MyBatches.jsx";
import ParticipantLookup from "./ParticipantLookup.jsx";
import RecallCard from "./RecallCard.jsx";
import RecallList from "./RecallList.jsx";
import RegisterParticipant from "./RegisterParticipant.jsx";
import TransferCard from "./TransferCard.jsx";
import { useWallet } from "./WalletContext";

function NoContract() {
  return (
    <Card title="Contract not connected">
      <p className="muted">
        MediChain isn't pointed at a deployed contract yet. Set <code>VITE_CONTRACT_ADDRESS</code>{" "}
        in <code>frontend/.env</code> (or the repo variable for GitHub Pages) to the deployed address.
      </p>
    </Card>
  );
}

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

// Shows each panel only to the role allowed to use it; the contract enforces the same
// rules, so hiding a panel is about clarity, not security.
export default function Dashboard() {
  const { account, participant, isAdmin, loadingRole, connecting, connect } = useWallet();
  const [version, setVersion] = useState(0); // bump to make lists reload after a transaction
  const [sendTarget, setSendTarget] = useState({ id: "", n: 0 });
  const transferRef = useRef(null);
  const changed = useCallback(() => setVersion((v) => v + 1), []);

  if (!CONTRACT_READY) return <NoContract />;

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
        {isRegulator && <RecallCard onDone={changed} />}
        {isAdmin && <RegisterParticipant />}
        {(isAdmin || isRegulator) && <ParticipantLookup canDeactivate={isAdmin} />}
        <BatchLookup />
      </div>

      {isRegulator && <RecallList version={version} onRefresh={changed} />}
    </div>
  );
}
