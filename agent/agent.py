from web3 import Web3
from eth_account import Account
import os

w3 = Web3(Web3.HTTPProvider(os.environ.get("ARC_RPC", "https://rpc.testnet.arc.network")))
assert w3.is_connected(), "RPC not reachable"

pk = os.environ["AGENT_PRIVATE_KEY"]
acct = Account.from_key(pk)
sender = acct.address

nonce = w3.eth.get_transaction_count(sender)
gas_price = w3.eth.gas_price  # v6
chain_id = w3.eth.chain_id

tx = {
    "to": Web3.to_checksum_address(os.environ.get("ESCROW_ADDRESS")),  # or a token/escrow call data below
    "value": 0,
    "nonce": nonce,
    "gas": 200000,            # adjust/estimate as needed
    "gasPrice": gas_price,    # v6 still uses "gasPrice" key in the tx dict
    "chainId": chain_id,
    "data": b""               # fill with contract-encoded calldata if calling a function
}

signed = acct.sign_transaction(tx)
tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
rcpt = w3.eth.wait_for_transaction_receipt(tx_hash)
print("tx:", tx_hash.hex(), "status:", rcpt.status)
