/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const deploymentPath = path.join(repoRoot, "deployments", "sepolia", "SecureRoll.json");
  const artifactPath = path.join(repoRoot, "artifacts", "contracts", "SecureRoll.sol", "SecureRoll.json");

  let abiSourcePath = null;
  if (fs.existsSync(deploymentPath)) abiSourcePath = deploymentPath;
  else if (fs.existsSync(artifactPath)) abiSourcePath = artifactPath;

  if (!abiSourcePath) {
    throw new Error(
      "Missing ABI source. Run `npx hardhat compile` (for artifacts) or `npx hardhat deploy --network sepolia` (for deployments) first.",
    );
  }

  const json = readJson(abiSourcePath);
  if (!Array.isArray(json.abi)) {
    throw new Error(`Invalid ABI in ${abiSourcePath}`);
  }

  const outPath = path.join(repoRoot, "ui", "src", "config", "secureRollAbi.ts");
  const ts = `export const SECURE_ROLL_ABI = ${JSON.stringify(json.abi, null, 2)} as const;\n`;

  fs.writeFileSync(outPath, ts, "utf8");
  console.log(`Wrote ${outPath} from ${abiSourcePath}`);
}

main();

