// Single entry point the frontend uses to talk to the MedChain contract.
// Pages import from here instead of creating providers/contracts themselves.
import { BrowserProvider, Contract, JsonRpcProvider, parseUnits } from "ethers";
import MedChainABI from "./MedChain.abi.json";

// Set after deploying (`npm run deploy:amoy` in contracts/ prints it).
// A VITE_CONTRACT_ADDRESS in frontend/.env overrides it, e.g. for a local Hardhat node.
export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

export const ABI = MedChainABI;

// Block the contract was deployed in (printed by the deploy script). Event history is read from here,
// so the activity feed doesn't scan the whole chain.
export const DEPLOY_BLOCK = Number(import.meta.env.VITE_DEPLOY_BLOCK || 0);

// Supported networks. VITE_CHAIN_ID picks one (default Polygon Amoy); pointing VITE_RPC_URL at a
// local Hardhat node (http://127.0.0.1:8545) selects the local chain automatically.
export const NETWORKS = {
  31337: { name: "Hardhat Local", symbol: "ETH", rpc: "http://127.0.0.1:8545", explorer: null },
  80002: {
    name: "Polygon Amoy Testnet",
    symbol: "POL",
    rpc: "https://polygon-amoy-bor-rpc.publicnode.com",
    explorer: "https://amoy.polygonscan.com",
  },
  11155111: {
    name: "Ethereum Sepolia Testnet",
    symbol: "ETH",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
  },
};

const IS_LOCAL = /localhost|127\.0\.0\.1/.test(import.meta.env.VITE_RPC_URL || "");
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || (IS_LOCAL ? 31337 : 80002));
export const NETWORK = NETWORKS[CHAIN_ID] ?? { name: `Chain ${CHAIN_ID}`, symbol: "ETH", rpc: "", explorer: null };
export const RPC_URL = import.meta.env.VITE_RPC_URL || NETWORK.rpc;

// Block explorer links (null on a local chain, which has no explorer).
const explorerLink = (path) => (NETWORK.explorer ? `${NETWORK.explorer}/${path}` : null);
export const txUrl = (hash) => explorerLink(`tx/${hash}`);
export const addressUrl = (address) => explorerLink(`address/${address}`);
export const blockUrl = (number) => explorerLink(`block/${number}`);

// What MetaMask needs to add the network if the user doesn't have it yet.
const NETWORK_PARAMS = {
  chainId: `0x${CHAIN_ID.toString(16)}`,
  chainName: NETWORK.name,
  nativeCurrency: { name: NETWORK.symbol, symbol: NETWORK.symbol, decimals: 18 },
  rpcUrls: [RPC_URL],
  ...(NETWORK.explorer && { blockExplorerUrls: [NETWORK.explorer] }),
};

// True once a real contract address is configured; pages can show "Contract not connected" otherwise.
export const isContractConfigured = () => !/^0x0{40}$/.test(CONTRACT_ADDRESS);

// Number -> label maps matching the Solidity enums (index = enum value).
export const ROLE = ["None", "Manufacturer", "Distributor", "Pharmacy", "Regulator"];
export const STATUS = ["Created", "In Transit", "At Distributor", "At Pharmacy", "Recalled", "Awaiting Approval"];

let readProvider;

// Wallets often over-estimate fees on testnets and then show a fee warning. Before a transaction
// goes to MetaMask, attach the real network fee (current base fee x2 plus a small tip) so MetaMask
// shows a "site suggested" fee close to what it actually costs.
// Testnet blocks are far from full, so a 0.01 gwei tip is mined in the next block (~12 s).
const TIP = parseUnits("0.01", "gwei");
const hex = (n) => `0x${n.toString(16)}`;
class SuggestedFeeProvider extends BrowserProvider {
  async send(method, params) {
    if (method === "eth_sendTransaction" && params?.[0] && !params[0].maxFeePerGas && !params[0].gasPrice) {
      try {
        const block = await getProvider().getBlock("latest");
        const base = block?.baseFeePerGas ?? 0n;
        params = [{ ...params[0], maxPriorityFeePerGas: hex(TIP), maxFeePerGas: hex(base * 2n + TIP) }];
      } catch {
        // fee lookup failed: let MetaMask choose the fee as usual
      }
    }
    return super.send(method, params);
  }
}

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

  const provider = IS_LOCAL ? new BrowserProvider(window.ethereum) : new SuggestedFeeProvider(window.ethereum);
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
