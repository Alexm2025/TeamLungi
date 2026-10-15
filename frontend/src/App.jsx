import { Link, Route, Routes } from "react-router-dom";
import { Navbar, ToastProvider } from "./components/ui";
import BatchDetail from "./pages/dashboard/BatchDetail.jsx";
import Dashboard from "./pages/dashboard/Dashboard.jsx";
import Home from "./pages/dashboard/Home.jsx";
import WalletButton from "./pages/dashboard/WalletButton.jsx";
import { WalletProvider } from "./pages/dashboard/WalletContext.jsx";
import VerifyPage from "./pages/verify/VerifyPage.jsx";

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
        <main className="container">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/batch/:batchId" element={<BatchDetail />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/verify/:batchId" element={<VerifyPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </WalletProvider>
    </ToastProvider>
  );
}
