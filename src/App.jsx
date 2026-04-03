import { useState, useEffect, useRef, useCallback } from "react";

const SUGGESTED_QUERIES = [
  "Give me a full analysis of Centrus Energy (LEU)",
  "Compare Vistra Energy vs Constellation Energy",
  "What's the latest news on uranium stocks?",
  "Show me insider buying activity for UEC",
  "What's your bull case for Fluor Corporation (FLR)?",
  "Give me a market overview — what's moving today?",
  "What sectors are benefiting from AI data center demand?",
  "Analyze CrowdStrike — is the selloff overdone?",
  "What's the private credit stress situation right now?",
  "Find me the key metrics for Amkor Technology (AMKR)",
];

function MarketTicker({ data }) {
  if (!data || data.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: "20px", overflowX: "auto", padding: "8px 0", borderBottom: "1px solid #1a2530" }}>
      {data.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center", whiteSpace: "nowrap", fontSize: "11px" }}>
          <span style={{ color: "#5a7a9a", fontWeight: 600 }}>{item.name}</span>
          <span style={{ color: "#e8f0f8", fontWeight: 700 }}>{item.price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span style={{ color: parseFloat(item.changePct) >= 0 ? "#00c87a" : "#ff4d4d", fontWeight: 600 }}>
            {parseFloat(item.changePct || 0) >= 0 ? "▲" : "▼"} {Math.abs(parseFloat(item.changePct || 0)).toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function StockCard({ data }) {
  if (!data?.price) return null;
  const changePct = parseFloat(data.changePct || 0);
  return (
    <div style={{ padding: "12px 16px", background: "#0a1520", borderRadius: "8px", border: "1px solid #1a2d40", marginBottom: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#e8f0f8", letterSpacing: "0.05em" }}>{data.ticker}</div>
          {data.name && <div style={{ fontSize: "10px", color: "#5a7a9a", marginTop: "2px" }}>{data.name}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#e8f0f8" }}>${data.price?.toFixed(2)}</div>
          <div style={{ fontSize: "11px", color: changePct >= 0 ? "#00c87a" : "#ff4d4d", fontWeight: 600 }}>
            {changePct >= 0 ? "▲" : "▼"} {Math.abs(changePct)}%
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
        {[
          ["P/E", data.peRatio?.toFixed(1)],
          ["Fwd P/E", data.forwardPE?.toFixed(1)],
          ["PEG", data.pegRatio?.toFixed(2)],
          ["Rev Growth", data.revenueGrowth],
          ["Gross Margin", data.grossMargin],
          ["ROE", data.returnOnEquity],
          ["D/E", data.debtToEquity?.toFixed(2)],
          ["FCF", data.freeCashFlow],
          ["Target", data.targetPrice ? `$${data.targetPrice}` : null],
        ].filter(([, v]) => v).map(([label, value]) => (
          <div key={label} style={{ padding: "4px 6px", background: "#060d14", borderRadius: "4px" }}>
            <div style={{ fontSize: "8px", color: "#334", marginBottom: "1px" }}>{label}</div>
            <div style={{ fontSize: "10px", color: "#c0d8f0", fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>
      {data.recommendation && (
        <div style={{ marginTop: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "9px", color: "#334" }}>Consensus:</span>
          <span style={{ fontSize: "10px", fontWeight: 700, color: data.recommendation === 'buy' || data.recommendation === 'strongBuy' ? "#00c87a" : data.recommendation === 'hold' ? "#f0a500" : "#ff4d4d" }}>
            {data.recommendation?.toUpperCase()}
          </span>
          {data.targetUpside && <span style={{ fontSize: "10px", color: "#5a7a9a" }}>{data.targetUpside} upside</span>}
        </div>
      )}
    </div>
  );
}

function MessageContent({ content }) {
  const lines = content.split('\n');
  return (
    <div style={{ lineHeight: "1.7", fontSize: "13px", color: "#c8e0f8" }}>
      {lines.map((line, i) => {
        if (line.startsWith('# ')) return <h2 key={i} style={{ fontSize: "16px", fontWeight: 800, color: "#e8f0f8", margin: "16px 0 8px", letterSpacing: "-0.02em" }}>{line.slice(2)}</h2>;
        if (line.startsWith('## ')) return <h3 key={i} style={{ fontSize: "14px", fontWeight: 700, color: "#b0d0f0", margin: "12px 0 6px" }}>{line.slice(3)}</h3>;
        if (line.startsWith('### ')) return <h4 key={i} style={{ fontSize: "12px", fontWeight: 700, color: "#8ab0d0", margin: "10px 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{line.slice(4)}</h4>;
        if (line.startsWith('- ') || line.startsWith('* ')) {
          const text = line.slice(2);
          return <div key={i} style={{ display: "flex", gap: "8px", margin: "3px 0", paddingLeft: "8px" }}>
            <span style={{ color: "#3a8fe8", flexShrink: 0, marginTop: "2px" }}>›</span>
            <span>{formatInline(text)}</span>
          </div>;
        }
        if (/^\d+\.\s/.test(line)) {
          const num = line.match(/^(\d+)\./)[1];
          const text = line.replace(/^\d+\.\s/, '');
          return <div key={i} style={{ display: "flex", gap: "8px", margin: "3px 0", paddingLeft: "8px" }}>
            <span style={{ color: "#3a8fe8", flexShrink: 0, fontWeight: 700, minWidth: "16px" }}>{num}.</span>
            <span>{formatInline(text)}</span>
          </div>;
        }
        if (line.startsWith('---') || line.startsWith('===')) return <hr key={i} style={{ border: "none", borderTop: "1px solid #1a2d40", margin: "12px 0" }} />;
        if (line === '') return <div key={i} style={{ height: "6px" }} />;
        return <p key={i} style={{ margin: "4px 0" }}>{formatInline(line)}</p>;
      })}
    </div>
  );
}

function formatInline(text) {
  const parts = [];
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1]) parts.push(<strong key={match.index} style={{ color: "#e8f0f8", fontWeight: 700 }}>{match[1]}</strong>);
    else if (match[2]) parts.push(<em key={match.index} style={{ color: "#b0d0f0" }}>{match[2]}</em>);
    else if (match[3]) parts.push(<code key={match.index} style={{ background: "#0a1520", color: "#3a8fe8", padding: "1px 5px", borderRadius: "3px", fontSize: "11px", fontFamily: "monospace" }}>{match[3]}</code>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

export default function Atlas() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `**ATLAS** is online — your personal financial markets research analyst.

I have real-time access to:
- **Live stock data** — prices, fundamentals, valuations, analyst targets
- **Insider transactions** — who's buying and selling
- **Financial news** — latest headlines across markets
- **Market overview** — indices, commodities, crypto

Ask me anything about financial markets. Some ideas to get started:`,
      marketData: null,
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [marketOverview, setMarketOverview] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetch('/api/market')
      .then(r => r.json())
      .then(setMarketOverview)
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text) => {
    const userMessage = text || input.trim();
    if (!userMessage || loading) return;

    setInput('');
    setShowSuggestions(false);
    setLoading(true);

    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, history }),
      });
      const data = await res.json();

      setMessages([...newMessages, {
        role: 'assistant',
        content: data.response || 'No response',
        marketData: data.marketData,
        tickers: data.tickers,
      }]);
    } catch (e) {
      setMessages([...newMessages, {
        role: 'assistant',
        content: 'Connection error — please try again.',
        marketData: null,
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, loading, messages]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#020b14",
      fontFamily: "'JetBrains Mono', monospace",
      color: "#b8cce0",
      display: "flex",
      flexDirection: "column",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Bebas+Neue&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        .msg-enter { animation: fadeUp 0.25s ease; }
        .suggestion:hover { background: #0a1d2e !important; border-color: #3a8fe8 !important; color: #e8f0f8 !important; cursor: pointer; }
        textarea:focus { outline: none; border-color: #3a8fe8 !important; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: #020b14; }
        ::-webkit-scrollbar-thumb { background: #1a2d40; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div style={{
        padding: "14px 24px",
        background: "#010a12",
        borderBottom: "1px solid #0f1e2e",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: "28px",
            letterSpacing: "0.15em",
            background: "linear-gradient(135deg, #e8f0f8 0%, #3a8fe8 50%, #e8f0f8 100%)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "shimmer 4s linear infinite",
          }}>ATLAS</div>
          <div style={{ fontSize: "9px", color: "#334", letterSpacing: "0.15em", borderLeft: "1px solid #1a2d40", paddingLeft: "16px" }}>
            FINANCIAL INTELLIGENCE SYSTEM
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00c87a", boxShadow: "0 0 6px #00c87a", animation: "blink 2s infinite" }} />
          <span style={{ fontSize: "9px", color: "#00c87a", letterSpacing: "0.1em" }}>LIVE DATA</span>
        </div>
      </div>

      {/* Market Ticker */}
      <div style={{ padding: "8px 24px", background: "#010a12", flexShrink: 0 }}>
        <MarketTicker data={marketOverview} />
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>
        {messages.map((msg, i) => (
          <div key={i} className="msg-enter" style={{ display: "flex", gap: "12px", flexDirection: msg.role === 'user' ? "row-reverse" : "row" }}>

            {/* Avatar */}
            <div style={{
              width: "32px",
              height: "32px",
              borderRadius: msg.role === 'user' ? "8px" : "50%",
              background: msg.role === 'user' ? "#1a3a5a" : "#0a1d2e",
              border: `1px solid ${msg.role === 'user' ? "#3a8fe8" : "#1a3a5a"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              fontWeight: 700,
              color: msg.role === 'user' ? "#3a8fe8" : "#5a9fd4",
              flexShrink: 0,
              letterSpacing: "0.05em",
            }}>
              {msg.role === 'user' ? 'L' : 'A'}
            </div>

            <div style={{ maxWidth: "80%", display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Message bubble */}
              <div style={{
                padding: "14px 18px",
                background: msg.role === 'user' ? "#0d1e2e" : "#060f18",
                borderRadius: msg.role === 'user' ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
                border: `1px solid ${msg.role === 'user' ? "#1a3a5a" : "#0f2030"}`,
              }}>
                {msg.role === 'user' ? (
                  <div style={{ fontSize: "13px", color: "#c8e0f8", lineHeight: "1.6" }}>{msg.content}</div>
                ) : (
                  <MessageContent content={msg.content} />
                )}
              </div>

              {/* Market data cards */}
              {msg.marketData?.stocks && msg.marketData.stocks.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: msg.marketData.stocks.length === 1 ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: "8px" }}>
                  {msg.marketData.stocks.map((stock, j) => (
                    <StockCard key={j} data={{ ...stock.quote, ...stock.summary, ticker: stock.ticker }} />
                  ))}
                </div>
              )}

              {/* News */}
              {msg.marketData?.news && msg.marketData.news.length > 0 && (
                <div style={{ padding: "10px 14px", background: "#060f18", borderRadius: "8px", border: "1px solid #0f2030" }}>
                  <div style={{ fontSize: "9px", color: "#334", letterSpacing: "0.1em", marginBottom: "8px" }}>RELEVANT NEWS</div>
                  {msg.marketData.news.slice(0, 5).map((n, j) => (
                    <div key={j} style={{ padding: "5px 0", borderBottom: j < 4 ? "1px solid #0a1520" : "none", display: "flex", gap: "8px" }}>
                      <span style={{ color: "#3a8fe8", flexShrink: 0, marginTop: "1px" }}>›</span>
                      <div>
                        <div style={{ fontSize: "11px", color: "#a0c0e0", lineHeight: "1.4" }}>{n.title}</div>
                        <div style={{ fontSize: "9px", color: "#334", marginTop: "2px" }}>{n.publisher} · {n.publishTime}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Suggestions after first message */}
              {i === 0 && showSuggestions && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                  {SUGGESTED_QUERIES.slice(0, 6).map((q, j) => (
                    <button key={j} className="suggestion"
                      onClick={() => sendMessage(q)}
                      style={{
                        padding: "6px 12px",
                        background: "#060f18",
                        border: "1px solid #1a2d40",
                        borderRadius: "20px",
                        color: "#5a7a9a",
                        fontFamily: "inherit",
                        fontSize: "10px",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        textAlign: "left",
                      }}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="msg-enter" style={{ display: "flex", gap: "12px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#0a1d2e", border: "1px solid #1a3a5a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, color: "#5a9fd4", flexShrink: 0 }}>A</div>
            <div style={{ padding: "14px 18px", background: "#060f18", borderRadius: "4px 12px 12px 12px", border: "1px solid #0f2030", display: "flex", gap: "6px", alignItems: "center" }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3a8fe8", animation: `blink 1.2s ${i * 0.2}s infinite` }} />
              ))}
              <span style={{ fontSize: "11px", color: "#334", marginLeft: "4px" }}>Fetching data & analyzing...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "16px 24px", background: "#010a12", borderTop: "1px solid #0f1e2e", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about financial markets... (e.g. 'Analyze LEU', 'Compare VST vs CEG', 'What's moving in uranium today?')"
              rows={1}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "#060f18",
                border: "1px solid #1a2d40",
                borderRadius: "10px",
                color: "#e8f0f8",
                fontFamily: "inherit",
                fontSize: "13px",
                resize: "none",
                lineHeight: "1.5",
                boxSizing: "border-box",
                transition: "border-color 0.15s ease",
                minHeight: "44px",
                maxHeight: "120px",
                overflowY: "auto",
              }}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            style={{
              padding: "12px 20px",
              background: input.trim() && !loading ? "#1a3a5a" : "#0a1520",
              border: `1px solid ${input.trim() && !loading ? "#3a8fe8" : "#1a2d40"}`,
              borderRadius: "10px",
              color: input.trim() && !loading ? "#3a8fe8" : "#334",
              fontFamily: "inherit",
              fontSize: "11px",
              fontWeight: 700,
              cursor: input.trim() && !loading ? "pointer" : "default",
              transition: "all 0.15s ease",
              letterSpacing: "0.08em",
              whiteSpace: "nowrap",
            }}>
            SEND ↵
          </button>
        </div>
        <div style={{ fontSize: "9px", color: "#1a2d40", marginTop: "8px", textAlign: "center", letterSpacing: "0.1em" }}>
          ATLAS · LIVE MARKET DATA · POWERED BY CLAUDE SONNET · NOT FINANCIAL ADVICE
        </div>
      </div>
    </div>
  );
}
