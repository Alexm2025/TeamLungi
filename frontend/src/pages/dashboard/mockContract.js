// TEMPORARY stand-in for src/lib/contract.js (Member A's file).
// Same exports as the real one, so pages can be built before the contract
// lands on main. Wallet connection is real (MetaMask); contract data is fake.
// Delete this file (and MockRoleSwitcher.jsx) once chain.js points at the real lib.
import { BrowserProvider, JsonRpcProvider, ZeroAddress } from "ethers";

const AMOY_RPC = "https://rpc-amoy.polygon.technology";
const MOCK_ROLE_KEY = "medichain.mockRole";

export const CONTRACT_ADDRESS = ZeroAddress;
export const ABI = [];

export const ROLE = {
  0: "None",
  1: "Manufacturer",
  2: "Distributor",
  3: "Pharmacy",
  4: "Regulator",
};

export const STATUS = {
  0: "Created",
  1: "InTransit",
  2: "AtDistributor",
  3: "AtPharmacy",
  4: "Recalled",
};

export function getProvider() {
  return window.ethereum
    ? new BrowserProvider(window.ethereum)
    : new JsonRpcProvider(AMOY_RPC);
}

export async function getSigner() {
  if (!window.ethereum) {
    throw new Error("MetaMask not found. Install the MetaMask extension to connect.");
  }
  // getSigner() opens the MetaMask connect pop-up if this site isn't connected yet
  return new BrowserProvider(window.ethereum).getSigner();
}

// In mock mode every address gets the same role, picked with the navbar's dev switcher.
export function getMockRole() {
  try {
    const saved = localStorage.getItem(MOCK_ROLE_KEY);
    return saved === null ? 4 : Number(saved);
  } catch {
    return 4;
  }
}

export function setMockRole(role) {
  try {
    localStorage.setItem(MOCK_ROLE_KEY, String(role));
  } catch {
    // storage blocked (private window) – the role just won't survive a reload
  }
}

const mockContract = {
  // Pretend the connected wallet deployed the contract whenever it plays Regulator.
  async admin() {
    if (getMockRole() !== 4 || !window.ethereum) return ZeroAddress;
    const [account] = await window.ethereum.request({ method: "eth_accounts" });
    return account ?? ZeroAddress;
  },

  async participants() {
    const role = getMockRole();
    return {
      role: BigInt(role),
      name: role ? `Mock ${ROLE[role]}` : "",
      location: role ? "Test City" : "",
      active: role !== 0,
    };
  },
};

export async function getContract() {
  return mockContract;
}
