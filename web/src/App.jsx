import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

/* --------------------------------------------------------------
   Autonomiq — DaaS Escrow on Arc (MetaMask)
   - Wallet-only (ethers v6 BrowserProvider)
   - Role-gated actions
   - Middle-ellipsis + robust Copy (with fallback)
   - Connection card keeps Connect/Connected + Refresh aligned
   - Hero badges + flow chips fill space under headline
-------------------------------------------------------------- */

// --- Minimal ABIs ---
const ESCROW_ABI = [
  { type: "function", stateMutability: "nonpayable", name: "fund", inputs: [], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "deliver", inputs: [{ name: "_cid", type: "string" }, { name: "_hash", type: "bytes32" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "release", inputs: [], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "refund", inputs: [], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "openDispute", inputs: [{ name: "reason", type: "string" }], outputs: [] },
  { type: "function", stateMutability: "view", name: "client", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", stateMutability: "view", name: "provider", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", stateMutability: "view", name: "arbiter", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", stateMutability: "view", name: "amount", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "state", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", stateMutability: "view", name: "dataCid", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", stateMutability: "view", name: "dataHash", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", stateMutability: "view", name: "usdc", inputs: [], outputs: [{ type: "address" }] }
];

const ERC20_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "amt", type: "uint256" }], outputs: [{ type: "bool" }] }
];

// --- UI helpers ---
const prettyState = (s) => ({ 0: "Created", 1: "Funded", 2: "Delivered", 3: "Closed" }[Number(s)] ?? String(s));
const short = (a = "") => (a && a.length > 10 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a || "—");
const middleEllipsis = (s = "", left = 22, right = 18) => (s && s.length > left + right + 3 ? `${s.slice(0, left)}…${s.slice(-right)}` : s || "—");

function Card({ title, actions, children, tight }) {
  return (
    <div className={`card ${tight ? "card-tight" : ""}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <div className="card-title">{title}</div>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

function Chip({ onClick, children, href }) {
  if (href) return <a className="chip" href={href} target="_blank" rel="noreferrer">{children}</a>;
  return <button className="chip" onClick={onClick}>{children}</button>;
}

export default function App() {
  // Config / env
  const [rpc, setRpc] = useState(import.meta.env.VITE_ARC_RPC || "https://rpc.testnet.arc.network");
  const [escrow, setEscrow] = useState(import.meta.env.VITE_ESCROW || "");
  const [usdc, setUsdc] = useState(import.meta.env.VITE_USDC || "0x3600000000000000000000000000000000000000");
  const EXPLORER_TX = import.meta.env.VITE_EXPLORER_TX || "";

  // App state
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const [info, setInfo] = useState({ client: "", provider: "", arbiter: "", amount: "0", state: 0, dataCid: "", dataHash: "", usdc: "" });
  const [tokenMeta, setTokenMeta] = useState({ symbol: "USDC", decimals: 6 });
  const [balances, setBalances] = useState({ escrow: "0", client: "0", provider: "0" });
  const [allowance, setAllowance] = useState("0");
  const [cid, setCid] = useState("");
  const [fileHash, setFileHash] = useState("");

  // Providers / contracts
  const jsonProvider = useMemo(() => new ethers.JsonRpcProvider(rpc), [rpc]);
  const walletProvider = useMemo(() => {
    if (typeof window === "undefined" || !window.ethereum) return null;
    try { return new ethers.BrowserProvider(window.ethereum); } catch { return null; }
  }, []);

  const readEscrow = useMemo(() => (escrow ? new ethers.Contract(escrow, ESCROW_ABI, jsonProvider) : null), [escrow, jsonProvider]);
  const writeEscrow = useMemo(() => (walletProvider && escrow ? new ethers.Contract(escrow, ESCROW_ABI, walletProvider) : null), [escrow, walletProvider]);
  const readUSDC = useMemo(() => (usdc ? new ethers.Contract(usdc, ERC20_ABI, jsonProvider) : null), [usdc, jsonProvider]);
  const writeUSDC = useMemo(() => (walletProvider && usdc ? new ethers.Contract(usdc, ERC20_ABI, walletProvider) : null), [usdc, walletProvider]);

  // Utils
  const pushLog = (m, h = null) => setLog((l) => [{ t: new Date().toLocaleTimeString(), m, h }, ...l].slice(0, 60));
  const copyText = async (text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      pushLog("Copied to clipboard");
    } catch {
      pushLog("Copy failed");
    }
  };
  const fmt = (v) => { try { return Number(ethers.formatUnits(v || 0n, tokenMeta.decimals)).toLocaleString(); } catch { return String(v); } };

  // Wallet connect (Refresh stays; Connected state; auto-load)
  async function connectWallet() {
    if (!walletProvider) { alert("MetaMask not found"); return; }
    const accts = await walletProvider.send("eth_requestAccounts", []);
    const net = await walletProvider.getNetwork();
    setAccount(ethers.getAddress(accts[0]));
    setChainId(String(Number(net.chainId)));
    pushLog("Wallet connected");
    await loadAll(); // auto refresh
  }

  // Snapshot loader
  async function loadAll() {
    if (!readEscrow) return;
    setBusy(true);
    try {
      const [client, providerAddr, arbiter, amount, state, dataCid, dataHash, usdcAddr] = await Promise.all([
        readEscrow.client(), readEscrow.provider(), readEscrow.arbiter(),
        readEscrow.amount(), readEscrow.state(), readEscrow.dataCid(),
        readEscrow.dataHash(), readEscrow.usdc()
      ]);

      setInfo({
        client, provider: providerAddr, arbiter,
        amount: amount.toString(), state: Number(state),
        dataCid, dataHash: ethers.hexlify(dataHash), usdc: usdcAddr
      });
      if (usdcAddr && ethers.isAddress(usdcAddr)) setUsdc(usdcAddr);

      let symbol = "USDC", decimals = 6;
      try { symbol = await readUSDC.symbol(); } catch {}
      try { decimals = Number(await readUSDC.decimals()); } catch {}
      setTokenMeta({ symbol, decimals });

      const results = await Promise.allSettled([
        readUSDC.balanceOf(escrow),
        readUSDC.balanceOf(client),
        readUSDC.balanceOf(providerAddr),
        readUSDC.allowance(client, escrow)
      ]);
      const [escBal, clientBal, provBal, allow] = results.map(r => r.status === "fulfilled" ? r.value : 0n);
      setBalances({ escrow: escBal.toString(), client: clientBal.toString(), provider: provBal.toString() });
      setAllowance(allow.toString());

      pushLog("Loaded on-chain state");
    } finally { setBusy(false); }
  }
  useEffect(() => { if (escrow) loadAll(); /* eslint-disable-next-line */ }, [escrow]);

  // Role checks
  const isClient = account && info.client?.toLowerCase() === account.toLowerCase();
  const isProvider = account && info.provider?.toLowerCase() === account.toLowerCase();
  const isArbiter = account && info.arbiter?.toLowerCase() === account.toLowerCase();

  // Actions
  async function doApprove() {
    if (!writeUSDC || !account) return pushLog("Connect wallet first");
    const signer = await walletProvider.getSigner();
    const amt = info.amount ? BigInt(info.amount) : 0n;
    const tx = await writeUSDC.connect(signer).approve(escrow, amt);
    pushLog("approve() sent", tx.hash); await tx.wait(); pushLog("approve() confirmed", tx.hash); await loadAll();
  }
  async function doFund() {
    if (!writeEscrow || !isClient) return pushLog("Fund: wallet must be client");
    const signer = await walletProvider.getSigner();
    const tx = await writeEscrow.connect(signer).fund();
    pushLog("fund() sent", tx.hash); await tx.wait(); pushLog("fund() confirmed", tx.hash); await loadAll();
  }
  async function doDeliver() {
    if (!writeEscrow || !isProvider) return pushLog("Deliver: wallet must be provider");
    if (!cid || !fileHash) return pushLog("CID and bytes32 hash required");
    const bytes = ethers.getBytes(fileHash); if (bytes.length !== 32) return pushLog("Hash must be 32 bytes (0x…32 bytes)");
    const signer = await walletProvider.getSigner();
    const tx = await writeEscrow.connect(signer).deliver(cid.trim(), fileHash);
    pushLog("deliver() sent", tx.hash); await tx.wait(); pushLog("deliver() confirmed", tx.hash); await loadAll();
  }
  async function doRelease() {
    if (!writeEscrow || !isClient) return pushLog("Release: only client can call");
    const signer = await walletProvider.getSigner();
    const tx = await writeEscrow.connect(signer).release();
    pushLog("release() sent", tx.hash); await tx.wait(); pushLog("release() confirmed", tx.hash); await loadAll();
  }
  async function doRefund() {
    if (!writeEscrow || (!isClient && !isArbiter)) return pushLog("Refund: role not permitted");
    const signer = await walletProvider.getSigner();
    const tx = await writeEscrow.connect(signer).refund();
    pushLog("refund() sent", tx.hash); await tx.wait(); pushLog("refund() confirmed", tx.hash); await loadAll();
  }

  return (
    <div className="page">
      <main className="wrap">
        {/* HERO */}
        <div className="brand">AUTONOMIQ</div>
        <h1 className="headline">
          Trust-minimized <span className="accent">Data-as-a-Service</span> with agentic<br />USDC payments on Arc
        </h1>
        <div className="pills">
          <span className="pill">Escrowed USDC</span>
          <span className="pill">Agent-driven delivery</span>
          <span className="pill">Instant settlement</span>
          <span className="pill">IPFS-verifiable</span>
        </div>
        <div className="sub">
          Providers post <span className="mono">CID + keccak256</span> on-chain after off-chain delivery; client releases USDC only when satisfied. Disputes are arbiter-gated.
        </div>
        <div className="flow">
          <span className="flow-pill">1 • Approve</span><span className="flow-sep">→</span>
          <span className="flow-pill">2 • Fund</span><span className="flow-sep">→</span>
          <span className="flow-pill">3 • Deliver</span><span className="flow-sep">→</span>
          <span className="flow-pill">4 • Release</span>
        </div>

        {/* Connection */}
        <Card
          title="Connection"
          actions={
            <>
              <button className={`btn ${account ? "connected" : ""}`} onClick={connectWallet} disabled={!!account}>
                {account ? "Connected" : "Connect"}
              </button>
              <button className="btn ghost" onClick={loadAll}>Refresh</button>
            </>
          }
        >
          <div className="rows">
            <div className="row">
              <span className="label">Wallet</span>
              <span className="value">{account ? short(account) : "Not connected"}</span>
              <span className="spacer" />
            </div>
            <div className="row">
              <span className="label">RPC</span>
              <input className="input" value={rpc} onChange={(e) => setRpc(e.target.value)} />
              <Chip onClick={() => copyText(rpc)}>Copy</Chip>
            </div>
            <div className="row">
              <span className="label">Escrow</span>
              <input className="input" value={escrow} onChange={(e) => setEscrow(e.target.value)} />
              <Chip onClick={() => copyText(escrow)}>Copy</Chip>
            </div>
            <div className="row">
              <span className="label">USDC</span>
              <input className="input" value={usdc} onChange={(e) => setUsdc(e.target.value)} />
              <Chip onClick={() => copyText(usdc)}>Copy</Chip>
            </div>
            <div className="row">
              <span className="label">Chain</span>
              <span className="value">{chainId || "—"}</span>
              <span className="spacer" />
            </div>
          </div>
        </Card>

        {/* KPIs */}
        <div className="grid four">
          <Card title="Escrow State" tight><div className="big">{prettyState(info.state)}</div></Card>
          <Card title="$ Escrow Balance (USDC)" tight><div className="big">{fmt(balances.escrow)}</div></Card>
          <Card title="$ Client Balance (USDC)" tight><div className="big">{fmt(balances.client)}</div></Card>
          <Card title="$ Provider Balance (USDC)" tight><div className="big">{fmt(balances.provider)}</div></Card>
        </div>

        {/* Participants + Data */}
        <div className="grid two">
          <Card title="Participants">
            <div className="kv"><span>Client</span><span className="mono">{short(info.client)}</span><Chip onClick={() => copyText(info.client)}>Copy</Chip></div>
            <div className="kv"><span>Provider</span><span className="mono">{short(info.provider)}</span><Chip onClick={() => copyText(info.provider)}>Copy</Chip></div>
            <div className="kv"><span>Arbiter</span><span className="mono">{short(info.arbiter)}</span><Chip onClick={() => copyText(info.arbiter)}>Copy</Chip></div>
            <div className="kv"><span>Amount</span><span>{info.amount ? `${ethers.formatUnits(info.amount, tokenMeta.decimals)} ${tokenMeta.symbol}` : "—"}</span><span /></div>
            <div className="kv"><span>Allowance (client→escrow)</span><span>{fmt(allowance)}</span><span /></div>
          </Card>

          <Card title="Data (verifiability)">
            <div className="kv">
              <span>Data CID</span>
              <div className="code-row">
                <code className="mono ellipsize" title={info.dataCid}>{middleEllipsis(info.dataCid)}</code>
                <Chip onClick={() => copyText(info.dataCid)}>Copy</Chip>
                <Chip onClick={() => window.alert(info.dataCid || "—")}>View</Chip>
              </div>
            </div>
            <div className="kv">
              <span>Data Hash</span>
              <div className="code-row">
                <code className="mono ellipsize" title={info.dataHash}>{middleEllipsis(info.dataHash, 20, 16)}</code>
                <Chip onClick={() => copyText(info.dataHash)}>Copy</Chip>
                <Chip onClick={() => window.alert(info.dataHash || "—")}>View</Chip>
              </div>
            </div>
          </Card>
        </div>

        {/* Control Center */}
        <div className="grid three">
          <Card title="Client">
            <p className="muted">Approve the escrow to spend your USDC, then fund it. Release after the provider delivers.</p>
            <div className="btnrow">
              <button className="btn" disabled={!isClient || busy || ![0].includes(info.state)} onClick={doApprove}>Approve</button>
              <button className="btn" disabled={!isClient || busy || info.state !== 0} onClick={doFund}>Fund</button>
              <button className="btn" disabled={!isClient || busy || info.state !== 2} onClick={doRelease}>Release</button>
            </div>
          </Card>

          <Card title="Provider">
            <input className="input" placeholder="IPFS CID (bafy… / Qm…)" value={cid} onChange={(e) => setCid(e.target.value)} />
            <input className="input" placeholder="bytes32 file hash (keccak256) 0x…" value={fileHash} onChange={(e) => setFileHash(e.target.value)} />
            <div className="btnrow">
              <button className="btn" disabled={!isProvider || busy || info.state !== 1} onClick={doDeliver}>Deliver</button>
            </div>
          </Card>

          <Card title="Arbiter">
            <p className="muted">Use only when necessary according to dispute rules.</p>
            <div className="btnrow">
              <button className="btn ghost" disabled>Release (client-only)</button>
              <button className="btn" disabled={!isArbiter || busy} onClick={doRefund}>Refund</button>
            </div>
          </Card>
        </div>

        {/* Activity */}
        <Card title="Activity">
          <div className="activity">
            {log.length === 0 && <div className="muted">No activity yet.</div>}
            {log.map((l, i) => (
              <div key={i} className="actrow">
                <span className="time">{l.t}</span>
                <span className="msg">{l.m}</span>
                {l.h && (
                  <>
                    <Chip onClick={() => copyText(l.h)}>Copy</Chip>
                    {EXPLORER_TX && <Chip href={`${EXPLORER_TX}${l.h}`}>Open</Chip>}
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>

        <div className="footer">Built for AI Agents on Arc with USDC — Autonomiq</div>
      </main>

      {/* Styles */}
      <style>{`
        :root {
          --bg: #0b1220;
          --card: #0f172a;
          --muted: #8aa0b8;
          --text: #e6eef9;
          --line: #1f2a44;
          --brand: #9ae6b4;
          --brandDark: #64d08f;
        }
        *{box-sizing:border-box}
        html, body, #root{height:100%}
        body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}
        .page{min-height:100vh;display:flex;justify-content:center}
        .wrap{width:100%;max-width:1120px;padding:28px 20px 80px}

        .brand{font-size:12px;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;margin-bottom:6px}
        .headline{margin:0 0 10px;font-size:32px;line-height:1.2;font-weight:800}
        .accent{color:var(--brand)}
        .pills{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0}
        .pill{font-size:11px;padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.03)}
        .sub{margin-top:6px;color:var(--muted);font-size:13px}
        .flow{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}
        .flow-pill{padding:6px 10px;border-radius:999px;background:rgba(154,230,180,.12);color:#c7f3d9;border:1px solid rgba(154,230,180,.25);font-size:12px}
        .flow-sep{color:var(--muted)}

        .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px}
        .card-tight{padding:12px}
        .card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
        .card-title{font-weight:700}
        .card-actions{display:flex;gap:8px;flex-wrap:wrap}

        .rows{display:grid;gap:10px}
        .row{display:grid;grid-template-columns:90px 1fr auto;gap:10px;align-items:center}
        .label{color:var(--muted);font-size:12px}
        .value{font-weight:700}
        .spacer{width:1px;height:1px}
        .input{width:100%;background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:12px;padding:10px 12px;color:var(--text);outline:none}
        .input:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(154,230,180,.12)}

        .btn{background:var(--brand);color:#0a101d;border:0;border-radius:12px;padding:9px 12px;font-weight:700;cursor:pointer}
        .btn.connected{background:var(--brandDark);color:#082015}
        .btn:disabled{opacity:.55;cursor:not-allowed}
        .btn.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}

        .grid.four{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
        .grid.two{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
        .grid.three{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:12px 0 18px}
        @media (max-width:980px){ .grid.four,.grid.two,.grid.three{grid-template-columns:1fr} }

        .big{font-size:22px;font-weight:800}

        .kv{display:grid;grid-template-columns:180px 1fr auto;gap:10px;align-items:center;padding:8px 0;border-bottom:1px dashed var(--line)}
        .kv:last-child{border-bottom:0}
        .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,"Courier New",monospace}

        .code-row{display:flex;align-items:center;gap:.5rem;min-width:0}
        .ellipsize{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        @media (min-width:1024px){ .ellipsize{max-width:520px} }

        .btnrow{display:flex;gap:10px;flex-wrap:wrap}

        .chip{padding:.32rem .55rem;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--text);font-size:12px}

        .activity{display:grid;gap:8px}
        .actrow{display:flex;gap:10px;align-items:center}
        .time{color:var(--muted);font-size:12px}
        .msg{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,"Courier New",monospace;font-size:12px}
        .muted{color:var(--muted);font-size:13px}

        .footer{margin-top:18px;color:var(--muted);font-size:12px;text-align:center}
      `}</style>
    </div>
  );
}
