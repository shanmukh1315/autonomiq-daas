import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import {
  Database, RefreshCw, TriangleAlert, DollarSign,
  LinkIcon, UploadCloud, ShieldCheck, Copy
} from "lucide-react";

/**
 * Autonomiq — DaaS Escrow on Arc (MetaMask)
 * - Robust reads + explicit “Refresh balances” button
 */

// ---- Minimal ABIs ----
const ESCROW_ABI = [
  { type:"function", stateMutability:"nonpayable", name:"fund", inputs:[], outputs:[] },
  { type:"function", stateMutability:"nonpayable", name:"deliver", inputs:[{name:"_cid",type:"string"},{name:"_hash",type:"bytes32"}], outputs:[] },
  { type:"function", stateMutability:"nonpayable", name:"release", inputs:[], outputs:[] },
  { type:"function", stateMutability:"nonpayable", name:"refund", inputs:[], outputs:[] },
  { type:"function", stateMutability:"nonpayable", name:"openDispute", inputs:[{name:"reason",type:"string"}], outputs:[] },
  { type:"function", stateMutability:"view", name:"amount", inputs:[], outputs:[{type:"uint256"}] },
  { type:"function", stateMutability:"view", name:"client", inputs:[], outputs:[{type:"address"}] },
  { type:"function", stateMutability:"view", name:"provider", inputs:[], outputs:[{type:"address"}] },
  { type:"function", stateMutability:"view", name:"arbiter", inputs:[], outputs:[{type:"address"}] },
  { type:"function", stateMutability:"view", name:"state", inputs:[], outputs:[{type:"uint8"}] },
  { type:"function", stateMutability:"view", name:"dataCid", inputs:[], outputs:[{type:"string"}] },
  { type:"function", stateMutability:"view", name:"dataHash", inputs:[], outputs:[{type:"bytes32"}] },
  { type:"function", stateMutability:"view", name:"usdc", inputs:[], outputs:[{type:"address"}] },
];

const ERC20_ABI = [
  { type:"function", name:"decimals", stateMutability:"view", inputs:[], outputs:[{type:"uint8"}] },
  { type:"function", name:"symbol",   stateMutability:"view", inputs:[], outputs:[{type:"string"}] },
  { type:"function", name:"balanceOf",stateMutability:"view", inputs:[{name:"a",type:"address"}], outputs:[{type:"uint256"}] },
  { type:"function", name:"allowance",stateMutability:"view", inputs:[{name:"o",type:"address"},{name:"s",type:"address"}], outputs:[{type:"uint256"}] },
  { type:"function", name:"approve",  stateMutability:"nonpayable", inputs:[{name:"s",type:"address"},{name:"amt",type:"uint256"}], outputs:[{type:"bool"}] },
];

const prettyState = (s) =>
  ({ 0: "Created", 1: "Funded", 2: "Delivered", 3: "Closed" }[Number(s)] ?? String(s));

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm font-medium break-all">{children}</div>
    </div>
  );
}
function Stat({ icon: Icon, label, value }) {
  return (
    <div className="p-4 rounded-2xl shadow bg-white border">
      <div className="flex items-center gap-2 text-gray-600">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase">{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold break-all">{value}</div>
    </div>
  );
}

export default function AutonomiqDashboardWallet() {
  const [rpc, setRpc] = useState(import.meta.env.VITE_ARC_RPC || "https://rpc.testnet.arc.network");
  const [escrow, setEscrow] = useState(import.meta.env.VITE_ESCROW || "");
  const [usdc, setUsdc] = useState(import.meta.env.VITE_USDC || "0x3600000000000000000000000000000000000000");
  const [role, setRole] = useState("client");
  const [cid, setCid] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const [info, setInfo] = useState({});
  const [tokenMeta, setTokenMeta] = useState({ symbol: "USDC", decimals: 6 });
  const [allowance, setAllowance] = useState(null);
  const [balances, setBalances] = useState({ escrow: null, client: null, provider: null });
  const EXPLORER_TX = import.meta.env.VITE_EXPLORER_TX || "";

  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");

  const jsonProvider = useMemo(() => new ethers.JsonRpcProvider(rpc), [rpc]);
  const walletProvider = useMemo(() => {
    if (typeof window === "undefined" || !window.ethereum) return null;
    try {
      return new ethers.BrowserProvider(window.ethereum);
    } catch {
      return null;
    }
  }, []);

  const readEscrow = useMemo(() => {
    try {
      return escrow ? new ethers.Contract(escrow, ESCROW_ABI, jsonProvider) : null;
    } catch {
      return null;
    }
  }, [escrow, jsonProvider]);

  const writeEscrow = useMemo(() => {
    if (!walletProvider || !escrow) return null;
    try {
      return new ethers.Contract(escrow, ESCROW_ABI, walletProvider);
    } catch {
      return null;
    }
  }, [escrow, walletProvider]);

  const readUSDC = useMemo(() => {
    try {
      return usdc ? new ethers.Contract(usdc, ERC20_ABI, jsonProvider) : null;
    } catch {
      return null;
    }
  }, [usdc, jsonProvider]);

  const writeUSDC = useMemo(() => {
    if (!walletProvider || !usdc) return null;
    try {
      return new ethers.Contract(usdc, ERC20_ABI, walletProvider);
    } catch {
      return null;
    }
  }, [usdc, walletProvider]);

  const pushLog = (m, h = null) =>
    setLog((l) => [{ t: new Date().toLocaleTimeString(), m, h }, ...l].slice(0, 60));
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  async function connectWallet() {
    if (!walletProvider) {
      alert("MetaMask not found");
      return;
    }
    const accts = await walletProvider.send("eth_requestAccounts", []);
    const net = await walletProvider.getNetwork();
    setAccount(ethers.getAddress(accts[0]));
    setChainId(Number(net.chainId).toString());
  }

  async function loadAll() {
    if (!readEscrow) return;
    setBusy(true);
    try {
      const [client, providerAddr, arbiter, amount, state, dataCid, dataHash, usdcAddr] =
        await Promise.all([
          readEscrow.client(),
          readEscrow.provider(),
          readEscrow.arbiter(),
          readEscrow.amount(),
          readEscrow.state(),
          readEscrow.dataCid(),
          readEscrow.dataHash(),
          readEscrow.usdc(),
        ]);

      setInfo({
        client,
        provider: providerAddr,
        arbiter,
        amount: amount.toString(),
        state: Number(state),
        dataCid,
        dataHash,
        usdc: usdcAddr,
      });
      if (usdcAddr && ethers.isAddress(usdcAddr)) setUsdc(usdcAddr);

      // Token meta (best effort)
      let symbol = "USDC",
        decimals = 6;
      try {
        symbol = await readUSDC.symbol();
      } catch {}
      try {
        decimals = Number(await readUSDC.decimals());
      } catch {}
      setTokenMeta({ symbol, decimals });

      // ---- Robust balances & allowance (per-call try/catch) ----
      let escBal = 0n,
        clientBal = 0n,
        provBal = 0n,
        allow = 0n;

      try {
        escBal = await readUSDC.balanceOf(escrow);
      } catch (e) {
        console.warn("escrow bal read failed", e);
      }
      try {
        clientBal = await readUSDC.balanceOf(client);
      } catch (e) {
        console.warn("client bal read failed", e);
      }
      try {
        provBal = await readUSDC.balanceOf(providerAddr);
      } catch (e) {
        console.warn("provider bal read failed", e);
      }
      try {
        allow = await readUSDC.allowance(client, escrow);
      } catch (e) {
        console.warn("allowance read failed", e);
      }

      setBalances({
        escrow: escBal.toString(),
        client: clientBal.toString(),
        provider: provBal.toString(),
      });
      setAllowance(allow.toString());

      pushLog("Loaded on-chain state");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (escrow) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escrow]);

  const fmt = (v) => {
    try {
      return Number(ethers.formatUnits(v || 0n, tokenMeta.decimals)).toLocaleString();
    } catch {
      return String(v);
    }
  };
  const isSignerClient = account && info.client?.toLowerCase() === account.toLowerCase();
  const isSignerProv = account && info.provider?.toLowerCase() === account.toLowerCase();
  const isSignerArb = account && info.arbiter?.toLowerCase() === account.toLowerCase();

  // Actions
  async function doApprove() {
    if (!writeUSDC || !account) return pushLog("Connect wallet first");
    const signer = await walletProvider.getSigner();
    const amt = info.amount ? BigInt(info.amount) : 0n;
    const tx = await writeUSDC.connect(signer).approve(escrow, amt);
    pushLog("approve() sent", tx.hash);
    await tx.wait();
    pushLog("approve() confirmed");
    await loadAll();
  }
  async function doFund() {
    if (!writeEscrow || !isSignerClient) return pushLog("Fund: wallet must be client");
    const signer = await walletProvider.getSigner();
    const tx = await writeEscrow.connect(signer).fund();
    pushLog("fund() sent", tx.hash);
    await tx.wait();
    pushLog("fund() confirmed");
    await loadAll();
  }
  async function doDeliver() {
    if (!writeEscrow || !isSignerProv) return pushLog("Deliver: wallet must be provider");
    if (!cid || !fileHash) return pushLog("CID and bytes32 hash required");
    const bytes = ethers.getBytes(fileHash);
    if (bytes.length !== 32) return pushLog("Hash must be 32 bytes");
    const signer = await walletProvider.getSigner();
    const tx = await writeEscrow.connect(signer).deliver(cid.trim(), fileHash);
    pushLog("deliver() sent", tx.hash);
    await tx.wait();
    pushLog("deliver() confirmed");
    await loadAll();
  }
  async function doRelease() {
    if (!writeEscrow || !isSignerClient) return pushLog("Release: only client can call");
    const signer = await walletProvider.getSigner();
    const tx = await writeEscrow.connect(signer).release();
    pushLog("release() sent", tx.hash);
    await tx.wait();
    pushLog("release() confirmed");
    await loadAll();
  }
  async function doRefund() {
    const signer = await walletProvider.getSigner();
    const tx = await writeEscrow.connect(signer).refund();
    pushLog("refund() sent", tx.hash);
    await tx.wait();
    pushLog("refund() confirmed");
    await loadAll();
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Database className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Autonomiq — DaaS Escrow on Arc (MetaMask)</h1>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-2xl bg-white shadow border space-y-3">
            <div className="font-semibold">Connection</div>
            <input className="input" placeholder="Arc RPC URL" value={rpc} onChange={(e)=>setRpc(e.target.value)} />
            <input className="input" placeholder="Escrow address" value={escrow} onChange={(e)=>setEscrow(e.target.value)} />
            <input className="input" placeholder="USDC address" value={usdc} onChange={(e)=>setUsdc(e.target.value)} />
            <div className="grid grid-cols-3 gap-2">
              {["client","provider","arbiter"].map(r=>(
                <button key={r} onClick={()=>setRole(r)} className={`px-3 py-2 rounded-xl border ${role===r? "bg-slate-900 text-white":"bg-white"}`}>{r}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button className="btn" onClick={connectWallet}>Connect Wallet</button>
              <button className="btn" onClick={loadAll}><RefreshCw className="h-4 w-4"/> Load State</button>
            </div>
            <div className="text-xs text-gray-600 break-all">
              Connected: {account || "—"} {chainId && `(chainId ${chainId})`}
            </div>
            <div className="text-xs text-gray-500 flex items-start gap-2">
              <TriangleAlert className="h-4 w-4"/> Use a wallet (no PKs in the browser). Buttons auto-enable only when your connected account matches the role.
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white shadow border space-y-4">
            <div className="font-semibold">Escrow Snapshot</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Client">{info.client || "—"}</Field>
              <Field label="Provider">{info.provider || "—"}</Field>
              <Field label="Arbiter">{info.arbiter || "—"}</Field>
              <Field label="Amount">
                {info.amount ? `${Number(ethers.formatUnits(info.amount, tokenMeta.decimals)).toLocaleString()} ${tokenMeta.symbol}` : "—"}
              </Field>
              <Field label="State">{prettyState(info.state)}</Field>
              <Field label="USDC"><span className="inline-flex items-center gap-1"><LinkIcon className="h-3 w-3"/>{info.usdc || usdc}</span></Field>
              <Field label="Data CID">{info.dataCid || "—"}</Field>
              <Field label="Data Hash">{info.dataHash ? ethers.hexlify(info.dataHash) : "—"}</Field>
            </div>
          </div>
        </div>

        {/* NEW: explicit refresh balances control */}
        <div className="flex justify-end mb-3">
          <button className="btn" onClick={loadAll}>
            <RefreshCw className="h-4 w-4" /> Refresh balances
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <Stat icon={DollarSign} label={`Escrow Balance (${tokenMeta.symbol})`} value={balances.escrow!=null? Number(ethers.formatUnits(balances.escrow||0, tokenMeta.decimals)).toLocaleString():"—"} />
          <Stat icon={DollarSign} label={`Client Balance (${tokenMeta.symbol})`} value={balances.client!=null? Number(ethers.formatUnits(balances.client||0, tokenMeta.decimals)).toLocaleString():"—"} />
          <Stat icon={DollarSign} label={`Provider Balance (${tokenMeta.symbol})`} value={balances.provider!=null? Number(ethers.formatUnits(balances.provider||0, tokenMeta.decimals)).toLocaleString():"—"} />
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Stat icon={ShieldCheck} label={`Allowance (client→escrow)`} value={allowance!=null? Number(ethers.formatUnits(allowance||0, tokenMeta.decimals)).toLocaleString():"—"} />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="p-4 rounded-2xl bg-white shadow border space-y-3">
            <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4"/> Client</div>
            <div className="text-sm text-gray-600">Approve the escrow to spend your USDC, then fund it. Release is client-only.</div>
            <div className="flex gap-2 flex-wrap">
              <button className="btn" disabled={!isSignerClient || busy || ![0].includes(info.state)} onClick={doApprove}>Approve</button>
              <button className="btn" disabled={!isSignerClient || busy || info.state!==0} onClick={doFund}>Fund</button>
              <button className="btn" disabled={!isSignerClient || busy || info.state!==2} onClick={doRelease}>Release</button>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white shadow border space-y-3">
            <div className="flex items-center gap-2 font-semibold"><UploadCloud className="h-4 w-4"/> Provider</div>
            <input className="input" placeholder="IPFS CID (bafy… / Qm…)" value={cid} onChange={e=>setCid(e.target.value)} />
            <input className="input" placeholder="Bytes32 file hash (keccak256) 0x…" value={fileHash} onChange={e=>setFileHash(e.target.value)} />
            <button className="btn" disabled={!isSignerProv || busy || info.state!==1} onClick={doDeliver}>Deliver</button>
          </div>

          <div className="p-4 rounded-2xl bg-white shadow border space-y-3">
            <div className="flex items-center gap-2 font-semibold"><DollarSign className="h-4 w-4"/> Arbiter</div>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn" disabled>Release</button>
              <button className="btn" disabled={busy} onClick={doRefund}>Refund</button>
            </div>
          </div>
        </div>

        <div className="mt-8 p-4 rounded-2xl bg-white shadow border">
          <div className="font-semibold mb-3">Activity</div>
          <div className="space-y-2 max-h-56 overflow-auto text-sm">
            {log.length===0 && <div className="text-gray-500">No activity yet.</div>}
            {log.map((l,i)=>(
              <div key={i} className="flex items-center gap-2 font-mono text-[12px]">
                <span>[{l.t}] {l.m}</span>
                {l.h && (
                  <>
                    <button className="chip" onClick={()=>copy(l.h)}><Copy className="h-3 w-3"/> Copy</button>
                    {EXPLORER_TX && <a className="chip" href={`${EXPLORER_TX}${l.h}`} target="_blank" rel="noreferrer">Open</a>}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .input{width:100%; border:1px solid #e5e7eb; padding:.6rem .8rem; border-radius:.75rem; outline:none}
        .input:focus{border-color:#111827; box-shadow:0 0 0 3px rgba(17,24,39,.1)}
        .btn{padding:.6rem .9rem; border-radius:.75rem; background:#111827; color:#fff; display:inline-flex; align-items:center; gap:.4rem}
        .btn:hover{filter:brightness(1.05)}
        .chip{padding:.25rem .45rem; border-radius:.5rem; border:1px solid #e5e7eb; background:#f8fafc}
      `}</style>
    </div>
  );
}
