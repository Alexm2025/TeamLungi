const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(`No deployer account for network "${network.name}". Set PRIVATE_KEY in contracts/.env.`);
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:  ${network.name} (chainId ${network.config.chainId ?? "local"})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} ${network.name === "sepolia" ? "ETH" : "POL"}`);

  const medChain = await ethers.deployContract("MedChain");
  await medChain.waitForDeployment();
  const address = await medChain.getAddress();
  const receipt = await medChain.deploymentTransaction().wait();

  console.log(`\nMedChain deployed to: ${address} (block ${receipt.blockNumber})`);
  console.log("The deployer is the admin and is registered as Regulator.");
  const explorers = { amoy: "https://amoy.polygonscan.com", sepolia: "https://sepolia.etherscan.io" };
  if (explorers[network.name]) {
    console.log(`Explorer: ${explorers[network.name]}/address/${address}`);
  }

  // Record the deployment so seed.js and the frontend config can find it.
  // The in-memory "hardhat" network disappears when the script ends, so it isn't saved.
  if (network.name !== "hardhat") {
    const out = path.join(__dirname, "..", "deployments", `${network.name}.json`);
    const record = {
      address,
      chainId: Number((await ethers.provider.getNetwork()).chainId),
      deployer: deployer.address,
      blockNumber: receipt.blockNumber,
      deployedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
    console.log(`Saved ${path.relative(process.cwd(), out)}`);
  }

  console.log(`\nNext: set VITE_CONTRACT_ADDRESS=${address} and VITE_DEPLOY_BLOCK=${receipt.blockNumber} VITE_CHAIN_ID=${Number((await ethers.provider.getNetwork()).chainId)} for the frontend`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
