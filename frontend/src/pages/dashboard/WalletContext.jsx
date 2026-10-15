import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getAddress } from "ethers";
import { CONTRACT_READY, getContract, getSigner } from "./chain";
import { toParticipant } from "./data";
import { friendlyError } from "./errors";

const WalletContext = createContext(null);

const NO_PARTICIPANT = { role: 0, name: "", location: "", active: false };
const SESSION_KEY = "medichain.session";

// Roles a user can sign in as, and the on-chain Role enum value each needs.
export const ROLE_OPTIONS = {
  manufacturer: { label: "Manufacturer", role: 1 },
  distributor: { label: "Distributor", role: 2 },
  pharmacy: { label: "Pharmacy", role: 3 },
  regulator: { label: "Regulator", role: 4 },
};

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage blocked: the session just won't survive a reload
  }
}

const sameAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

// Sign-in = a chosen role + a MetaMask account the contract confirms holds that role.
// One role per session: to use another role, log out (which also disconnects MetaMask).
export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [participant, setParticipant] = useState(NO_PARTICIPANT);
  const [isAdmin, setIsAdmin] = useState(false);
  const [session, setSession] = useState(readSession);
  const [connecting, setConnecting] = useState(false);
  const [loadingRole, setLoadingRole] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(null);
  const signingIn = useRef(false);

  const readRole = useCallback(async (address) => {
    const c = await getContract();
    const [p, admin] = await Promise.all([c.participants(address), c.admin()]);
    return { participant: toParticipant(p), isAdmin: sameAddr(admin, address) };
  }, []);

  const loadRole = useCallback(
    async (address) => {
      latest.current = address;
      if (!CONTRACT_READY) return;
      setLoadingRole(true);
      try {
        const r = await readRole(address);
        if (latest.current !== address) return;
        setParticipant(r.participant);
        setIsAdmin(r.isAdmin);
      } catch (err) {
        if (latest.current === address) setError(`Couldn't read your role: ${friendlyError(err)}`);
      } finally {
        if (latest.current === address) setLoadingRole(false);
      }
    },
    [readRole]
  );

  const clearLocal = useCallback(() => {
    latest.current = null;
    writeSession(null);
    setSession(null);
    setAccount(null);
    setParticipant(NO_PARTICIPANT);
    setIsAdmin(false);
    setLoadingRole(false);
  }, []);

  // Log out of the role and ask MetaMask to forget this site, so the next sign-in starts clean.
  const signOut = useCallback(async () => {
    clearLocal();
    setError("");
    try {
      await window.ethereum?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
    } catch {
      // older wallets don't support revoking; the user can disconnect the site in MetaMask
    }
  }, [clearLocal]);

  // Connect MetaMask and sign in as `roleKey`, only if the contract confirms the wallet holds it.
  const signIn = useCallback(
    async (roleKey) => {
      const wanted = ROLE_OPTIONS[roleKey];
      if (!wanted) return false;
      signingIn.current = true;
      setConnecting(true);
      setError("");
      try {
        const signer = await getSigner();
        const address = await signer.getAddress();
        const r = await readRole(address);
        const holdsRole = r.participant.active && r.participant.role === wanted.role;
        if (!holdsRole) {
          if (!CONTRACT_READY) throw new Error("This site is not connected to a MediChain contract.");
          const actual = r.participant.active
            ? `registered as ${Object.values(ROLE_OPTIONS).find((o) => o.role === r.participant.role)?.label ?? "another role"}`
            : r.participant.role
              ? "deactivated"
              : "not registered on MediChain";
          await signOut(); // forget this wallet first, then explain (signOut clears old errors)
          setError(`This wallet (${address.slice(0, 6)}…${address.slice(-4)}) is ${actual}, not ${wanted.label}. Switch to the right account in MetaMask, or choose another role.`);
          return false;
        }
        const next = { role: roleKey, account: address };
        writeSession(next);
        setSession(next);
        latest.current = address;
        setAccount(address);
        setParticipant(r.participant);
        setIsAdmin(r.isAdmin);
        return true;
      } catch (err) {
        setError(friendlyError(err));
        return false;
      } finally {
        signingIn.current = false;
        setConnecting(false);
      }
    },
    [readRole, signOut]
  );

  // On load, restore the session if MetaMask still has the same account connected.
  // Switching or disconnecting the account in MetaMask ends the session.
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;

    const onAccounts = (accounts) => {
      if (signingIn.current) return; // signIn() handles the account itself
      const current = accounts[0] ? getAddress(accounts[0]) : null;
      const saved = readSession();
      if (!current || !saved || !sameAddr(current, saved.account)) {
        if (saved) clearLocal();
        return;
      }
      setAccount(current);
      loadRole(current);
    };

    eth.request({ method: "eth_accounts" }).then(onAccounts).catch(() => {});
    eth.on?.("accountsChanged", onAccounts);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
    };
  }, [loadRole, clearLocal]);

  const signedIn = Boolean(session && account && sameAddr(session.account, account));

  const value = {
    account: signedIn ? account : null,
    participant: signedIn ? participant : NO_PARTICIPANT,
    isAdmin: signedIn && isAdmin,
    sessionRole: signedIn ? session.role : null,
    signedIn,
    connecting,
    loadingRole,
    error,
    signIn,
    signOut,
    refresh: () => account && loadRole(account),
  };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
