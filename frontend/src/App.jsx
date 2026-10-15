import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Navbar, ToastProvider } from "./components/ui";
import { CONTRACT_ADDRESS, CONTRACT_READY, NETWORK, addressUrl } from "./pages/dashboard/chain";
import Dashboard from "./pages/dashboard/Dashboard.jsx";
import Home from "./pages/dashboard/Home.jsx";
import WalletButton from "./pages/dashboard/WalletButton.jsx";
import { WalletProvider } from "./pages/dashboard/WalletContext.jsx";
import LedgerPage from "./pages/ledger/LedgerPage.jsx";
import VerifyPage from "./pages/verify/VerifyPage.jsx";

// The old dashboard batch page was merged into Verify; keep links that were already shared working.
function OldBatchLink() {
  const { batchId } = useParams();
  return <Navigate to={`/verify/${encodeURIComponent(batchId)}`} replace />;
}

function NotFound() {
  return (
    <section className="panel center">
      <h1>Page not found</h1>
      <Link to="/">Back to home</Link>
    </section>
  );
}

const NAV_LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/verify", label: "Verify" },
  { to: "/ledger", label: "Ledger" },
];

// Tells every visitor which network and contract the data comes from, with a link to check it.
function NetworkBanner() {
  if (!CONTRACT_READY) {
    return <p className="demo-banner">Not connected: this build has no MediChain contract address configured.</p>;
  }
  const url = addressUrl(CONTRACT_ADDRESS);
  return (
    <p className="network-banner">
      <span className="live-dot" aria-hidden="true" /> Live on {NETWORK.name} · contract{" "}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="mono">
          {CONTRACT_ADDRESS.slice(0, 8)}…{CONTRACT_ADDRESS.slice(-6)} ↗
        </a>
      ) : (
        <span className="mono">{CONTRACT_ADDRESS}</span>
      )}
    </p>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <WalletProvider>
        <Navbar links={NAV_LINKS}>
          <WalletButton />
        </Navbar>
        <NetworkBanner />
        <main className="container">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/batch/:batchId" element={<OldBatchLink />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/verify/:batchId" element={<VerifyPage />} />
            <Route path="/ledger/*" element={<LedgerPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </WalletProvider>
    </ToastProvider>
  );
}
