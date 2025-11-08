require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { ARC_RPC, ARC_CHAIN_ID, PRIVATE_KEY } = process.env;

module.exports = {
  solidity: "0.8.24",
  networks: {
    arcTestnet: {
      url: ARC_RPC,                           // e.g. https://rpc.testnet.arc.network
      chainId: Number(ARC_CHAIN_ID || 5042002),
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
