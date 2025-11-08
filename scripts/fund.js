const hre = require("hardhat");
require("dotenv").config();

const IERC20_ABI = [
  "function approve(address spender, uint256 value) external returns (bool)"
];

async function main() {
  const escrowAddr = process.env.ESCROW_ADDRESS;
  const usdcAddr = process.env.USDC_ADDRESS;
  const amount = process.env.AMOUNT_USDC || "1000000";

  if (!escrowAddr || !usdcAddr) throw new Error("Missing env ESCROW_ADDRESS/USDC_ADDRESS");

  const [signer] = await hre.ethers.getSigners();
  const usdc = new hre.ethers.Contract(usdcAddr, IERC20_ABI, signer);
  const tx1 = await usdc.approve(escrowAddr, amount);
  await tx1.wait();
  const escrow = await hre.ethers.getContractAt("AutonomiqEscrow", escrowAddr);
  const tx2 = await escrow.fund();
  await tx2.wait();
  console.log("Escrow funded");
}

main().catch((e) => { console.error(e); process.exit(1); });
