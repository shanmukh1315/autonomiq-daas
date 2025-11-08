# agent/tx_debug.py
import os, sys
from web3 import Web3
from web3.exceptions import ContractLogicError

RPC = os.getenv("ARC_RPC", "https://rpc.testnet.arc.network")
w3 = Web3(Web3.HTTPProvider(RPC))

if len(sys.argv) < 2:
    print("Usage: python agent/tx_debug.py <tx_hash>")
    sys.exit(1)

tx_hash_hex = sys.argv[1]
tx_hash = Web3.to_bytes(hexstr=tx_hash_hex)

tx   = w3.eth.get_transaction(tx_hash)
rcpt = w3.eth.get_transaction_receipt(tx_hash)

print("status:", rcpt.status)
print("from:", tx["from"])
print("to:", tx["to"])
print("gasUsed:", rcpt.gasUsed)
print("input (selector):", tx["input"][:10], "… len", len(tx["input"]))

# Try to reproduce with eth_call to fetch revert reason
try:
    block = rcpt.blockNumber - 1 if rcpt.blockNumber and rcpt.blockNumber > 0 else "latest"
    w3.eth.call({"to": tx["to"], "from": tx["from"], "data": tx["input"]}, block_identifier=block)
    print("eth_call succeeded (on-chain failure likely gas/nonce mismatch).")
except ContractLogicError as e:
    print("Revert reason:", str(e))
except Exception as e:
    print("eth_call error:", repr(e))
