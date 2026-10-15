const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(`No deployer account for network "${network.name}". Set PRIVATE_KEY in contracts/.env.`);
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:  ${network.name} (chainId ${network.config.chainId ?? "local"})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} POL`);

  const medChain = await ethers.deployContract("MedChain");
  await medChain.waitForDeployment();
  const address = await medChain.getAddress();

  console.log(`\nMedChain deployed to: ${address}`);
  console.log("The deployer is the admin and is registered as Regulator.");
  if (network.name === "amoy") {
    console.log(`Explorer: https://amoy.polygonscan.com/address/${address}`);
  }
  console.log(`\nNext: set CONTRACT_ADDRESS = "${address}" in frontend/src/lib/contract.js`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
