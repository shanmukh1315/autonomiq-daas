import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Database, LinkIcon, ShieldCheck, UploadCloud, DollarSign, RefreshCw, TriangleAlert } from "lucide-react";
import { ethers } from "ethers";

/**
 * Autonomiq Dashboard — single-file React component
 * - Read escrow state
 * - Approve USDC (client), Fund (client)
 * - Deliver CID+hash (provider)
 * - Release (arbiter) / Refund (client/arbiter) / Dispute (any)
 *
 * NOTE: Private key input is for hackathon demo only. Use a wallet provider for production.
 */

// --- Minimal ABIs --- //
const ESCROW_ABI = [
  { "type":"function","stateMutability":"nonpayable","name":"fund","inputs":[],"outputs":[] },
  { "type":"function","stateMutability":"nonpayable","name":"deliver","inputs":[{"name":"_cid","type":"string"},{"name":"_hash","type":"bytes32"}],"outputs":[] },
  { "type":"function","stateMutability":"nonpayable","name":"release","inputs":[],"outputs":[] },
  { "type":"function","stateMutability":"nonpayable","name":"refund","inputs":[],"outputs":[] },
  { "type":"function","stateMutability":"nonpayable","name":"openDispute","inputs":[{"name":"reason","type":"string"}],"outputs":[] },
  { "type":"function","stateMutability":"view","name":"amount","inputs":[],"outputs":[{"type":"uint256"}] },
  { "type":"function","stateMutability":"view","name":"client","inputs":[],"outputs":[{"type":"address"}] },
  { "type":"function","stateMutability":"view","name":"provider","inputs":[],"outputs":[{"type":"address"}] },
  { "type":"function","stateMutability":"view","name":"arbiter","inputs":[],"outputs":[{"type":"address"}] },
  { "type":"function","stateMutability":"view","name":"state","inputs":[],"outputs":[{"type":"uint8"}] },
  { "type":"function","stateMutability":"view","name":"dataCid","inputs":[],"outputs":[{"type":"string"}] },
  { "type":"function","stateMutability":"view","name":"dataHash","inputs":[],"outputs":[{"type":"bytes32"}] },
  { "type":"function","stateMutability":"view","name":"usdc","inputs":[],"outputs":[{"type":"address"}] },
];

const ERC20_ABI = [
  { "type":"function","name":"decimals","stateMutability":"view","inputs":[],"outputs":[{"type":"uint8"}] },
  { "type":"function","name":"symbol","stateMutability":"view","inputs":[],"outputs":[{"type":"string"}] },
  { "type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"name":"a","type":"address"}],"outputs":[{"type":"uint256"}] },
  { "type":"function","name":"allowance","stateMutability":"view","inputs":[{"name":"o","type":"address"},{"name":"s","type":"address"}],"outputs":[{"type":"uint256"}] },
  { "type":"function","name":"approve","stateMutability":"nonpayable","inputs":[{"name":"s","type":"address"},{"name":"amt","type":"uint256"}],"outputs":[{"type":"bool"}] },
];

const prettyState = (s) => ({
  0: "Created",
  1: "Funded",
  2: "Delivered",
  3: "Disputed",
  4: "Closed",
})[Number(s)] ?? String(s);

function Labeled({ label, children }) {
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
      <div className="flex items-center gap-2 text-gray-600"><Icon className="h-4 w-4"/><span className="text-xs uppercase">{label}</span></div>
      <div className="mt-1 text-lg font-semibold break-all">{value}</div>
    </div>
  );
}

export default function AutonomiqDashboard() {
  // prefill from Vite env if present
  const [rpc, setRpc] = useState(import.meta.env.VITE_ARC_RPC || "https://rpc.testnet.arc.network");
  const [escrow, setEscrow] = useState(import.meta.env.VITE_ESCROW || "");
  const [usdc, setUsdc] = useState(import.meta.env.VITE_USDC || "0x3600000000000000000000000000000000000000");
  const [pk, setPk] = useState("");
  const [role, setRole] = useState("client"); // client | provider | arbiter
  const [cid, setCid] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);

  const [info, setInfo] = useState({});
  const [tokenMeta, setTokenMeta] = useState({ symbol: "USDC", decimals: 6 });
  const [allowance, setAllowance] = useState(null);
  const [balances, setBalances] = useState({ escrow: null, client: null, provider: null });

  const provider = useMemo(() => new ethers.JsonRpcProvider(rpc), [rpc]);
  const signer = useMemo(() => {
    try { return pk ? new ethers.Wallet(pk, provider) : null; } catch { return null; }
  }, [pk, provider]);

  const escrowContract = useMemo(() => {
    try { return escrow ? new ethers.Contract(escrow, ESCROW_ABI, signer || provider) : null; } catch { return null; }
  }, [escrow, signer, provider]);

  const usdcContract = useMemo(() => {
    try { return usdc ? new ethers.Contract(usdc, ERC20_ABI, signer || provider) : null; } catch { return null; }
  }, [usdc, signer, provider]);

  const pushLog = (m) => setLog((l) => [{ t: new Date().toLocaleTimeString(), m }, ...l].slice(0, 50));

  async function loadAll() {
    if (!escrowContract) return;
    setBusy(true);
    try {
      const [client, providerAddr, arbiter, amount, state, dataCid, dataHash, usdcAddr] = await Promise.all([
        escrowContract.client(),
        escrowContract.provider(),
        escrowContract.arbiter(),
        escrowContract.amount(),
        escrowContract.state(),
        escrowContract.dataCid(),
        escrowContract.dataHash(),
        escrowContract.usdc(),
      ]);
      const infoObj = { client, provider: providerAddr, arbiter, amount: amount.toString(), state: Number(state), dataCid, dataHash, usdc: usdcAddr };
      setInfo(infoObj);
      if (usdcAddr && ethers.isAddress(usdcAddr)) setUsdc(usdcAddr);

      if (usdcContract) {
        const [symbol, decimals] = await Promise.all([
          usdcContract.symbol().catch(() => "USDC"),
          usdcContract.decimals().catch(() => 6),
        ]);
        setTokenMeta({ symbol, decimals: Number(decimals) });
      }

      if (usdcContract) {
        const [escBal, clientBal, provBal, allow] = await Promise.all([
          usdcContract.balanceOf(escrow),
          usdcContract.balanceOf(client),
          usdcContract.balanceOf(providerAddr),
          usdcContract.allowance(client, escrow),
        ]);
        setBalances({ escrow: escBal.toString(), client: clientBal.toString(), provider: provBal.toString() });
        setAllowance(allow.toString());
      }
      pushLog("Loaded on-chain state");
    } catch (e) {
      console.error(e); pushLog(`Load failed: ${e.message || e}`);
    } finally { setBusy(false); }
  }
  useEffect(() => { if (escrow) loadAll(); /* eslint-disable-next-line */ }, [escrow]);

  // Actions
  async function doApprove() {
    if (!signer || !usdcContract || !escrowContract) return pushLog("Connect signer & contracts first");
    setBusy(true);
    try {
      const amt = info.amount ? BigInt(info.amount) : 0n;
      const tx = await usdcContract.connect(signer).approve(escrow, amt);
      pushLog(`approve() → ${tx.hash}`);
      await tx.wait(); pushLog("approve() confirmed");
      await loadAll();
    } catch (e) { console.error(e); pushLog(`approve() failed: ${e.shortMessage || e.message || e}`); }
    finally { setBusy(false); }
  }
  async function doFund() {
    if (!signer || !escrowContract) return pushLog("Connect signer as CLIENT");
    setBusy(true);
    try {
      const tx = await escrowContract.connect(signer).fund();
      pushLog(`fund() → ${tx.hash}`);
      await tx.wait(); pushLog("fund() confirmed");
      await loadAll();
    } catch (e) { console.error(e); pushLog(`fund() failed: ${e.shortMessage || e.message || e}`); }
    finally { setBusy(false); }
  }
  async function doDeliver() {
    if (!signer || !escrowContract) return pushLog("Connect signer as PROVIDER");
    if (!cid || !fileHash) return pushLog("CID and bytes32 hash are required");
    let hashBytes; try { hashBytes = ethers.getBytes(fileHash); } catch { return pushLog("Invalid bytes32 hash format"); }
    if (hashBytes.length !== 32) return pushLog("Hash must be 32 bytes (keccak256)");
    setBusy(true);
    try {
      const tx = await escrowContract.connect(signer).deliver(cid.trim(), fileHash);
      pushLog(`deliver() → ${tx.hash}`);
      await tx.wait(); pushLog("deliver() confirmed");
      await loadAll();
    } catch (e) { console.error(e); pushLog(`deliver() failed: ${e.shortMessage || e.message || e}`); }
    finally { setBusy(false); }
  }
  async function doRelease() {
    if (!signer || !escrowContract) return pushLog("Connect signer as ARBITER");
    setBusy(true);
    try {
      const tx = await escrowContract.connect(signer).release();
      pushLog(`release() → ${tx.hash}`);
      await tx.wait(); pushLog("release() confirmed");
      await loadAll();
    } catch (e) { console.error(e); pushLog(`release() failed: ${e.shortMessage || e.message || e}`); }
    finally { setBusy(false); }
  }
  async function doRefund() {
    if (!signer || !escrowContract) return pushLog("Connect signer as CLIENT/ARBITER");
    setBusy(true);
    try {
      const tx = await escrowContract.connect(signer).refund();
      pushLog(`refund() → ${tx.hash}`);
      await tx.wait(); pushLog("refund() confirmed");
      await loadAll();
    } catch (e) { console.error(e); pushLog(`refund() failed: ${e.shortMessage || e.message || e}`); }
    finally { setBusy(false); }
  }
  async function doDispute() {
    if (!signer || !escrowContract) return pushLog("Connect signer");
    const reason = prompt("Reason for dispute?");
    if (!reason) return;
    setBusy(true);
    try {
      const tx = await escrowContract.connect(signer).openDispute(reason);
      pushLog(`openDispute() → ${tx.hash}`);
      await tx.wait(); pushLog("openDispute() confirmed");
      await loadAll();
    } catch (e) { console.error(e); pushLog(`openDispute() failed: ${e.shortMessage || e.message || e}`); }
    finally { setBusy(false); }
  }

  const fmt = (v) => { try { return Number(ethers.formatUnits(v || 0n, tokenMeta.decimals)).toLocaleString(); } catch { return String(v); } };
  const isClient = role === "client";
  const isProvider = role === "provider";
  const isArbiter = role === "arbiter";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Database className="h-6 w-6"/>
          <h1 className="text-2xl font-bold">Autonomiq — DaaS Escrow on Arc</h1>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-2xl bg-white shadow border space-y-3">
            <div className="font-semibold">Connection</div>
            <div className="grid grid-cols-1 gap-3">
              <input className="input" placeholder="Arc RPC URL" value={rpc} onChange={(e)=>setRpc(e.target.value)}/>
              <input className="input" placeholder="Escrow address" value={escrow} onChange={(e)=>setEscrow(e.target.value)}/>
              <input className="input" placeholder="USDC address" value={usdc} onChange={(e)=>setUsdc(e.target.value)}/>
              <div className="grid grid-cols-3 gap-2">
                {["client","provider","arbiter"].map(r => (
                  <button key={r} onClick={()=>setRole(r)} className={`px-3 py-2 rounded-xl border ${role===r? "bg-slate-900 text-white":"bg-white"}`}>{r}</button>
                ))}
              </div>
              <input className="input" placeholder="Private key (demo only)" type="password" value={pk} onChange={(e)=>setPk(e.target.value)} />
              <div className="flex items-center gap-2">
                <button onClick={loadAll} className="btn">
                  <RefreshCw className="h-4 w-4"/> Load State
                </button>
                {busy && <Loader2 className="h-4 w-4 animate-spin"/>}
              </div>
              <div className="text-xs text-gray-500 flex items-start gap-2"><TriangleAlert className="h-4 w-4"/> Keys live only in memory. Use for demo; replace with wallet provider for prod.</div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white shadow border space-y-4">
            <div className="font-semibold">Escrow Snapshot</div>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Client">{info.client || "—"}</Labeled>
              <Labeled label="Provider">{info.provider || "—"}</Labeled>
              <Labeled label="Arbiter">{info.arbiter || "—"}</Labeled>
              <Labeled label="Amount">{info.amount ? `${fmt(info.amount)} ${tokenMeta.symbol}` : "—"}</Labeled>
              <Labeled label="State">{prettyState(info.state)}</Labeled>
              <Labeled label="USDC"><span className="inline-flex items-center gap-1"><LinkIcon className="h-3 w-3"/>{info.usdc || usdc}</span></Labeled>
              <Labeled label="Data CID">{info.dataCid || "—"}</Labeled>
              <Labeled label="Data Hash">{info.dataHash ? ethers.hexlify(info.dataHash) : "—"}</Labeled>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <Stat icon={DollarSign} label={`Escrow Balance (${tokenMeta.symbol})`} value={balances.escrow!=null? fmt(balances.escrow):"—"} />
          <Stat icon={DollarSign} label={`Client Balance (${tokenMeta.symbol})`} value={balances.client!=null? fmt(balances.client):"—"} />
          <Stat icon={DollarSign} label={`Provider Balance (${tokenMeta.symbol})`} value={balances.provider!=null? fmt(balances.provider):"—"} />
        </div>
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Stat icon={ShieldCheck} label={`Allowance (client→escrow)`} value={allowance!=null? fmt(allowance):"—"} />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="p-4 rounded-2xl bg-white shadow border space-y-3">
            <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4"/> Client</div>
            <div className="text-sm text-gray-600">Approve the escrow to spend your USDC, then fund it.</div>
            <div className="flex gap-2">
              <button className="btn" disabled={!isClient || busy} onClick={doApprove}>Approve</button>
              <button className="btn" disabled={!isClient || busy} onClick={doFund}>Fund</button>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white shadow border space-y-3">
            <div className="flex items-center gap-2 font-semibold"><UploadCloud className="h-4 w-4"/> Provider</div>
            <input className="input" placeholder="IPFS CID (bafy… / Qm…)" value={cid} onChange={(e)=>setCid(e.target.value)} />
            <input className="input" placeholder="Bytes32 file hash (keccak256) 0x…" value={fileHash} onChange={(e)=>setFileHash(e.target.value)} />
            <button className="btn" disabled={!isProvider || busy} onClick={doDeliver}>Deliver</button>
          </div>

          <div className="p-4 rounded-2xl bg-white shadow border space-y-3">
            <div className="flex items-center gap-2 font-semibold"><DollarSign className="h-4 w-4"/> Arbiter</div>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn" disabled={!isArbiter || busy} onClick={doRelease}>Release</button>
              <button className="btn" disabled={busy} onClick={doRefund}>Refund</button>
            </div>
            <button className="btn-secondary" disabled={busy} onClick={doDispute}>Open Dispute</button>
          </div>
        </div>

        <div className="mt-8 p-4 rounded-2xl bg-white shadow border">
          <div className="font-semibold mb-3">Activity</div>
          <div className="space-y-1 max-h-56 overflow-auto text-sm">
            {log.length===0 && <div className="text-gray-500">No activity yet.</div>}
            {log.map((l, i) => (<div key={i} className="font-mono text-[12px]">[{l.t}] {l.m}</div>))}
          </div>
        </div>
      </div>

      {/* Quick inline styles if Tailwind isn't configured */}
      <style>{`
        .input{width:100%; border:1px solid #e5e7eb; padding:.6rem .8rem; border-radius:.75rem; outline:none}
        .input:focus{border-color:#111827; box-shadow:0 0 0 3px rgba(17,24,39,.1)}
        .btn{padding:.6rem .9rem; border-radius:.75rem; background:#111827; color:#fff; display:inline-flex; align-items:center; gap:.4rem}
        .btn:hover{filter:brightness(1.05)}
        .btn-secondary{padding:.6rem .9rem; border-radius:.75rem; background:#f3f4f6;}
      `}</style>
    </div>
  );
}
