// Copies the compiled MedChain ABI into the frontend so contract.js always matches the contract.
// Run after any contract change: `npm run export-abi` (compiles first).
const fs = require("fs");
const path = require("path");

const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "MedChain.sol", "MedChain.json");
const outPath = path.join(__dirname, "..", "..", "frontend", "src", "lib", "MedChain.abi.json");

if (!fs.existsSync(artifactPath)) {
  console.error("Artifact not found. Run `npx hardhat compile` first.");
  process.exit(1);
}

const { abi } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(abi, null, 2) + "\n");
console.log(`Wrote ${abi.length} ABI entries to ${path.relative(process.cwd(), outPath)}`);
