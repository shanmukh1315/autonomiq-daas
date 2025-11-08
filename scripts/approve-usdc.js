require("dotenv").config();
const { ethers } = require("hardhat");

const erc20Abi = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

async function main() {
  const [signer] = await ethers.getSigners();
  const usdc = new ethers.Contract(process.env.USDC_ADDRESS, erc20Abi, signer);

  const amt = BigInt(process.env.AMOUNT_USDC); // already in 6-decimal base units
  const tx = await usdc.approve(process.env.ESCROW_ADDRESS, amt);
  console.log("approve() sent:", tx.hash);
  await tx.wait();
  const allow = await usdc.allowance(signer.address, process.env.ESCROW_ADDRESS);
  console.log("allowance now:", allow.toString());
}

main().catch((e)=>{ console.error(e); process.exit(1); });
