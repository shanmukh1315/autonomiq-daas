// scripts/check.js
const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const bal = await ethers.provider.getBalance(signer.address); // native balance (USDC on Arc)
  const fee = await ethers.provider.getFeeData();

  console.log("Network name:", net.name);
  console.log("Chain ID:", net.chainId.toString());
  console.log("Deployer:", signer.address);
  console.log("Native balance (wei):", bal.toString());
  console.log("Suggested gasPrice (wei):", fee.gasPrice?.toString() || "N/A");
}

main().catch((e) => { console.error(e); process.exit(1); });
