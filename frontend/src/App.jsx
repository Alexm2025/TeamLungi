import { Link, Route, Routes, useParams } from "react-router-dom";
import Navbar from "./components/ui/Navbar.jsx";
import Dashboard from "./pages/dashboard/Dashboard.jsx";
import Home from "./pages/dashboard/Home.jsx";
import MockRoleSwitcher from "./pages/dashboard/MockRoleSwitcher.jsx";
import WalletButton from "./pages/dashboard/WalletButton.jsx";
import { WalletProvider } from "./pages/dashboard/WalletContext.jsx";

// TEMPORARY until Member C's page is on main. Then delete this function and use:
// import VerifyPage from "./pages/verify/VerifyPage.jsx";
function VerifyPage() {
  const { batchId } = useParams();
  return (
    <section className="panel">
      <h1>Verify a batch</h1>
      <p className="muted">
        {batchId ? `Batch "${batchId}": ` : ""}the verification page is being built by Member C.
      </p>
    </section>
  );
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
    <WalletProvider>
      <Navbar links={NAV_LINKS}>
        <MockRoleSwitcher />
        <WalletButton />
      </Navbar>
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/verify/:batchId" element={<VerifyPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </WalletProvider>
  );
}
