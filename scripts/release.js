const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const escrowAddr = process.env.ESCROW_ADDRESS;
  if (!escrowAddr) throw new Error("Missing ESCROW_ADDRESS");
  const escrow = await hre.ethers.getContractAt("AutonomiqEscrow", escrowAddr);
  const tx = await escrow.release();
  await tx.wait();
  console.log("Funds released to provider");
}

main().catch((e) => { console.error(e); process.exit(1); });
