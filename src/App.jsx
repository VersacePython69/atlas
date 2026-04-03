import { useState, useEffect, useRef, useCallback } from "react";

export default function ArbBot() {
  const [s, setS] = useState(null);
  const [balance, setBalance] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [paperMode, setPaperMode] = useState(true);
  const [settings, setSettings] = useState(null);
  const logRef = useRef(null);

  const fetchState = useCallback(async () => {
    try {
      const [stateRes, balRes] = await Promise.all([
        fetch("/api/state"),
        fetch("/api/kalshi/balance"),
      ]);
      const state = await stateRes.json();
      const bal = await balRes.json();
      setS(state);
      setBalance(bal.balance);
      setPaperMode(state.paperMode);
      if (!settings) setSettings(state.settings);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) { console.error("Fetch error:", e); }
  }, []);

  useEffect(() => {
    fetchState();
    const poll = setInterval(fetchState, 2000);
    return () => clearInterval(poll);
  }, [fetchState]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [s?.log]);

  const togglePaper = async () => {
    const newMode = !paperMode;
    await fetch("/api/papermode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paperMode: newMode }),
    });
    setPaperMode(newMode);
  };

  const updateSetting = async (key, value) => {
    const updated = { ...settings, [key]: parseFloat(value) };
    setSettings(updated);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
  };

  const triggerScan = async () => {
    const res = await fetch("/api/scan", { method: "POST" });
    const data = await res.json();
    setTimeout(fetchState, 500);
  };

  if (!s) return (
    <div style={{ minHeight: "100vh", background: "#020408", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "26px", fontFamily: "'Syne', sans-serif", fontWeight: 800, color: "#e8f0f8", marginBottom: "8px" }}>
          ARB<span style={{ color: "#f0a500" }}>.</span>BOT
        </div>
        <div style={{ fontSize: "11px", color: "#334", letterSpacing: "0.2em" }}>CONNECTING...</div>
      </div>
    </div>
  );

  const pnl = s.pnl || 0;
  const winRate = s.winRate || 0;
  const totalTrades = s.totalTrades || 0;
  const arb = s.arbOpportunities || [];
  const logical = s.logicalOpportunities || [];
  const trades = s.executedTrades || [];
  const log = s.log || [];
  const avgLatency = trades.length > 0
    ? trades.reduce((sum, t) => sum + (t.latencyMs || 0), 0) / trades.length
    : 0;

  const confColor = (c) => c === 'HIGH' ? '#f0a500' : c === 'MEDIUM' ? '#3a8fe8' : '#556';

  return (
    <div style={{ minHeight: "100vh", background: "#020408", fontFamily: "'JetBrains Mono', monospace", color: "#b8cce0" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glow{0%,100%{box-shadow:0 0 4px #f0a500}50%{box-shadow:0 0 12px #f0a500}}
        .tab:hover{background:#0c1520 !important}
        .tab.active{background:#0c1e30 !important;border-bottom:2px solid #f0a500 !important}
        .trow:hover{background:#0a1520 !important}
        .opp-card:hover{border-color:#f0a50066 !important;cursor:pointer}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-track{background:#020408}
        ::-webkit-scrollbar-thumb{background:#1a2a3a;border-radius:2px}
      `}</style>

      {/* Header */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid #0a1828", background: "#010306", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "20px", fontWeight: 800 }}>
            <span style={{ color: "#e8f0f8" }}>ARB</span><span style={{ color: "#f0a500" }}>.</span><span style={{ color: "#e8f0f8" }}>BOT</span>
          </div>
          <div style={{ fontSize: "9px", color: "#334", letterSpacing: "0.1em" }}>FRANK-WOLFE · BREGMAN PROJECTION · FEE-AWARE</div>

          {/* WS Status */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", background: s.wsConnected ? "#f0a50012" : "#ff444412", border: `1px solid ${s.wsConnected ? "#f0a50033" : "#ff444433"}` }}>
            <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: s.wsConnected ? "#f0a500" : "#ff4444", animation: s.wsConnected ? "pulse 1s infinite" : "none", boxShadow: s.wsConnected ? "0 0 6px #f0a500" : "none" }} />
            <span style={{ fontSize: "9px", color: s.wsConnected ? "#f0a500" : "#ff4444" }}>
              {s.wsConnected ? "WS LIVE" : s.wsStatus?.toUpperCase() || "OFFLINE"}
            </span>
          </div>

          {s.kalshiConnected && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", background: "#00ff8812", border: "1px solid #00ff8833" }}>
              <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#00ff88" }} />
              <span style={{ fontSize: "9px", color: "#00ff88" }}>KALSHI</span>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          {balance !== null && (
            <div style={{ padding: "4px 12px", background: "#f0a50010", borderRadius: "6px", border: "1px solid #f0a50022", textAlign: "center" }}>
              <div style={{ fontSize: "8px", color: "#f0a50088", letterSpacing: "0.12em" }}>BALANCE</div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#f0a500" }}>${balance?.toFixed(2)}</div>
            </div>
          )}

          {[
            ["P&L", `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`, pnl >= 0 ? "#00ff88" : "#ff4444"],
            ["WIN RATE", totalTrades > 0 ? `${(winRate * 100).toFixed(0)}%` : "—", winRate >= 0.80 ? "#00ff88" : "#f0a500"],
            ["ARB OPPS", arb.length, arb.length > 0 ? "#f0a500" : "#334"],
            ["LOGICAL", logical.length, logical.length > 0 ? "#3a8fe8" : "#334"],
            ["SCANS", s.scanCount || 0, "#e8f0f8"],
            ["CACHE", s.orderbookCacheSize || 0, "#5a7a9a"],
          ].map(([label, val, color]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "8px", color: "#334", letterSpacing: "0.12em" }}>{label}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color }}>{val}</div>
            </div>
          ))}

          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={triggerScan} style={{ padding: "7px 12px", borderRadius: "5px", background: "#f0a50020", color: "#f0a500", fontFamily: "inherit", fontSize: "10px", fontWeight: 700, cursor: "pointer", border: "1px solid #f0a500" }}>⟳ SCAN</button>
            <button onClick={togglePaper} style={{ padding: "7px 12px", borderRadius: "5px", background: paperMode ? "#33444420" : "#ff444420", color: paperMode ? "#f0a500" : "#ff6666", fontFamily: "inherit", fontSize: "10px", fontWeight: 700, cursor: "pointer", border: `1px solid ${paperMode ? "#f0a500" : "#ff4444"}` }}>
              {paperMode ? "📄 PAPER" : "⚡ LIVE"}
            </button>
          </div>
          <div style={{ fontSize: "9px", color: "#1a3a5a" }}>{lastUpdated}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #0a1828", background: "#010306", overflowX: "auto" }}>
        {[
          ["overview", "OVERVIEW"],
          ["arb", `⚡ ARB OPPS${arb.length > 0 ? ` (${arb.length})` : ""}`],
          ["logical", `🔗 LOGICAL${logical.length > 0 ? ` (${logical.length})` : ""}`],
          ["trades", "TRADE LOG"],
          ["settings", "SETTINGS"],
        ].map(([id, label]) => (
          <button key={id} className={`tab${activeTab === id ? " active" : ""}`}
            onClick={() => setActiveTab(id)}
            style={{ padding: "10px 16px", background: "transparent", border: "none", borderBottom: "2px solid transparent", color: activeTab === id ? "#e8f0f8" : "#334", fontFamily: "inherit", fontSize: "10px", fontWeight: activeTab === id ? 700 : 400, cursor: "pointer", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "20px 24px", height: "calc(100vh - 112px)", overflowY: "auto" }}>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", animation: "fadeUp 0.3s ease" }}>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "10px" }}>
              {[
                ["BALANCE", balance !== null ? `$${balance?.toFixed(2)}` : "...", "#f0a500"],
                ["TOTAL P&L", `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`, pnl >= 0 ? "#00ff88" : "#ff4444"],
                ["WIN RATE", totalTrades > 0 ? `${(winRate * 100).toFixed(0)}%` : "—", winRate >= 0.80 ? "#00ff88" : "#f0a500"],
                ["W/L", `${s.wins || 0}/${s.losses || 0}`, "#e8f0f8"],
                ["AVG LATENCY", avgLatency > 0 ? `${avgLatency.toFixed(0)}ms` : "—", "#3a8fe8"],
                ["ACTIVE GAPS", s.gapTrackerSize || 0, "#f0a500"],
              ].map(([label, val, color]) => (
                <div key={label} style={{ padding: "12px", background: "#070b12", borderRadius: "8px", border: "1px solid #0f1e2e", textAlign: "center" }}>
                  <div style={{ fontSize: "8px", color: "#334", letterSpacing: "0.1em", marginBottom: "5px" }}>{label}</div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color }}>{val}</div>
                </div>
              ))}
            </div>

            {/* How It Works */}
            <div style={{ padding: "14px 18px", background: "#070b12", borderRadius: "8px", border: "1px solid #0f1e2e" }}>
              <div style={{ fontSize: "9px", color: "#334", letterSpacing: "0.12em", marginBottom: "10px" }}>HOW THIS BOT WORKS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                {[
                  ["⚡ WebSocket", "Real-time orderbook feed — gaps detected in milliseconds, not seconds"],
                  ["🧮 Fee-Aware", "Kalshi fee formula applied before flagging — only real profit opportunities"],
                  ["⏱ Gap Persistence", "2.5 second confirmation window — filters data glitches vs real gaps"],
                  ["🔗 Logical Arb", "Cross-market impossibilities — subset violations, mutual exclusion errors"],
                ].map(([title, desc]) => (
                  <div key={title} style={{ padding: "10px", background: "#03050a", borderRadius: "6px", border: "1px solid #0f1e2e" }}>
                    <div style={{ fontSize: "10px", color: "#f0a500", fontWeight: 700, marginBottom: "5px" }}>{title}</div>
                    <div style={{ fontSize: "9px", color: "#5a7a9a", lineHeight: "1.6" }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Current Best Opportunity */}
            {arb.length > 0 && (
              <div style={{ padding: "16px 20px", background: "#070b12", borderRadius: "8px", border: "1px solid #f0a50033", animation: "glow 2s infinite" }}>
                <div style={{ fontSize: "9px", color: "#f0a500", letterSpacing: "0.12em", marginBottom: "10px" }}>BEST CURRENT OPPORTUNITY</div>
                {(() => {
                  const best = [...arb].sort((a, b) => b.netProfitDollars - a.netProfitDollars)[0];
                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "2fr repeat(5, 1fr)", gap: "10px", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: "13px", color: "#e8f0f8", fontWeight: 600, marginBottom: "3px" }}>{best.question}</div>
                        <div style={{ fontSize: "10px", color: "#334" }}>{best.ticker}</div>
                      </div>
                      {[
                        ["NET PROFIT", `+$${best.netProfitDollars?.toFixed(2)}`, "#00ff88"],
                        ["SPREAD", `${best.grossSpreadCents}¢`, "#f0a500"],
                        ["FEES", `${(best.yesFee + best.noFee)}¢`, "#ff6666"],
                        ["CONTRACTS", best.contracts, "#3a8fe8"],
                        ["AGE", `${best.gapAge ? (best.gapAge / 1000).toFixed(1) : "—"}s`, "#e8f0f8"],
                      ].map(([l, v, c]) => (
                        <div key={l} style={{ padding: "8px", background: "#03050a", borderRadius: "5px", textAlign: "center" }}>
                          <div style={{ fontSize: "8px", color: "#334", marginBottom: "3px" }}>{l}</div>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: c }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {arb.length === 0 && logical.length === 0 && (
              <div style={{ padding: "30px", background: "#070b12", borderRadius: "8px", border: "1px solid #0f1e2e", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "#1a2a3a" }}>
                  {s.wsConnected
                    ? `No arbitrage gaps detected across ${s.orderbookCacheSize || 0} markets — scanning in real-time via WebSocket`
                    : "Connecting to Kalshi WebSocket — real-time scan starting..."}
                </div>
              </div>
            )}

            {/* Log */}
            <div style={{ padding: "14px", background: "#070b12", borderRadius: "8px", border: "1px solid #0f1e2e" }}>
              <div style={{ fontSize: "9px", color: "#334", letterSpacing: "0.12em", marginBottom: "10px" }}>LIVE ACTIVITY</div>
              <div ref={logRef} style={{ height: "200px", overflowY: "auto" }}>
                {log.slice(-50).map((entry, i) => (
                  <div key={i} style={{ padding: "2px 0", fontSize: "10px", lineHeight: "1.6", display: "flex", gap: "8px", color: entry.type === "bullish" ? "#f0a500" : entry.type === "bearish" ? "#ff6666" : entry.type === "error" ? "#ff4444" : "#2a4a6a" }}>
                    <span style={{ color: "#0f2030", whiteSpace: "nowrap", fontSize: "9px" }}>{entry.time}</span>
                    <span>{entry.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ARB OPPORTUNITIES */}
        {activeTab === "arb" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ display: "flex", gap: "12px", marginBottom: "14px", alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={triggerScan} style={{ padding: "7px 14px", borderRadius: "5px", background: "#f0a50020", color: "#f0a500", fontFamily: "inherit", fontSize: "10px", fontWeight: 700, cursor: "pointer", border: "1px solid #f0a500" }}>⟳ SCAN NOW</button>
              <div style={{ fontSize: "10px", color: "#334" }}>Markets cached: <span style={{ color: "#f0a500" }}>{s.orderbookCacheSize || 0}</span></div>
              <div style={{ fontSize: "10px", color: "#334" }}>Active gaps: <span style={{ color: "#f0a500" }}>{s.gapTrackerSize || 0}</span></div>
              <div style={{ fontSize: "10px", color: "#334" }}>Last scan: <span style={{ color: "#e8f0f8" }}>{s.lastScan || "—"}</span></div>
              <div style={{ fontSize: "10px", color: "#334" }}>WS: <span style={{ color: s.wsConnected ? "#f0a500" : "#ff4444" }}>{s.wsStatus || "—"}</span></div>
            </div>

            {arb.length === 0 ? (
              <div style={{ padding: "80px", textAlign: "center", color: "#1a2a3a", fontSize: "12px" }}>
                No single-market arb gaps detected<br />
                <span style={{ fontSize: "10px", color: "#0f2030" }}>
                  {s.wsConnected ? `WebSocket monitoring ${s.orderbookCacheSize || 0} markets in real-time` : "Connecting WebSocket..."}
                </span>
              </div>
            ) : [...arb].sort((a, b) => b.netProfitDollars - a.netProfitDollars).map(opp => (
              <div key={opp.id} className="opp-card" style={{ padding: "16px 20px", background: "#070b12", borderRadius: "8px", border: `1px solid ${opp.confidence === 'HIGH' ? "#f0a50033" : "#0f1e2e"}`, marginBottom: "10px", animation: "fadeUp 0.2s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div>
                    <div style={{ fontSize: "13px", color: "#c0d8f0", marginBottom: "3px", fontWeight: 600 }}>{opp.question}</div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", color: "#334" }}>{opp.ticker}</span>
                      <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "3px", background: "#f0a50015", color: "#f0a500" }}>SINGLE MARKET</span>
                      <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "3px", background: `${confColor(opp.confidence)}15`, color: confColor(opp.confidence) }}>{opp.confidence}</span>
                      <span style={{ fontSize: "9px", color: "#334" }}>via {opp.source}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: "#00ff88" }}>+${opp.netProfitDollars?.toFixed(2)}</div>
                    <div style={{ fontSize: "9px", color: "#334" }}>net after fees</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px" }}>
                  {[
                    ["YES ASK", `${opp.yesPriceCents}¢`, "#e8f0f8"],
                    ["NO ASK", `${opp.noPriceCents}¢`, "#e8f0f8"],
                    ["SUM", `${opp.sumCents}¢`, opp.sumCents < 90 ? "#00ff88" : "#f0a500"],
                    ["GROSS", `+${opp.grossSpreadCents}¢`, "#f0a500"],
                    ["FEES", `-${(opp.yesFee || 0) + (opp.noFee || 0)}¢`, "#ff6666"],
                    ["CONTRACTS", opp.contracts, "#3a8fe8"],
                    ["GAP AGE", opp.gapAge ? `${(opp.gapAge / 1000).toFixed(1)}s` : "—", "#e8f0f8"],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ padding: "7px", background: "#03050a", borderRadius: "4px", textAlign: "center" }}>
                      <div style={{ fontSize: "8px", color: "#334", marginBottom: "2px" }}>{l}</div>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: "10px", fontSize: "9px", color: "#334", display: "flex", gap: "16px" }}>
                  <span>YES fee: {opp.yesFee}¢ | NO fee: {opp.noFee}¢</span>
                  <span>Frank-Wolfe allocation: [{opp.allocation?.map(a => (a * 100).toFixed(0)).join('%, ')}%]</span>
                  <span>Detected: {opp.detectedAt}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* LOGICAL ARB */}
        {activeTab === "logical" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ padding: "12px 16px", background: "#070b12", borderRadius: "8px", border: "1px solid #3a8fe822", marginBottom: "14px", fontSize: "10px", color: "#5a7a9a", lineHeight: "1.7" }}>
              🔗 <strong style={{ color: "#3a8fe8" }}>Logical arbitrage</strong> detects pricing impossibilities between related markets.
              Example: "Fed cuts June" priced higher than "Fed cuts H1 2026" — June is inside H1, making this mathematically impossible.
              These are guaranteed edges that most bots completely miss.
            </div>

            {logical.length === 0 ? (
              <div style={{ padding: "80px", textAlign: "center", color: "#1a2a3a", fontSize: "12px" }}>
                No logical arb detected<br />
                <span style={{ fontSize: "10px", color: "#0f2030" }}>Scanner checks subset violations and mutual exclusion across all market pairs</span>
              </div>
            ) : logical.map(opp => (
              <div key={opp.id} style={{ padding: "16px 20px", background: "#070b12", borderRadius: "8px", border: "1px solid #3a8fe833", marginBottom: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: "#3a8fe8", fontWeight: 700, marginBottom: "4px", letterSpacing: "0.08em" }}>
                      {opp.type === 'logical_subset' ? '⊂ SUBSET VIOLATION' : '⊕ MUTUAL EXCLUSION VIOLATION'}
                    </div>
                    <div style={{ fontSize: "11px", color: "#c0d8f0", lineHeight: "1.7" }}>{opp.description}</div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: "100px" }}>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "#3a8fe8" }}>+{(opp.spread * 100).toFixed(1)}%</div>
                    <div style={{ fontSize: "9px", color: "#334" }}>spread</div>
                  </div>
                </div>
                <div style={{ padding: "10px", background: "#03050a", borderRadius: "5px", fontSize: "10px", color: "#f0a500", marginBottom: "8px" }}>
                  ⚡ Action: {opp.action}
                </div>
                <div style={{ display: "flex", gap: "10px", fontSize: "9px", color: "#334" }}>
                  <span>Market 1: {opp.ticker1}</span>
                  <span>Market 2: {opp.ticker2}</span>
                  <span>Detected: {opp.detectedAt}</span>
                  <span>Gross: {opp.grossSpreadCents}¢</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TRADE LOG */}
        {activeTab === "trades" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ display: "flex", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
              {[
                ["TOTAL P&L", `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`, pnl >= 0 ? "#00ff88" : "#ff4444"],
                ["WIN RATE", `${(winRate * 100).toFixed(0)}%`, winRate >= 0.80 ? "#00ff88" : "#f0a500"],
                ["WINS", s.wins || 0, "#00ff88"],
                ["LOSSES", s.losses || 0, "#ff4444"],
                ["AVG LATENCY", avgLatency > 0 ? `${avgLatency.toFixed(0)}ms` : "—", "#3a8fe8"],
              ].map(([l, v, c]) => (
                <div key={l} style={{ padding: "10px 16px", background: "#070b12", borderRadius: "7px", border: "1px solid #0f1e2e" }}>
                  <div style={{ fontSize: "9px", color: "#334", marginBottom: "3px" }}>{l}</div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: c }}>{v}</div>
                </div>
              ))}
            </div>

            {trades.length === 0 ? (
              <div style={{ padding: "60px", textAlign: "center", color: "#1a2a3a", fontSize: "12px" }}>No trades executed yet</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #0a1828" }}>
                    {["TIME", "TICKER", "TYPE", "CONTRACTS", "YES¢", "NO¢", "GROSS", "FEES", "NET P&L", "LATENCY", "MODE", "STATUS"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", fontSize: "9px", color: "#334", letterSpacing: "0.08em", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...trades].reverse().map((trade, i) => (
                    <tr key={trade.id} className="trow" style={{ borderBottom: "1px solid #080c14" }}>
                      <td style={{ padding: "9px 10px", fontSize: "9px", color: "#334" }}>{trade.executedAt}</td>
                      <td style={{ padding: "9px 10px", fontSize: "10px", color: "#c0d8f0", fontWeight: 600 }}>{trade.ticker}</td>
                      <td style={{ padding: "9px 10px" }}>
                        <span style={{ fontSize: "8px", padding: "1px 5px", borderRadius: "3px", background: trade.type === 'single_market' ? "#f0a50015" : "#3a8fe815", color: trade.type === 'single_market' ? "#f0a500" : "#3a8fe8" }}>
                          {trade.type === 'single_market' ? 'SINGLE' : 'LOGICAL'}
                        </span>
                      </td>
                      <td style={{ padding: "9px 10px", fontSize: "10px", color: "#e8f0f8" }}>{trade.contracts}</td>
                      <td style={{ padding: "9px 10px", fontSize: "10px", color: "#e8f0f8" }}>{trade.yesPriceCents}¢</td>
                      <td style={{ padding: "9px 10px", fontSize: "10px", color: "#e8f0f8" }}>{trade.noPriceCents}¢</td>
                      <td style={{ padding: "9px 10px", fontSize: "10px", color: "#f0a500" }}>+{trade.grossSpreadCents}¢</td>
                      <td style={{ padding: "9px 10px", fontSize: "10px", color: "#ff6666" }}>-{(trade.yesFee || 0) + (trade.noFee || 0)}¢</td>
                      <td style={{ padding: "9px 10px", fontSize: "11px", fontWeight: 700, color: (trade.pnl || 0) >= 0 ? "#00ff88" : "#ff4444" }}>
                        {(trade.pnl || 0) >= 0 ? "+" : ""}${(trade.pnl || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: "9px 10px", fontSize: "9px", color: (trade.latencyMs || 0) < 200 ? "#00ff88" : "#f0a500" }}>
                        {trade.latencyMs ? `${trade.latencyMs}ms` : "—"}
                      </td>
                      <td style={{ padding: "9px 10px" }}>
                        <span style={{ fontSize: "9px", color: trade.mode === "paper" || trade.mode?.includes("paper") ? "#f0a500" : "#ff6666" }}>
                          {trade.mode?.includes("paper") ? "PAPER" : "LIVE"}
                        </span>
                      </td>
                      <td style={{ padding: "9px 10px" }}>
                        <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "3px", background: trade.status?.includes("filled") ? "#00ff8815" : "#ff444415", color: trade.status?.includes("filled") ? "#00ff88" : "#ff6666" }}>
                          {trade.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* SETTINGS */}
        {activeTab === "settings" && settings && (
          <div style={{ animation: "fadeUp 0.3s ease", maxWidth: "520px", display: "flex", flexDirection: "column", gap: "14px" }}>

            <div style={{ padding: "18px", background: "#070b12", borderRadius: "8px", border: "1px solid #0f1e2e" }}>
              <div style={{ fontSize: "10px", color: "#334", letterSpacing: "0.12em", marginBottom: "14px" }}>ARB DETECTION</div>
              {[
                ["Min Spread % (gross)", "minSpreadPct", settings.minSpreadPct, "0.5"],
                ["Min Net Profit (cents)", "minNetProfitCents", settings.minNetProfitCents, "1"],
                ["Min Market Volume ($)", "minVolume", settings.minVolume, "100"],
              ].map(([label, key, val, step]) => (
                <div key={key} style={{ marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "10px", color: "#5a7a9a" }}>{label}</div>
                  <input type="number" defaultValue={val} step={step} onBlur={e => updateSetting(key, e.target.value)}
                    style={{ width: "90px", padding: "5px 8px", background: "#03050a", border: "1px solid #1a2a3a", borderRadius: "4px", color: "#c8e0f0", fontFamily: "inherit", fontSize: "11px", outline: "none", textAlign: "right" }} />
                </div>
              ))}
            </div>

            <div style={{ padding: "18px", background: "#070b12", borderRadius: "8px", border: "1px solid #0f1e2e" }}>
              <div style={{ fontSize: "10px", color: "#334", letterSpacing: "0.12em", marginBottom: "14px" }}>POSITION SIZING</div>
              {[
                ["Capital Allocation % (0-1)", "arbCapitalPct", settings.arbCapitalPct, "0.05"],
                ["Kelly Fraction (0-1)", "kellyFraction", settings.kellyFraction, "0.05"],
                ["Max Contracts Per Trade", "maxContracts", settings.maxContracts, "10"],
              ].map(([label, key, val, step]) => (
                <div key={key} style={{ marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "10px", color: "#5a7a9a" }}>{label}</div>
                  <input type="number" defaultValue={val} step={step} onBlur={e => updateSetting(key, e.target.value)}
                    style={{ width: "90px", padding: "5px 8px", background: "#03050a", border: "1px solid #1a2a3a", borderRadius: "4px", color: "#c8e0f0", fontFamily: "inherit", fontSize: "11px", outline: "none", textAlign: "right" }} />
                </div>
              ))}
            </div>

            <div style={{ padding: "18px", background: "#070b12", borderRadius: "8px", border: "1px solid #0f1e2e" }}>
              <div style={{ fontSize: "10px", color: "#334", letterSpacing: "0.12em", marginBottom: "12px" }}>TRADING MODE</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => { if (!paperMode) togglePaper(); }} style={{ flex: 1, padding: "12px", borderRadius: "7px", background: paperMode ? "#f0a50020" : "#05080c", color: paperMode ? "#f0a500" : "#334", border: `1px solid ${paperMode ? "#f0a500" : "#1a2a3a"}`, fontFamily: "inherit", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                  📄 PAPER
                  <div style={{ fontSize: "9px", fontWeight: 400, marginTop: "3px", color: "#556" }}>Safe simulation</div>
                </button>
                <button onClick={() => { if (paperMode) togglePaper(); }} style={{ flex: 1, padding: "12px", borderRadius: "7px", background: !paperMode ? "#ff444420" : "#05080c", color: !paperMode ? "#ff6666" : "#334", border: `1px solid ${!paperMode ? "#ff4444" : "#1a2a3a"}`, fontFamily: "inherit", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                  ⚡ LIVE
                  <div style={{ fontSize: "9px", fontWeight: 400, marginTop: "3px", color: "#556" }}>Real execution</div>
                </button>
              </div>
              {!paperMode && <div style={{ marginTop: "10px", padding: "10px", background: "#ff444410", borderRadius: "5px", fontSize: "10px", color: "#ff6666", border: "1px solid #ff444433" }}>⚠ Live trading active — executing real orders on Kalshi</div>}
            </div>

            <div style={{ padding: "18px", background: "#070b12", borderRadius: "8px", border: "1px solid #0f1e2e" }}>
              <div style={{ fontSize: "10px", color: "#334", letterSpacing: "0.12em", marginBottom: "12px" }}>SYSTEM STATUS</div>
              {[
                ["WebSocket", s.wsConnected ? "✓ Real-time feed" : `✗ ${s.wsStatus || "offline"}`, s.wsConnected ? "#f0a500" : "#ff4444"],
                ["WS Reconnects", s.wsReconnectCount || 0, s.wsReconnectCount > 3 ? "#f0a500" : "#e8f0f8"],
                ["Kalshi API", s.kalshiConnected ? "✓ Connected" : "✗ Disconnected", s.kalshiConnected ? "#00ff88" : "#ff4444"],
                ["Balance", balance !== null ? `$${balance?.toFixed(2)}` : "—", "#f0a500"],
                ["Markets Cached", s.orderbookCacheSize || 0, "#3a8fe8"],
                ["Active Gaps", s.gapTrackerSize || 0, "#f0a500"],
                ["Total Scans", s.scanCount || 0, "#e8f0f8"],
                ["Paper Mode", paperMode ? "Active" : "DISABLED", paperMode ? "#f0a500" : "#ff6666"],
              ].map(([label, val, color]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #0a1828", fontSize: "11px" }}>
                  <span style={{ color: "#334" }}>{label}</span>
                  <span style={{ color, fontWeight: 600 }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
