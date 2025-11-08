// scripts/deploy.js
require("dotenv").config();
const hre = require("hardhat"); // brings in .ethers and network

// Helpers
function req(name, fallback = undefined) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === null || v === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}
function isAddr(x) { try { return hre.ethers.isAddress(x); } catch { return false; } }

async function main() {
  const { ethers, network } = hre;

  // --- signer / chain ---
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const fee = await ethers.provider.getFeeData();
  const gasPrice = fee.gasPrice ?? ethers.parseUnits("0.5", "gwei");

  console.log("—— AutonomiqEscrow Deploy ——");
  console.log("Network:     ", network.name, `(chainId ${chainId})`);
  console.log("Deployer:    ", deployer.address);

  // --- required token + amount ---
  const USDC_ADDRESS = req("USDC_ADDRESS");            // e.g. 0x3600... (Arc testnet)
  const AMOUNT_USDC  = req("AMOUNT_USDC", "1000000");  // base units, 6 decimals (1 USDC)

  // --- participants (allow fallbacks to deployer for speed) ---
  const CLIENT_ADDRESS   = process.env.CLIENT_ADDRESS   || deployer.address;
  const PROVIDER_ADDRESS = process.env.PROVIDER_ADDRESS || deployer.address;
  const ARBITER_ADDRESS  = process.env.ARBITER_ADDRESS  || deployer.address;

  // --- basic validation ---
  for (const [label, addr] of [
    ["USDC_ADDRESS", USDC_ADDRESS],
    ["CLIENT_ADDRESS", CLIENT_ADDRESS],
    ["PROVIDER_ADDRESS", PROVIDER_ADDRESS],
    ["ARBITER_ADDRESS", ARBITER_ADDRESS],
  ]) {
    if (!isAddr(addr)) throw new Error(`Invalid ${label}: ${addr}`);
  }
  const amount = BigInt(AMOUNT_USDC);

  // --- show constructor shape (informational) ---
  const artifact = require("../artifacts/contracts/AutonomiqEscrow.sol/AutonomiqEscrow.json");
  const ctor = artifact.abi.find((x) => x.type === "constructor");
  console.log("Constructor: ", ctor?.inputs?.map(i => `${i.type} ${i.name}`).join(", ") || "(none)");

  // Expected order: (address usdc, address client, address provider, address arbiter, uint256 amount)
  const args = [USDC_ADDRESS, CLIENT_ADDRESS, PROVIDER_ADDRESS, ARBITER_ADDRESS, amount];

  // --- deploy ---
  const Factory = await ethers.getContractFactory("AutonomiqEscrow");
  const contract = await Factory.deploy(...args, { gasPrice });
  console.log("Deploy tx:   ", contract.deploymentTransaction().hash);
  await contract.waitForDeployment();
  const ESCROW_ADDRESS = await contract.getAddress();

  // --- summary ---
  console.log("\n✅ Deployed AutonomiqEscrow");
  console.log("Escrow:      ", ESCROW_ADDRESS);
  console.log("USDC:        ", USDC_ADDRESS);
  console.log("Client:      ", CLIENT_ADDRESS);
  console.log("Provider:    ", PROVIDER_ADDRESS);
  console.log("Arbiter:     ", ARBITER_ADDRESS);
  console.log("Amount (6d): ", amount.toString());
  console.log("Gas price:   ", gasPrice?.toString() || "n/a");

  // Convenience: line to paste into your Vite UI .env
  console.log(`\nPaste into web/.env (or .env.local):`);
  console.log(`VITE_ESCROW=${ESCROW_ADDRESS}`);
  console.log(`VITE_USDC=${USDC_ADDRESS}`);
  console.log(`VITE_ARC_RPC=${process.env.ARC_RPC || ""}`);
}

main().catch((err) => {
  console.error("❌ Deploy failed:", err);
  process.exit(1);
});
