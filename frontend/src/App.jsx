import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Navbar, ToastProvider } from "./components/ui";
import { DEMO_MODE } from "./pages/dashboard/chain";
import Dashboard from "./pages/dashboard/Dashboard.jsx";
import Home from "./pages/dashboard/Home.jsx";
import WalletButton from "./pages/dashboard/WalletButton.jsx";
import { WalletProvider } from "./pages/dashboard/WalletContext.jsx";
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
];

export default function App() {
  return (
    <ToastProvider>
      <WalletProvider>
        <Navbar links={NAV_LINKS}>
          <WalletButton />
        </Navbar>
        {DEMO_MODE && (
          <p className="demo-banner">
            Preview: showing sample batches. The live contract on Polygon Amoy is being deployed,
            and this site switches to it automatically.
          </p>
        )}
        <main className="container">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/batch/:batchId" element={<OldBatchLink />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/verify/:batchId" element={<VerifyPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </WalletProvider>
    </ToastProvider>
  );
}
