// Single entry point the frontend uses to talk to the MedChain contract.
// Pages import from here instead of creating providers/contracts themselves.
import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";
import MedChainABI from "./MedChain.abi.json";

// Set after deploying (`npm run deploy:amoy` in contracts/ prints it).
// A VITE_CONTRACT_ADDRESS in frontend/.env overrides it, e.g. for a local Hardhat node.
export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

export const ABI = MedChainABI;

// Block the contract was deployed in (printed by the deploy script). Event history is read from here,
// so the activity feed doesn't scan the whole chain.
export const DEPLOY_BLOCK = Number(import.meta.env.VITE_DEPLOY_BLOCK || 0);

// Polygon Amoy testnet by default. Pointing VITE_RPC_URL at a local Hardhat node
// (http://127.0.0.1:8545) switches everything, including MetaMask, to that chain instead.
export const RPC_URL = import.meta.env.VITE_RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com";
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(RPC_URL);
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || (IS_LOCAL ? 31337 : 80002));

// What MetaMask needs to add the network if the user doesn't have it yet.
const NETWORK_PARAMS = IS_LOCAL
  ? {
      chainId: `0x${CHAIN_ID.toString(16)}`,
      chainName: "Hardhat Local",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: [RPC_URL],
    }
  : {
      chainId: `0x${CHAIN_ID.toString(16)}`, // 0x13882 for Amoy
      chainName: "Polygon Amoy Testnet",
      nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
      rpcUrls: [RPC_URL],
      blockExplorerUrls: ["https://amoy.polygonscan.com"],
    };

// True once a real contract address is configured; pages can show "Contract not connected" otherwise.
export const isContractConfigured = () => !/^0x0{40}$/.test(CONTRACT_ADDRESS);

// Number -> label maps matching the Solidity enums (index = enum value).
export const ROLE = ["None", "Manufacturer", "Distributor", "Pharmacy", "Regulator"];
export const STATUS = ["Created", "In Transit", "At Distributor", "At Pharmacy", "Recalled"];

let readProvider;

// Read-only provider. Always uses the public RPC rather than MetaMask, so reads work for
// visitors without a wallet and don't break when MetaMask is on a different network.
export function getProvider() {
  if (!readProvider) readProvider = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
  return readProvider;
}

// Asks MetaMask to connect, switches it to our chain if needed, and returns the signer.
export async function getSigner() {
  if (!window.ethereum) throw new Error("MetaMask not found. Install it to sign transactions.");

  await window.ethereum.request({ method: "eth_requestAccounts" });
  await ensureNetwork();

  const provider = new BrowserProvider(window.ethereum);
  return provider.getSigner();
}

// getContract() for reads, getContract(true) for transactions.
export async function getContract(withSigner = false) {
  const runner = withSigner ? await getSigner() : getProvider();
  return new Contract(CONTRACT_ADDRESS, ABI, runner);
}

async function ensureNetwork() {
  const current = await window.ethereum.request({ method: "eth_chainId" });
  if (parseInt(current, 16) === CHAIN_ID) return;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: NETWORK_PARAMS.chainId }],
    });
  } catch (err) {
    // 4902 = MetaMask doesn't know this chain yet, so add it (which also switches to it).
    if (err.code !== 4902) throw err;
    await window.ethereum.request({ method: "wallet_addEthereumChain", params: [NETWORK_PARAMS] });
  }
}
