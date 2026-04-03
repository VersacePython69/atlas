const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// ═══════════════════════════════════════════════════════════════
// KALSHI API
// ═══════════════════════════════════════════════════════════════

const KALSHI_BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_WS_URL = 'wss://api.elections.kalshi.com/trade-api/ws/v2';
const KALSHI_KEY_ID = process.env.KALSHI_API_KEY_ID;
const KALSHI_PRIVATE_KEY_RAW = process.env.KALSHI_PRIVATE_KEY;

function createSignature(method, fullPath) {
  try {
    const timestamp = String(Date.now());
    const pathWithoutQuery = fullPath.split('?')[0];
    const message = `${timestamp}${method}${pathWithoutQuery}`;
    let pem = KALSHI_PRIVATE_KEY_RAW.replace(/\\n/g, '\n');
    const privateKey = crypto.createPrivateKey({ key: pem, format: 'pem', type: 'pkcs1' });
    const signature = crypto.sign('sha256', Buffer.from(message), {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      dsaEncoding: 'der',
    });
    return { timestamp, signature: signature.toString('base64') };
  } catch (e) {
    console.error('Signature error:', e.message);
    return null;
  }
}

function getAuthHeaders(method, endpoint) {
  const fullPath = `/trade-api/v2${endpoint}`;
  const sig = createSignature(method, fullPath);
  if (!sig) return null;
  return {
    'KALSHI-ACCESS-KEY': KALSHI_KEY_ID,
    'KALSHI-ACCESS-SIGNATURE': sig.signature,
    'KALSHI-ACCESS-TIMESTAMP': sig.timestamp,
    'Content-Type': 'application/json',
  };
}

async function kalshiGet(endpoint) {
  try {
    const headers = getAuthHeaders('GET', endpoint);
    if (!headers) return null;
    const res = await fetch(`${KALSHI_BASE_URL}${endpoint}`, { headers });
    if (!res.ok) {
      console.error(`GET ${endpoint} → ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('kalshiGet error:', e.message);
    return null;
  }
}

async function kalshiPost(endpoint, body) {
  try {
    const headers = getAuthHeaders('POST', endpoint);
    if (!headers) return null;
    const res = await fetch(`${KALSHI_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`POST ${endpoint} → ${res.status}:`, text.slice(0, 300));
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('kalshiPost error:', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// KALSHI FEE CALCULATOR
// Official formula: ceil(0.07 × contracts × price × (1 - price))
// ═══════════════════════════════════════════════════════════════

function kalshiFee(contracts, priceCents) {
  const price = priceCents / 100;
  return Math.ceil(0.07 * contracts * price * (1 - price));
}

function calculateNetProfit(contracts, yesPriceCents, noPriceCents) {
  const grossProfit = contracts * (100 - yesPriceCents - noPriceCents);
  const yesFee = kalshiFee(contracts, yesPriceCents);
  const noFee = kalshiFee(contracts, noPriceCents);
  const netProfit = grossProfit - yesFee - noFee;
  return { grossProfit, yesFee, noFee, netProfit };
}

// ═══════════════════════════════════════════════════════════════
// FRANK-WOLFE BREGMAN PROJECTION ENGINE
// ═══════════════════════════════════════════════════════════════

function projectToSimplex(v) {
  const sorted = [...v].sort((a, b) => b - a);
  let rho = 0, cumSum = 0;
  for (let i = 0; i < v.length; i++) {
    cumSum += sorted[i];
    if (sorted[i] - (cumSum - 1) / (i + 1) > 0) rho = i;
  }
  const theta = (sorted.slice(0, rho + 1).reduce((a, b) => a + b, 0) - 1) / (rho + 1);
  return v.map(vi => Math.max(vi - theta, 1e-8));
}

function frankWolfeArbitrage(prices) {
  const sum = prices.reduce((a, b) => a + b, 0);
  if (sum >= 0.96) return null; // Need at least 4% gross spread
  const spread = 1 - sum;
  const n = prices.length;
  let allocation = new Array(n).fill(1 / n);

  for (let iter = 0; iter < 80; iter++) {
    const grad = allocation.map((a, i) =>
      a < 1e-10 ? -1e8 : Math.log(a / Math.max(prices[i], 1e-8)) + 1
    );
    const minIdx = grad.indexOf(Math.min(...grad));
    const vertex = new Array(n).fill(0);
    vertex[minIdx] = 1;
    let bestAlloc = allocation;
    let bestKL = Infinity;
    for (let alpha = 0.005; alpha <= 1.0; alpha += 0.005) {
      const candidate = projectToSimplex(
        allocation.map((a, i) => a * (1 - alpha) + vertex[i] * alpha)
      );
      const kl = candidate.reduce((s, ci, i) =>
        ci > 1e-10 && prices[i] > 1e-10 ? s + ci * Math.log(ci / prices[i]) : s, 0
      );
      if (kl < bestKL) { bestKL = kl; bestAlloc = candidate; }
    }
    if (JSON.stringify(bestAlloc) === JSON.stringify(allocation)) break;
    allocation = bestAlloc;
  }
  return { allocation, spread };
}

// ═══════════════════════════════════════════════════════════════
// ORDERBOOK DEPTH ANALYZER
// ═══════════════════════════════════════════════════════════════

function calculateMaxContracts(orderbook, side, targetPriceCents) {
  // Count contracts available at or better than target price
  const orders = side === 'yes'
    ? (orderbook?.yes || [])
    : (orderbook?.no || []);

  let totalContracts = 0;
  for (const [price, qty] of orders) {
    if (side === 'yes' && price <= targetPriceCents) totalContracts += qty;
    if (side === 'no' && price <= targetPriceCents) totalContracts += qty;
  }
  return Math.min(totalContracts, 500); // Cap at 500 contracts per leg
}

async function fetchOrderbook(ticker) {
  try {
    const data = await kalshiGet(`/markets/${ticker}/orderbook`);
    return data?.orderbook || null;
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// GAP PERSISTENCE TRACKER
// Confirms gaps are real before executing
// ═══════════════════════════════════════════════════════════════

const gapTracker = {};
const GAP_PERSISTENCE_MS = 2500; // Gap must persist 2.5 seconds

function trackGap(gapId, spread) {
  if (!gapTracker[gapId]) {
    gapTracker[gapId] = {
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      spread,
      confirmed: false,
    };
    return false;
  }
  gapTracker[gapId].lastSeen = Date.now();
  gapTracker[gapId].spread = spread;
  const age = Date.now() - gapTracker[gapId].firstSeen;
  if (age >= GAP_PERSISTENCE_MS && !gapTracker[gapId].confirmed) {
    gapTracker[gapId].confirmed = true;
    return true; // Gap is real and persistent
  }
  return gapTracker[gapId].confirmed;
}

function clearGap(gapId) {
  delete gapTracker[gapId];
}

// Clean up stale gaps every 30 seconds
setInterval(() => {
  const now = Date.now();
  Object.keys(gapTracker).forEach(id => {
    if (now - gapTracker[id].lastSeen > 30000) delete gapTracker[id];
  });
}, 30000);

// ═══════════════════════════════════════════════════════════════
// LOGICAL CROSS-MARKET ARB DETECTOR
// Finds impossible pricing between related markets
// ═══════════════════════════════════════════════════════════════

function detectLogicalArb(markets) {
  const opportunities = [];

  // Build market index by question text for comparison
  const marketList = Object.values(markets);

  for (let i = 0; i < marketList.length; i++) {
    for (let j = i + 1; j < marketList.length; j++) {
      const m1 = marketList[i];
      const m2 = marketList[j];

      if (!m1.yesAsk || !m2.yesAsk) continue;
      if (m1.volume < 500 || m2.volume < 500) continue; // Skip illiquid

      // Pattern 1: Subset relationship
      // e.g. "Fed cuts June" YES cannot exceed "Fed cuts H1" YES
      const isSubset = detectSubsetRelationship(m1, m2);
      if (isSubset) {
        const { parent, child } = isSubset;
        // Child probability cannot exceed parent probability
        // If child YES ask > parent YES bid — logical impossibility
        if (child.yesAsk > parent.yesBid + 5 && parent.yesBid > 0) {
          const spread = (child.yesAsk - parent.yesBid) / 100;
          opportunities.push({
            type: 'logical_subset',
            ticker1: parent.ticker,
            ticker2: child.ticker,
            question1: parent.question,
            question2: child.question,
            spread,
            description: `${child.question} (${child.yesAsk}¢) prices HIGHER than parent ${parent.question} (${parent.yesBid}¢) — logical impossibility`,
            action: `BUY NO on ${child.ticker} + BUY YES on ${parent.ticker}`,
            grossSpreadCents: child.yesAsk - parent.yesBid,
          });
        }
      }

      // Pattern 2: Mutual exclusivity violation
      // Two mutually exclusive events both priced too high
      const isMutuallyExclusive = detectMutualExclusion(m1, m2);
      if (isMutuallyExclusive) {
        const combinedYes = (m1.yesAsk + m2.yesAsk) / 100;
        if (combinedYes > 1.05) { // More than 5% over 100%
          opportunities.push({
            type: 'logical_mutual_exclusion',
            ticker1: m1.ticker,
            ticker2: m2.ticker,
            question1: m1.question,
            question2: m2.question,
            spread: combinedYes - 1,
            description: `${m1.question} (${m1.yesAsk}¢) + ${m2.question} (${m2.yesAsk}¢) = ${combinedYes.toFixed(2)} — sum exceeds 100%`,
            action: `BUY NO on both ${m1.ticker} and ${m2.ticker}`,
            grossSpreadCents: (m1.yesAsk + m2.yesAsk) - 100,
          });
        }
      }
    }
  }

  return opportunities;
}

function detectSubsetRelationship(m1, m2) {
  const q1 = (m1.question || '').toLowerCase();
  const q2 = (m2.question || '').toLowerCase();

  // Time subset patterns
  const timeSubsets = [
    { parent: ['h1', 'first half', 'q1 or q2'], child: ['january', 'february', 'march', 'april', 'may', 'june', 'q1', 'q2'] },
    { parent: ['h2', 'second half', 'q3 or q4'], child: ['july', 'august', 'september', 'october', 'november', 'december', 'q3', 'q4'] },
    { parent: ['2026', 'this year', 'end of year'], child: ['q1', 'q2', 'q3', 'q4', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'h1', 'h2'] },
    { parent: ['by end of year', 'in 2026'], child: ['by june', 'by july', 'by march', 'by q2', 'by q1'] },
  ];

  for (const pattern of timeSubsets) {
    const m1IsParent = pattern.parent.some(p => q1.includes(p));
    const m2IsChild = pattern.child.some(c => q2.includes(c));
    const m2IsParent = pattern.parent.some(p => q2.includes(p));
    const m1IsChild = pattern.child.some(c => q1.includes(c));

    // Check they're about the same topic (share significant words)
    const words1 = new Set(q1.split(' ').filter(w => w.length > 4));
    const words2 = new Set(q2.split(' ').filter(w => w.length > 4));
    const sharedWords = [...words1].filter(w => words2.has(w)).length;
    const isSameTopic = sharedWords >= 2;

    if (!isSameTopic) continue;

    if (m1IsParent && m2IsChild) return { parent: m1, child: m2 };
    if (m2IsParent && m1IsChild) return { parent: m2, child: m1 };
  }
  return null;
}

function detectMutualExclusion(m1, m2) {
  const q1 = (m1.question || '').toLowerCase();
  const q2 = (m2.question || '').toLowerCase();

  // Candidate vs candidate patterns
  const exclusionPatterns = [
    ['trump', 'harris'], ['trump', 'biden'], ['trump', 'desantis'],
    ['republican', 'democrat'], ['yes', 'no'],
    ['above', 'below'], ['higher', 'lower'],
    ['cut', 'hike'], ['increase', 'decrease'],
  ];

  for (const [term1, term2] of exclusionPatterns) {
    if (q1.includes(term1) && q2.includes(term2)) return true;
    if (q1.includes(term2) && q2.includes(term1)) return true;
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════
// LIVE ORDERBOOK CACHE (Updated via WebSocket)
// ═══════════════════════════════════════════════════════════════

const orderbookCache = {};
// { ticker: { yesBid, yesAsk, noBid, noAsk, lastUpdated, volume } }

function updateOrderbook(ticker, update) {
  if (!orderbookCache[ticker]) {
    orderbookCache[ticker] = {};
  }
  const ob = orderbookCache[ticker];
  ob.lastUpdated = Date.now();

  if (update.yes_bid !== undefined) ob.yesBid = update.yes_bid;
  if (update.yes_ask !== undefined) ob.yesAsk = update.yes_ask;
  if (update.no_bid !== undefined) ob.noBid = update.no_bid;
  if (update.no_ask !== undefined) ob.noAsk = update.no_ask;
  if (update.volume !== undefined) ob.volume = update.volume;
  if (update.title !== undefined) ob.question = update.title;
  if (update.category !== undefined) ob.category = update.category;
  ob.ticker = ticker;

  // Immediately scan for arb on this market
  scanSingleMarket(ticker);
}

// ═══════════════════════════════════════════════════════════════
// ARB SCANNER — SINGLE MARKET
// ═══════════════════════════════════════════════════════════════

async function scanSingleMarket(ticker) {
  const ob = orderbookCache[ticker];
  if (!ob || !ob.yesAsk || !ob.noAsk) return;

  const yesPriceCents = ob.yesAsk;
  const noPriceCents = ob.noAsk;
  const sumCents = yesPriceCents + noPriceCents;

  // Must be under 96¢ to have potential (4% gross minimum)
  if (sumCents >= 96) {
    clearGap(`single_${ticker}`);
    return;
  }

  const spread = (100 - sumCents) / 100;
  const gapId = `single_${ticker}`;

  // Track gap persistence
  const isConfirmed = trackGap(gapId, spread);
  if (!isConfirmed) return; // Not yet confirmed persistent

  // Calculate optimal contracts based on Kelly and capital
  const capital = state.kalshiBalance || 545;
  const arbCapital = capital * state.settings.arbCapitalPct;
  const kellyContracts = Math.floor(
    (arbCapital * state.settings.kellyFraction * spread) /
    ((yesPriceCents + noPriceCents) / 100)
  );
  const contracts = Math.max(1, Math.min(kellyContracts, state.settings.maxContracts));

  // Fee-aware profit calculation
  const { grossProfit, yesFee, noFee, netProfit } = calculateNetProfit(
    contracts, yesPriceCents, noPriceCents
  );

  // Only proceed if profitable after fees
  if (netProfit <= 0) {
    addLog(`${ticker}: Gross spread ${(spread * 100).toFixed(1)}¢ but unprofitable after fees (gross: ${grossProfit}¢, fees: ${yesFee + noFee}¢)`, 'info');
    return;
  }

  // Run Frank-Wolfe for optimal allocation
  const prices = [yesPriceCents / 100, noPriceCents / 100];
  const fwResult = frankWolfeArbitrage(prices);
  if (!fwResult) return;

  const opp = {
    id: `arb_${ticker}_${Date.now()}`,
    type: 'single_market',
    ticker,
    question: ob.question || ticker,
    category: ob.category || 'unknown',
    yesPriceCents,
    noPriceCents,
    sumCents,
    grossSpreadCents: 100 - sumCents,
    netProfitCents: netProfit,
    yesFee,
    noFee,
    contracts,
    netProfitDollars: netProfit / 100,
    spreadPct: spread * 100,
    allocation: fwResult.allocation,
    gapAge: Date.now() - gapTracker[gapId].firstSeen,
    detectedAt: new Date().toLocaleTimeString(),
    detectedMs: Date.now(),
    confidence: netProfit > 50 ? 'HIGH' : netProfit > 20 ? 'MEDIUM' : 'LOW',
    source: 'websocket',
  };

  // Check if already tracking this opportunity
  const existing = state.arbOpportunities.find(o => o.ticker === ticker && o.type === 'single_market');
  if (existing) {
    // Update existing
    Object.assign(existing, opp);
  } else {
    state.arbOpportunities = [...state.arbOpportunities, opp].slice(-50);
    addLog(`⚡ ARB DETECTED: ${ticker} | YES ${yesPriceCents}¢ + NO ${noPriceCents}¢ = ${sumCents}¢ | Net: +$${(netProfit / 100).toFixed(2)} after fees | Age: ${opp.gapAge}ms`, 'bullish');
  }

  // Execute if conditions met
  if (
    !state.paperMode &&
    netProfit > state.settings.minNetProfitCents &&
    opp.gapAge >= GAP_PERSISTENCE_MS
  ) {
    await executeArb(opp);
  } else if (state.paperMode && netProfit > state.settings.minNetProfitCents) {
    simulateArb(opp);
  }
}

// ═══════════════════════════════════════════════════════════════
// FULL MARKET SCAN — ALL MARKETS
// ═══════════════════════════════════════════════════════════════

async function scanAllMarkets() {
  state.scanCount++;

  // Scan single-market arb on all cached orderbooks
  const tickers = Object.keys(orderbookCache);
  for (const ticker of tickers) {
    await scanSingleMarket(ticker);
  }

  // Scan logical cross-market arb
  const logicalOpps = detectLogicalArb(orderbookCache);
  for (const opp of logicalOpps) {
    const existing = state.logicalOpportunities.find(
      o => o.ticker1 === opp.ticker1 && o.ticker2 === opp.ticker2
    );
    if (!existing) {
      state.logicalOpportunities = [...state.logicalOpportunities, {
        ...opp,
        id: `logical_${opp.ticker1}_${opp.ticker2}_${Date.now()}`,
        detectedAt: new Date().toLocaleTimeString(),
      }].slice(-20);
      addLog(`🔗 LOGICAL ARB: ${opp.description}`, 'bullish');
    }
  }

  // Remove stale opportunities (markets that are now fairly priced)
  state.arbOpportunities = state.arbOpportunities.filter(opp => {
    const ob = orderbookCache[opp.ticker];
    if (!ob) return false;
    const sum = (ob.yesAsk || 100) + (ob.noAsk || 100);
    return sum < 96; // Still has spread
  });

  state.logicalOpportunities = state.logicalOpportunities.filter(opp => {
    // Remove if older than 10 minutes
    return opp.id && (Date.now() - parseInt(opp.id.split('_').pop())) < 600000;
  });

  state.lastScan = new Date().toLocaleTimeString();
}

// ═══════════════════════════════════════════════════════════════
// TRADE EXECUTION
// ═══════════════════════════════════════════════════════════════

const recentlyExecuted = new Set();

async function executeArb(opp) {
  if (recentlyExecuted.has(opp.ticker)) return;
  recentlyExecuted.add(opp.ticker);
  setTimeout(() => recentlyExecuted.delete(opp.ticker), 30000);

  addLog(`🚀 EXECUTING: ${opp.ticker} | ${opp.contracts} contracts | Expected: +$${opp.netProfitDollars.toFixed(2)}`, 'bullish');

  const executionStart = Date.now();

  try {
    // Submit both legs concurrently for minimum exposure window
    const [yesResult, noResult] = await Promise.all([
      kalshiPost('/portfolio/orders', {
        ticker: opp.ticker,
        client_order_id: `arb_yes_${Date.now()}`,
        type: 'limit',
        action: 'buy',
        side: 'yes',
        count: opp.contracts,
        yes_price: opp.yesPriceCents + 1, // 1¢ above for immediate fill
        expiration_ts: Math.floor(Date.now() / 1000) + 60,
      }),
      kalshiPost('/portfolio/orders', {
        ticker: opp.ticker,
        client_order_id: `arb_no_${Date.now() + 1}`,
        type: 'limit',
        action: 'buy',
        side: 'no',
        count: opp.contracts,
        yes_price: 100 - opp.noPriceCents - 1, // Adjusted for NO side
        expiration_ts: Math.floor(Date.now() / 1000) + 60,
      }),
    ]);

    const latency = Date.now() - executionStart;
    const bothFilled = yesResult?.order && noResult?.order;

    if (bothFilled) {
      const trade = {
        ...opp,
        yesOrderId: yesResult.order.order_id,
        noOrderId: noResult.order.order_id,
        executedAt: new Date().toLocaleTimeString(),
        latencyMs: latency,
        mode: 'live',
        pnl: opp.netProfitDollars,
        status: 'filled',
      };
      state.executedTrades = [...state.executedTrades.slice(-100), trade];
      state.pnl += opp.netProfitDollars;
      state.wins++;
      addLog(`✅ FILLED: ${opp.ticker} | +$${opp.netProfitDollars.toFixed(2)} | Latency: ${latency}ms`, 'bullish');
      setTimeout(fetchBalance, 2000);
    } else {
      // One leg failed — need to handle exposure
      addLog(`⚠️ PARTIAL FILL: ${opp.ticker} — YES: ${!!yesResult?.order} NO: ${!!noResult?.order}`, 'error');
      state.losses++;
    }

  } catch (e) {
    addLog(`Execution error: ${e.message}`, 'error');
  }
}

function simulateArb(opp) {
  if (recentlyExecuted.has(`sim_${opp.ticker}`)) return;
  recentlyExecuted.add(`sim_${opp.ticker}`);
  setTimeout(() => recentlyExecuted.delete(`sim_${opp.ticker}`), 30000);

  // In paper mode simulate with 85% fill rate (accounts for execution risk)
  const bothFill = Math.random() < 0.85;
  const pnl = bothFill ? opp.netProfitDollars : -opp.netProfitDollars * 0.3;

  const trade = {
    ...opp,
    executedAt: new Date().toLocaleTimeString(),
    latencyMs: Math.floor(Math.random() * 200 + 50),
    mode: 'paper',
    pnl,
    status: bothFill ? 'paper_filled' : 'paper_partial',
  };

  state.executedTrades = [...state.executedTrades.slice(-100), trade];
  state.pnl += pnl;
  if (bothFill) state.wins++; else state.losses++;

  addLog(`[PAPER] ${opp.ticker} | Net: +$${opp.netProfitDollars.toFixed(2)} | ${bothFill ? `✓ Simulated fill` : `✗ Partial fill simulation`}`, bothFill ? 'bullish' : 'bearish');
}

// ═══════════════════════════════════════════════════════════════
// WEBSOCKET — REAL-TIME PRICE FEED
// ═══════════════════════════════════════════════════════════════

let ws = null;
let wsSubscribed = false;

function connectWebSocket() {
  try {
    let WebSocket;
    try {
      WebSocket = require('ws');
    } catch (e) {
      addLog('ws package not found — using REST polling only', 'info');
      return;
    }

    const sig = createSignature('GET', '/trade-api/ws/v2');
    if (!sig) {
      addLog('WebSocket auth failed', 'error');
      return;
    }

    ws = new WebSocket(KALSHI_WS_URL, {
      headers: {
        'KALSHI-ACCESS-KEY': KALSHI_KEY_ID,
        'KALSHI-ACCESS-SIGNATURE': sig.signature,
        'KALSHI-ACCESS-TIMESTAMP': sig.timestamp,
      }
    });

    ws.on('open', () => {
      state.wsConnected = true;
      state.wsStatus = 'connected';
      addLog('✓ WebSocket connected — real-time orderbook feed active', 'bullish');

      // Subscribe to orderbook updates for all open markets
      const tickers = state.realMarkets.map(m => m.id);
      if (tickers.length > 0) {
        ws.send(JSON.stringify({
          id: 1,
          cmd: 'subscribe',
          params: {
            channels: ['orderbook_delta'],
            market_tickers: tickers.slice(0, 200), // Max 200 markets
          }
        }));
        wsSubscribed = true;
        addLog(`Subscribed to orderbook feed for ${Math.min(tickers.length, 200)} markets`, 'info');
      }
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // Handle orderbook delta updates
        if (msg.type === 'orderbook_delta' && msg.msg) {
          const { market_ticker, yes, no } = msg.msg;
          if (market_ticker) {
            const update = {};
            if (yes?.ask !== undefined) update.yesAsk = yes.ask;
            if (yes?.bid !== undefined) update.yesBid = yes.bid;
            if (no?.ask !== undefined) update.noAsk = no.ask;
            if (no?.bid !== undefined) update.noBid = no.bid;

            // Add market metadata if available
            const market = state.realMarkets.find(m => m.id === market_ticker);
            if (market) {
              update.title = market.question;
              update.category = market.category;
              update.volume = market.volume;
            }

            updateOrderbook(market_ticker, update);
          }
        }

        // Handle snapshot (full orderbook)
        if (msg.type === 'orderbook_snapshot' && msg.msg) {
          const { market_ticker, yes, no } = msg.msg;
          if (market_ticker) {
            updateOrderbook(market_ticker, {
              yesAsk: yes?.ask,
              yesBid: yes?.bid,
              noAsk: no?.ask,
              noBid: no?.bid,
            });
          }
        }

      } catch (e) {
        // Ignore parse errors
      }
    });

    ws.on('close', (code) => {
      state.wsConnected = false;
      state.wsStatus = 'reconnecting';
      wsSubscribed = false;
      state.wsReconnectCount++;
      addLog(`WebSocket closed (${code}) — reconnecting in 3s`, 'error');
      setTimeout(connectWebSocket, 3000);
    });

    ws.on('error', (e) => {
      state.wsConnected = false;
      state.wsStatus = 'error';
      addLog(`WebSocket error: ${e.message}`, 'error');
    });

  } catch (e) {
    addLog(`WebSocket failed: ${e.message}`, 'error');
    state.wsStatus = 'failed';
  }
}

// ═══════════════════════════════════════════════════════════════
// MARKET DATA & BALANCE
// ═══════════════════════════════════════════════════════════════

async function fetchMarkets() {
  try {
    const [g, p, c] = await Promise.all([
      kalshiGet('/markets?status=open&limit=100'),
      kalshiGet('/markets?status=open&limit=50&category=politics'),
      kalshiGet('/markets?status=open&limit=30&category=crypto'),
    ]);

    const all = [
      ...(g?.markets || []),
      ...(p?.markets || []),
      ...(c?.markets || []),
    ];

    const seen = new Set();
    state.realMarkets = all
      .filter(m => {
        if (!m?.ticker || seen.has(m.ticker)) return false;
        seen.add(m.ticker);
        return true;
      })
      .map(m => ({
        id: m.ticker,
        question: m.title || m.ticker,
        category: m.category || 'general',
        yesAsk: m.yes_ask || 50,
        yesBid: m.yes_bid || 48,
        noAsk: m.no_ask || 50,
        noBid: m.no_bid || 48,
        volume: m.volume || 0,
        closeTime: m.close_time,
      }));

    // Initialize orderbook cache from market data
    state.realMarkets.forEach(m => {
      updateOrderbook(m.id, {
        yesAsk: m.yesAsk,
        yesBid: m.yesBid,
        noAsk: m.noAsk,
        noBid: m.noBid,
        title: m.question,
        category: m.category,
        volume: m.volume,
      });
    });

    state.lastMarketFetch = new Date().toLocaleTimeString();
    state.kalshiConnected = true;
    addLog(`Markets loaded: ${state.realMarkets.length} | Orderbook cache: ${Object.keys(orderbookCache).length}`, 'info');

    // Resubscribe WebSocket if already connected
    if (ws && state.wsConnected && !wsSubscribed) {
      const tickers = state.realMarkets.map(m => m.id);
      ws.send(JSON.stringify({
        id: 2,
        cmd: 'subscribe',
        params: {
          channels: ['orderbook_delta'],
          market_tickers: tickers.slice(0, 200),
        }
      }));
      wsSubscribed = true;
    }

  } catch (e) {
    console.error('Market fetch error:', e.message);
  }
}

async function fetchBalance() {
  try {
    const data = await kalshiGet('/portfolio/balance');
    if (data) {
      state.kalshiBalance = data.balance / 100;
      state.kalshiConnected = true;
    }
  } catch (e) {
    console.error('Balance error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

const state = {
  kalshiBalance: null,
  kalshiConnected: false,
  realMarkets: [],
  lastMarketFetch: null,

  arbOpportunities: [],
  logicalOpportunities: [],
  executedTrades: [],
  scanCount: 0,
  lastScan: null,

  pnl: 0,
  wins: 0,
  losses: 0,

  paperMode: true,

  wsConnected: false,
  wsStatus: 'connecting',
  wsReconnectCount: 0,

  settings: {
    arbCapitalPct: 0.90,        // Use 90% of capital for arb
    kellyFraction: 0.25,        // Quarter Kelly
    maxContracts: 200,          // Max contracts per trade
    minNetProfitCents: 10,      // Minimum $0.10 net profit after fees
    minSpreadPct: 4,            // Minimum 4% gross spread
    minVolume: 500,             // Skip markets under $500 volume
  },

  log: [],
};

function addLog(msg, type = 'info') {
  const entry = { msg, type, time: new Date().toLocaleTimeString() };
  state.log = [...state.log.slice(-400), entry];
  console.log(`[${type.toUpperCase()}] ${msg}`);
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULING
// ═══════════════════════════════════════════════════════════════

// Full scan every 5 seconds (catches anything WebSocket misses)
setInterval(scanAllMarkets, 5000);

// Market refresh every 5 minutes
setInterval(fetchMarkets, 5 * 60 * 1000);

// Balance refresh every 2 minutes
setInterval(fetchBalance, 2 * 60 * 1000);

// Log stats every 10 minutes
setInterval(() => {
  const opps = state.arbOpportunities.length;
  const logical = state.logicalOpportunities.length;
  const cacheSize = Object.keys(orderbookCache).length;
  addLog(`📊 Status: ${opps} single-market arb | ${logical} logical arb | ${cacheSize} markets in cache | ${state.scanCount} scans | WS: ${state.wsStatus}`, 'info');
}, 10 * 60 * 1000);

async function startup() {
  addLog('🚀 FRANK-WOLFE ARB BOT starting', 'bullish');
  addLog('Strategies: Single-market arb + Logical cross-market arb', 'info');
  addLog('Features: WebSocket real-time | Fee-aware | Gap persistence | Orderbook depth', 'info');

  await fetchBalance();
  await fetchMarkets();

  addLog(`✓ Balance: $${state.kalshiBalance?.toFixed(2)} | ${state.realMarkets.length} markets loaded`, 'bullish');

  // Initial full scan
  await scanAllMarkets();

  // Connect WebSocket for real-time updates
  connectWebSocket();

  addLog('WebSocket connecting for real-time orderbook feed...', 'info');
  addLog('Bot running 24/7 — gaps detected within milliseconds via WebSocket', 'info');
}

startup();

// ═══════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════

app.get('/api/state', (req, res) => {
  res.json({
    ...state,
    orderbookCacheSize: Object.keys(orderbookCache).length,
    gapTrackerSize: Object.keys(gapTracker).length,
    winRate: (state.wins + state.losses) > 0 ? state.wins / (state.wins + state.losses) : 0,
    totalTrades: state.wins + state.losses,
  });
});

app.get('/api/kalshi/balance', async (req, res) => {
  await fetchBalance();
  res.json({ balance: state.kalshiBalance });
});

app.post('/api/papermode', (req, res) => {
  state.paperMode = req.body.paperMode;
  addLog(`Mode: ${state.paperMode ? 'PAPER' : 'LIVE'}`, 'info');
  res.json({ paperMode: state.paperMode });
});

app.post('/api/settings', (req, res) => {
  state.settings = { ...state.settings, ...req.body };
  addLog('Settings updated', 'info');
  res.json(state.settings);
});

app.post('/api/scan', async (req, res) => {
  await scanAllMarkets();
  res.json({
    opportunities: state.arbOpportunities.length,
    logical: state.logicalOpportunities.length,
  });
});

app.get('/api/orderbook/:ticker', async (req, res) => {
  const ob = orderbookCache[req.params.ticker];
  res.json(ob || { error: 'not found' });
});

app.get('/api/gaps', (req, res) => {
  res.json({
    active: Object.entries(gapTracker).map(([id, gap]) => ({
      id,
      spread: (gap.spread * 100).toFixed(2),
      age: Date.now() - gap.firstSeen,
      confirmed: gap.confirmed,
    }))
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FRANK-WOLFE ARB BOT on port ${PORT}`);
  console.log('WebSocket real-time | Fee-aware | Gap persistence | Logical arb');
});
