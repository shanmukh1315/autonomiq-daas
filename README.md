# AutonomIQ – Data-as-a-Service (DaaS) on Arc with USDC

A minimal, production-minded hackathon starter:
- **Provider Agent** delivers data (off-chain) and posts a **CID + hash** on-chain.
- **Client** escrows **USDC** in a Solidity contract on **Arc Testnet**.
- **Client** releases payment when satisfied; **Arbiter** can refund on dispute.

## 1) Architecture
```
Client UI  ──(request + escrow)──▶  AutonomiqEscrow (USDC on Arc)
   ▲                                          │
   │                                          │ deliver(cid,hash)
   │                                  Provider Agent (off-chain)
   └───────(download verify data)◀────────────┘
```
- Payments in **USDC** (Arc’s native gas).
- Off-chain storage (IPFS/Arweave/S3) holds the data; on-chain stores only pointers + hash.
- Dispute flow: either party opens dispute; arbiter resolves by calling `refund()` or client calls `release()`.

## 2) Quickstart

### Prereqs
- Node 18+, Python 3.10+, `pip install web3`
- Testnet RPC + test USDC (see event docs/faucet)
- Two accounts: **CLIENT** and **PROVIDER (agent)**

### Setup
```
git init autonomiq-daas-arc && cd autonomiq-daas-arc
# copy files from this bundle into the folder

npm i
cp .env.example .env  # fill values
```

### Compile & Deploy
```
npm run compile
npm run deploy
# -> save contract address to ESCROW_ADDRESS in .env
```

### Fund Escrow (client)
```
npm run fund
```

### Deliver Data (provider agent)
```
# Prepare data file then run agent
export ARC_RPC=...
export AGENT_PRIVATE_KEY=0x...
export ESCROW_ADDRESS=0x...
python agent/agent.py
```

### Release or Refund (client/arbiter)
```
npm run release     # pay provider
npm run refund      # refund client
```

## 3) Contract
- `fund()` – client transfers USDC into escrow
- `deliver(cid, hash)` – provider posts pointer + content hash
- `release()` – client pays provider
- `refund()` – client/arbiter refunds client
- `openDispute(reason)` – mark as disputed; off-chain resolution

## 4) Security Notes
- Use **separate keys** for client and provider; keep agent key minimal balance.
- Never hardcode private keys. Use env vars / vaults.
- Consider allowlists / rate limits if exposing agent endpoints.
- For real systems, add: timeouts, partial payments, milestone releases, signature-based delivery acks.

## 5) Stretch Goals (for extra points)
- **Account Abstraction**: Circle Wallets / Dynamic / Pimlico smart accounts for smooth onboarding.
- **Voice Agent**: Integrate ElevenLabs for voice notifications/commands.
- **Cross-chain USDC**: CCTP V2 to source/sink liquidity.
- **Dashboard**: React app to show on-chain state + receipt explorer links.
- **Zero-knowledge receipt**: Commit-only hash on-chain, decrypt key after payment.

## 6) Pitch Outline (2 minutes)
1. **Problem**: Trustless pay-for-data is clunky; invoices and manual checks delay delivery.
2. **Solution**: AutonomIQ – agent-delivered data with escrowed USDC on Arc. CID+hash verifiable delivery; one-click release.
3. **Why Arc + USDC**: Stable gas & settlement; sub-second finsihing; EVM tooling.
4. **Demo**: Fund → Deliver (CID/hash) → Release → Payment event.
5. **Impact**: Works for analytics bundles, IoT feeds, research datasets.
6. **Roadmap**: AA wallets, disputes marketplace, cross-chain settlement.

## 7) Submission Checklist
- ✅ Public GitHub repo
- ✅ Cover image + slides + 90s demo video
- ✅ README with setup (this file)
- ✅ Working prototype on Arc testnet
- ✅ Clear problem/solution and adoption path

---
MIT License
