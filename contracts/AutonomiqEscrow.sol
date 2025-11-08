// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

/// @title AutonomIQ Escrow - pay-for-data with USDC on Arc
/// @notice Client escrows USDC, Provider (agent) delivers data (off-chain hash/proof), Client (or arbiter) releases
contract AutonomiqEscrow {
    enum State { Unfunded, Funded, Delivered, Released, Refunded, Disputed }

    IERC20 public immutable usdc;
    address public immutable client;
    address public immutable provider;  // data provider / agent wallet
    address public immutable arbiter;   // optional dispute resolver

    uint256 public amount;              // escrowed amount in USDC (6 decimals typical)
    string  public dataCid;             // IPFS/Arweave/URL pointer to data
    bytes32 public dataHash;            // optional keccak256 hash of payload for verification
    State public state;

    event Funded(address indexed from, uint256 amount);
    event DataDelivered(address indexed provider, string cid, bytes32 hash);
    event Released(address indexed to, uint256 amount);
    event Refunded(address indexed to, uint256 amount);
    event Disputed(address indexed by, string reason);

    modifier onlyClient() { require(msg.sender == client, "only client"); _; }
    modifier onlyProvider() { require(msg.sender == provider, "only provider"); _; }
    modifier onlyArbiter() { require(msg.sender == arbiter, "only arbiter"); _; }

    constructor(address _usdc, address _client, address _provider, address _arbiter, uint256 _amount) {
        require(_usdc != address(0) && _client != address(0) && _provider != address(0), "zero addr");
        usdc = IERC20(_usdc);
        client = _client;
        provider = _provider;
        arbiter = _arbiter == address(0) ? _client : _arbiter; // default: client as arbiter
        amount = _amount;
        state = State.Unfunded;
    }

    /// @notice Client funds escrow by transferring USDC to this contract
    function fund() external onlyClient {
        require(state == State.Unfunded, "bad state");
        require(usdc.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        state = State.Funded;
        emit Funded(msg.sender, amount);
    }

    /// @notice Provider posts delivery pointers and an optional hash for verification
    function deliver(string calldata _cid, bytes32 _hash) external onlyProvider {
        require(state == State.Funded, "bad state");
        dataCid = _cid;
        dataHash = _hash;
        state = State.Delivered;
        emit DataDelivered(msg.sender, _cid, _hash);
    }

    /// @notice Client releases funds to provider
    function release() external onlyClient {
        require(state == State.Delivered, "bad state");
        state = State.Released;
        require(usdc.transfer(provider, amount), "transfer failed");
        emit Released(provider, amount);
    }

    /// @notice Client refunds themselves prior to delivery, or arbiter refunds after dispute
    function refund() external {
        require(msg.sender == client || msg.sender == arbiter, "not authorized");
        require(state == State.Funded || state == State.Disputed, "bad state");
        state = State.Refunded;
        require(usdc.transfer(client, amount), "transfer failed");
        emit Refunded(client, amount);
    }

    /// @notice Either party can open a dispute, arbiter decides off-chain then calls refund() or release()
    function openDispute(string calldata reason) external {
        require(state == State.Funded || state == State.Delivered, "bad state");
        require(msg.sender == client || msg.sender == provider, "not a party");
        state = State.Disputed;
        emit Disputed(msg.sender, reason);
    }
}
