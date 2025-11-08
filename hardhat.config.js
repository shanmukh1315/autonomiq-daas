// hardhat.config.js
require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

/**
 * Env you may set locally or in GitHub → Settings → Secrets and variables → Actions
 *
 * ARC_RPC        = https://rpc.testnet.arc.network
 * PRIVATE_KEY    = 0x...  (the deployer wallet PK; NEVER commit this)
 * ARC_CHAIN_ID   = 5042002 (optional; defaults below)
 */

const ARC_RPC     = process.env.ARC_RPC;
const PRIVATE_KEY = process.env.PRIVATE_KEY?.trim();
const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID || 5042002);

// Always keep local Hardhat network available
const networks = {
  hardhat: {
    // tweak if you want forking or chainId here
  },
};

// Add Arc Testnet ONLY if we actually have a URL
if (ARC_RPC) {
  networks.arcTestnet = {
    url: ARC_RPC,                 // must be a valid string or HH8 will fire
    chainId: ARC_CHAIN_ID,
    accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [], // empty = read-only ops in scripts
  };
}

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks,
  mocha: { timeout: 120000 },
};
