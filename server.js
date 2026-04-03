const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// ═══════════════════════════════════════════════════════════════
// YAHOO FINANCE — STOCK DATA
// ═══════════════════════════════════════════════════════════════

async function getStockQuote(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return {
      ticker: ticker.toUpperCase(),
      price: meta.regularMarketPrice,
      previousClose: meta.previousClose,
      change: meta.regularMarketPrice - meta.previousClose,
      changePct: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2),
      volume: meta.regularMarketVolume,
      marketCap: meta.marketCap,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      currency: meta.currency,
      exchangeName: meta.exchangeName,
    };
  } catch (e) {
    console.error(`Quote error for ${ticker}:`, e.message);
    return null;
  }
}

async function getStockSummary(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile,insiderHolders,recommendationTrend`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) return null;

    const fin = result.financialData || {};
    const stats = result.defaultKeyStatistics || {};
    const summary = result.summaryDetail || {};
    const profile = result.assetProfile || {};
    const reco = result.recommendationTrend?.trend?.[0] || {};

    return {
      ticker: ticker.toUpperCase(),
      name: profile.longName || ticker,
      sector: profile.sector,
      industry: profile.industry,
      description: profile.longBusinessSummary?.slice(0, 400),
      employees: profile.fullTimeEmployees,
      website: profile.website,
      country: profile.country,
      // Valuation
      peRatio: summary.trailingPE?.raw,
      forwardPE: summary.forwardPE?.raw,
      pegRatio: stats.pegRatio?.raw,
      priceToBook: stats.priceToBook?.raw,
      priceToSales: summary.priceToSalesTrailing12Months?.raw,
      enterpriseValue: stats.enterpriseValue?.fmt,
      evToEbitda: stats.enterpriseToEbitda?.raw,
      // Financials
      revenue: fin.totalRevenue?.fmt,
      revenueGrowth: fin.revenueGrowth?.raw ? (fin.revenueGrowth.raw * 100).toFixed(1) + '%' : null,
      grossMargin: fin.grossMargins?.raw ? (fin.grossMargins.raw * 100).toFixed(1) + '%' : null,
      operatingMargin: fin.operatingMargins?.raw ? (fin.operatingMargins.raw * 100).toFixed(1) + '%' : null,
      profitMargin: fin.profitMargins?.raw ? (fin.profitMargins.raw * 100).toFixed(1) + '%' : null,
      returnOnEquity: fin.returnOnEquity?.raw ? (fin.returnOnEquity.raw * 100).toFixed(1) + '%' : null,
      debtToEquity: fin.debtToEquity?.raw,
      freeCashFlow: fin.freeCashflow?.fmt,
      currentRatio: fin.currentRatio?.raw,
      // Recommendations
      analystCount: reco.period ? (reco.strongBuy + reco.buy + reco.hold + reco.sell + reco.strongSell) : null,
      strongBuy: reco.strongBuy,
      buy: reco.buy,
      hold: reco.hold,
      sell: reco.sell,
      targetPrice: fin.targetMeanPrice?.raw,
      targetUpside: fin.targetMeanPrice?.raw && summary.regularMarketPrice?.raw
        ? (((fin.targetMeanPrice.raw - summary.regularMarketPrice.raw) / summary.regularMarketPrice.raw) * 100).toFixed(1) + '%'
        : null,
      recommendation: fin.recommendationKey,
    };
  } catch (e) {
    console.error(`Summary error for ${ticker}:`, e.message);
    return null;
  }
}

async function getInsiderTransactions(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=insiderTransactions`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const data = await res.json();
    const transactions = data?.quoteSummary?.result?.[0]?.insiderTransactions?.transactions || [];
    return transactions.slice(0, 10).map(t => ({
      name: t.filerName,
      relation: t.filerRelation,
      shares: t.shares?.fmt,
      value: t.value?.fmt,
      transactionType: t.transactionText,
      date: t.startDate?.fmt,
    }));
  } catch (e) {
    return null;
  }
}

async function getEarningsCalendar(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=calendarEvents,earnings`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.quoteSummary?.result?.[0];
    return {
      earningsDate: result?.calendarEvents?.earnings?.earningsDate?.[0]?.fmt,
      epsActual: result?.earnings?.earningsChart?.quarterly?.slice(-4).map(q => ({
        quarter: q.date,
        actual: q.actual?.raw,
        estimate: q.estimate?.raw,
        surprise: q.actual?.raw && q.estimate?.raw ? ((q.actual.raw - q.estimate.raw) / Math.abs(q.estimate.raw) * 100).toFixed(1) + '%' : null,
      })),
    };
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// NEWS SEARCH — FINANCIAL NEWS
// ═══════════════════════════════════════════════════════════════

async function searchFinancialNews(query) {
  try {
    const encoded = encodeURIComponent(query + ' stock market financial');
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encoded}&newsCount=8&quotesCount=5`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.news || []).slice(0, 8).map(n => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      publishTime: new Date(n.providerPublishTime * 1000).toLocaleDateString(),
    }));
  } catch (e) {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// MARKET OVERVIEW
// ═══════════════════════════════════════════════════════════════

async function getMarketOverview() {
  const indices = ['^GSPC', '^DJI', '^IXIC', '^RUT', '^VIX', 'GC=F', 'CL=F', 'BTC-USD'];
  const labels = ['S&P 500', 'Dow Jones', 'Nasdaq', 'Russell 2000', 'VIX', 'Gold', 'Oil (WTI)', 'Bitcoin'];
  const results = await Promise.all(indices.map(getStockQuote));
  return results.map((r, i) => ({
    name: labels[i],
    ticker: indices[i],
    price: r?.price,
    change: r?.change,
    changePct: r?.changePct,
  })).filter(r => r.price);
}

// ═══════════════════════════════════════════════════════════════
// STOCK SCREENER — Multiple tickers at once
// ═══════════════════════════════════════════════════════════════

async function screenStocks(tickers) {
  const results = await Promise.all(tickers.map(async (ticker) => {
    const [quote, summary] = await Promise.all([
      getStockQuote(ticker),
      getStockSummary(ticker),
    ]);
    return { ...quote, ...summary };
  }));
  return results.filter(r => r.price);
}

// ═══════════════════════════════════════════════════════════════
// CLAUDE AI BRAIN
// Uses web search + financial data to answer questions
// ═══════════════════════════════════════════════════════════════

async function askClaude(userMessage, conversationHistory, marketContext) {
  try {
    const systemPrompt = `You are ATLAS — an elite financial markets analyst and research assistant. You have deep expertise in:
- Equity analysis (fundamental, technical, quantitative)
- Macro economics and Fed policy
- Sector analysis (energy, nuclear, defense, tech, healthcare, financials)
- Fixed income and credit markets (especially relevant given the user's private credit/CLO background)
- Alternative investments and prediction markets

USER CONTEXT:
- Name: Liam, 25, NYC
- Background: KPMG Audit Associate, audited Eagle Point Credit Management (CLO equity/debt), large bank M&A
- Education: Bachelor's + Master's in Accounting, CPA in progress (FAR, Audit, REG remaining)
- Investment style: Conviction-based, research-driven, looking for asymmetric opportunities not priced in
- Interests: Macro, geopolitics, energy/nuclear, small-cap, private credit

YOUR CAPABILITIES:
You have access to real-time financial data tools. When the user asks about specific stocks, sectors, or market conditions, the system automatically fetches live data which is provided to you in the context.

YOUR APPROACH:
- Be direct and specific — no hedging with "it's hard to say" or "it depends"
- Give your actual analytical opinion with clear reasoning
- Use your knowledge of Liam's background to tailor answers — e.g. connect CLO/credit analysis to equity questions
- Flag risks honestly but don't bury the insight in disclaimers
- Think like a sell-side analyst writing a research note, but without the legalese
- When analyzing stocks, use the financial data provided — don't make up numbers
- For macro questions, synthesize multiple factors into a clear view

CURRENT MARKET CONTEXT:
${marketContext}

FORMATTING:
- Use clean markdown — headers, bullet points, bold for key numbers
- Keep responses focused and actionable
- For stock analysis, always include: thesis, key metrics, risks, bottom line
- Never start with "Certainly!" or "Great question!" — just answer directly`;

    const messages = [
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await response.json();
    return data.content?.[0]?.text || 'Error generating response';
  } catch (e) {
    console.error('Claude error:', e.message);
    return 'Error connecting to AI — please try again';
  }
}

// ═══════════════════════════════════════════════════════════════
// SMART QUERY PARSER
// Detects tickers and intent from user messages
// ═══════════════════════════════════════════════════════════════

function extractTickers(message) {
  // Match common ticker patterns — 1-5 uppercase letters
  const tickerPattern = /\b([A-Z]{1,5})\b/g;
  const commonWords = new Set(['I', 'A', 'AN', 'THE', 'AND', 'OR', 'FOR', 'IN', 'ON', 'AT', 'TO', 'OF', 'IS', 'IT', 'BE', 'AS', 'BY', 'VS', 'ETF', 'IPO', 'CEO', 'CFO', 'EPS', 'PE', 'AI', 'ML', 'US', 'UK', 'EU', 'FED', 'GDP', 'CPI', 'SEC', 'CLO', 'CPA', 'NYC', 'NY', 'IF', 'MY', 'DO', 'GO', 'UP', 'YOY', 'QOQ', 'TTM', 'ATH', 'DD', 'TA', 'FA']);
  const tickers = [];
  let match;
  while ((match = tickerPattern.exec(message)) !== null) {
    const word = match[1];
    if (!commonWords.has(word) && word.length >= 2) {
      tickers.push(word);
    }
  }
  return [...new Set(tickers)].slice(0, 5);
}

function detectIntent(message) {
  const msg = message.toLowerCase();
  if (msg.includes('insider') || msg.includes('buying') || msg.includes('selling')) return 'insider';
  if (msg.includes('compare') || msg.includes('vs ') || msg.includes('versus')) return 'compare';
  if (msg.includes('screen') || msg.includes('find me') || msg.includes('list') || msg.includes('stocks with')) return 'screen';
  if (msg.includes('news') || msg.includes('latest') || msg.includes('recent') || msg.includes('happened')) return 'news';
  if (msg.includes('market') || msg.includes('s&p') || msg.includes('dow') || msg.includes('nasdaq') || msg.includes('overview')) return 'market';
  if (msg.includes('earnings') || msg.includes('eps') || msg.includes('beat') || msg.includes('miss')) return 'earnings';
  return 'analysis';
}

// ═══════════════════════════════════════════════════════════════
// MAIN CHAT ENDPOINT
// ═══════════════════════════════════════════════════════════════

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const intent = detectIntent(message);
    const tickers = extractTickers(message);

    let financialContext = '';
    let marketData = {};

    // Fetch relevant data based on intent
    if (intent === 'market' || message.toLowerCase().includes('market')) {
      const overview = await getMarketOverview();
      marketData.overview = overview;
      financialContext += `\n\nLIVE MARKET DATA:\n${overview.map(m => `${m.name}: ${m.price?.toFixed(2)} (${m.changePct > 0 ? '+' : ''}${m.changePct}%)`).join('\n')}`;
    }

    if (tickers.length > 0) {
      // Fetch data for mentioned tickers
      const stockData = await Promise.all(tickers.map(async (ticker) => {
        const [quote, summary, insider, earnings] = await Promise.all([
          getStockQuote(ticker),
          getStockSummary(ticker),
          intent === 'insider' ? getInsiderTransactions(ticker) : Promise.resolve(null),
          intent === 'earnings' ? getEarningsCalendar(ticker) : Promise.resolve(null),
        ]);
        return { ticker, quote, summary, insider, earnings };
      }));

      marketData.stocks = stockData;

      stockData.forEach(({ ticker, quote, summary, insider, earnings }) => {
        if (!quote && !summary) return;
        financialContext += `\n\n=== ${ticker} LIVE DATA ===`;
        if (quote) {
          financialContext += `\nPrice: $${quote.price} (${quote.changePct > 0 ? '+' : ''}${quote.changePct}%)`;
          financialContext += `\n52-week range: $${quote.fiftyTwoWeekLow} - $${quote.fiftyTwoWeekHigh}`;
          if (quote.marketCap) financialContext += `\nMarket Cap: $${(quote.marketCap / 1e9).toFixed(2)}B`;
        }
        if (summary) {
          if (summary.name) financialContext += `\nCompany: ${summary.name}`;
          if (summary.sector) financialContext += `\nSector: ${summary.sector} | Industry: ${summary.industry}`;
          if (summary.peRatio) financialContext += `\nP/E: ${summary.peRatio?.toFixed(1)} | Forward P/E: ${summary.forwardPE?.toFixed(1)}`;
          if (summary.pegRatio) financialContext += `\nPEG: ${summary.pegRatio?.toFixed(2)}`;
          if (summary.revenueGrowth) financialContext += `\nRevenue Growth: ${summary.revenueGrowth}`;
          if (summary.grossMargin) financialContext += `\nGross Margin: ${summary.grossMargin} | Operating Margin: ${summary.operatingMargin}`;
          if (summary.debtToEquity) financialContext += `\nDebt/Equity: ${summary.debtToEquity?.toFixed(2)}`;
          if (summary.freeCashFlow) financialContext += `\nFree Cash Flow: ${summary.freeCashFlow}`;
          if (summary.returnOnEquity) financialContext += `\nROE: ${summary.returnOnEquity}`;
          if (summary.targetPrice) financialContext += `\nAnalyst Target: $${summary.targetPrice} (${summary.targetUpside} upside) | Consensus: ${summary.recommendation?.toUpperCase()}`;
          if (summary.description) financialContext += `\nBusiness: ${summary.description}`;
        }
        if (insider && insider.length > 0) {
          financialContext += `\n\nRECENT INSIDER TRANSACTIONS:`;
          insider.forEach(t => {
            financialContext += `\n- ${t.name} (${t.relation}): ${t.transactionType} ${t.shares} shares worth ${t.value} on ${t.date}`;
          });
        }
        if (earnings) {
          if (earnings.earningsDate) financialContext += `\nNext Earnings: ${earnings.earningsDate}`;
          if (earnings.epsActual) {
            financialContext += `\nRecent EPS History:`;
            earnings.epsActual.forEach(q => {
              financialContext += `\n  ${q.quarter}: Actual ${q.actual} vs Est ${q.estimate} (${q.surprise || 'N/A'} surprise)`;
            });
          }
        }
      });
    }

    // Always get some news for the query
    const news = await searchFinancialNews(message);
    if (news.length > 0) {
      marketData.news = news;
      financialContext += `\n\nRELEVANT NEWS:\n${news.map(n => `- ${n.title} (${n.publisher}, ${n.publishTime})`).join('\n')}`;
    }

    // Build conversation history for Claude
    const claudeHistory = history.slice(-10).map(h => ({
      role: h.role,
      content: h.content,
    }));

    // Get Claude's analysis
    const response = await askClaude(message, claudeHistory, financialContext);

    res.json({
      response,
      marketData,
      tickers,
      intent,
    });

  } catch (e) {
    console.error('Chat error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// QUICK DATA ENDPOINTS
// ═══════════════════════════════════════════════════════════════

app.get('/api/market', async (req, res) => {
  const overview = await getMarketOverview();
  res.json(overview);
});

app.get('/api/quote/:ticker', async (req, res) => {
  const [quote, summary] = await Promise.all([
    getStockQuote(req.params.ticker),
    getStockSummary(req.params.ticker),
  ]);
  res.json({ ...quote, ...summary });
});

app.get('/api/insider/:ticker', async (req, res) => {
  const data = await getInsiderTransactions(req.params.ticker);
  res.json(data || []);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ATLAS Financial Agent running on port ${PORT}`);
});

