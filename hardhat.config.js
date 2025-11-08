// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const {
  ARC_RPC,            // e.g. https://rpc.testnet.arc.network
  PRIVATE_KEY,        // 0x... deployer key (only needed for deploy, NOT for compile)
} = process.env;

// Build networks conditionally so compile doesn't fail in CI
const networks = {
  hardhat: {},                                  // always available
  ...(ARC_RPC && PRIVATE_KEY
    ? {
        arcTestnet: {
          url: ARC_RPC,
          chainId: 5042002,
          accounts: [
            PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`,
          ],
        },
      }
    : {}),                                      // omit arcTestnet if envs missing
};

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks,
};
