require("dotenv").config();
const { ethers } = require("hardhat");

const erc20Abi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  const escrow = process.env.ESCROW_ADDRESS;
  const usdc = process.env.USDC_ADDRESS;

  console.log("Network:", net.chainId.toString());
  console.log("Deployer:", signer.address);
  console.log("Escrow:", escrow);
  console.log("USDC:", usdc);

  const nativeBal = await ethers.provider.getBalance(signer.address);
  console.log("Native (USDC) balance (wei):", nativeBal.toString());

  const token = new ethers.Contract(usdc, erc20Abi, signer);
  console.log("USDC name:", await token.name());
  console.log("USDC symbol:", await token.symbol());
  console.log("USDC decimals:", await token.decimals());

  const balDeployer = await token.balanceOf(signer.address);
  const balEscrow = await token.balanceOf(escrow);
  console.log("USDC balance (deployer):", balDeployer.toString());
  console.log("USDC balance (escrow):", balEscrow.toString());
}

main().catch((e)=>{ console.error(e); process.exit(1); });
