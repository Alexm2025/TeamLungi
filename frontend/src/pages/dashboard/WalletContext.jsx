import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getAddress } from "ethers";
import { getContract, getSigner } from "./chain";
import { friendlyError } from "./errors";

const WalletContext = createContext(null);

const NO_PARTICIPANT = { role: 0, name: "", location: "", active: false };

// Holds the connected account and its on-chain role, so any page can read them with useWallet().
export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [participant, setParticipant] = useState(NO_PARTICIPANT);
  const [isAdmin, setIsAdmin] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loadingRole, setLoadingRole] = useState(false);
  const [error, setError] = useState("");

  // The account we most recently asked about; lets us drop answers for an account
  // the user has already switched away from in MetaMask.
  const latest = useRef(null);

  const loadRole = useCallback(async (address) => {
    latest.current = address;
    setLoadingRole(true);
    setError("");
    try {
      const c = await getContract();
      const [p, admin] = await Promise.all([c.participants(address), c.admin()]);
      if (latest.current !== address) return;
      // participants() returns a struct; ethers lets us read it by field name or by index
      setParticipant({
        role: Number(p.role ?? p[0]),
        name: p.name ?? p[1],
        location: p.location ?? p[2],
        active: Boolean(p.active ?? p[3]),
      });
      setIsAdmin(admin.toLowerCase() === address.toLowerCase());
    } catch (err) {
      if (latest.current !== address) return;
      setParticipant(NO_PARTICIPANT);
      setIsAdmin(false);
      setError(`Couldn't read your role: ${friendlyError(err)}`);
    } finally {
      if (latest.current === address) setLoadingRole(false);
    }
  }, []);

  const reset = useCallback(() => {
    latest.current = null;
    setAccount(null);
    setParticipant(NO_PARTICIPANT);
    setIsAdmin(false);
    setLoadingRole(false);
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError("");
    try {
      const signer = await getSigner();
      const address = await signer.getAddress();
      setAccount(address);
      await loadRole(address);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setConnecting(false);
    }
  }, [loadRole]);

  const refresh = useCallback(() => {
    if (account) loadRole(account);
  }, [account, loadRole]);

  // On load, reconnect silently if MetaMask already trusts this site
  // (eth_accounts never opens a pop-up), and follow account/network switches.
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;

    const onAccounts = (accounts) => {
      if (!accounts.length) return reset();
      const address = getAddress(accounts[0]); // checksummed form
      setAccount(address);
      loadRole(address);
    };
    // MetaMask recommends a full reload when the network changes
    const onChain = () => window.location.reload();

    eth.request({ method: "eth_accounts" }).then(onAccounts).catch(() => {});
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [loadRole, reset]);

  const value = {
    account,
    participant,
    isAdmin,
    connecting,
    loadingRole,
    error,
    connect,
    refresh,
  };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
