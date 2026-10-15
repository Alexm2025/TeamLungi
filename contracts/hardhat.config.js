require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { AMOY_RPC_URL, SEPOLIA_RPC_URL, PRIVATE_KEY } = process.env;

// Only pass the key to Hardhat if it looks like a real 32-byte hex key.
// Otherwise a missing/placeholder .env would break `npx hardhat test` for everyone.
const isValidKey = /^(0x)?[0-9a-fA-F]{64}$/.test(PRIVATE_KEY || "");
const accounts = isValidKey ? [PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
  },
  networks: {
    amoy: {
      url: AMOY_RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com",
      chainId: 80002,
      accounts,
    },
    // Ethereum Sepolia testnet: fallback when the Amoy faucet is unavailable.
    sepolia: {
      url: SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts,
    },
  },
};
