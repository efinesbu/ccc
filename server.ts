import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import yf from 'yahoo-finance2';

async function startServer() {
  const app = express();
  const PORT = 3000;
  const yahooFinance = new yf();

  app.use(express.json());

  // API Route to fetch financial data
  app.get('/api/financials/:ticker', async (req, res) => {
    const { ticker } = req.params;

    try {
      // Use fundamentalsTimeSeries which works without auth and provides quarterly/annual data
      // 'all' module returns all available metrics.
      // period1 is required by yahoo-finance2 fundamentalsTimeSeries
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const data = await yahooFinance.fundamentalsTimeSeries(ticker, { 
        module: 'all', 
        type: 'quarterly',
        period1: oneYearAgo.toISOString().split('T')[0]
      });
      
      if (!data || data.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Could not find financial data for ticker: ${ticker.toUpperCase()}. Make sure the ticker is valid.`
        });
      }

      // Yahoo Finance data comes with the latest date last usually, or first. Let's find the latest valid entry.
      // Sort by date descending
      const sortedData = data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      const latest = sortedData[0];

      if (!latest) {
         return res.status(404).json({
          error: 'Data Not Available',
          message: `Financial metrics are not available for ${ticker.toUpperCase()} at this time.`
        });
      }

      // Map Yahoo Finance fundamentals to our metrics
      // Note: the metric keys on yahoo-finance return camelCase keys like accountsReceivable, accountsPayable.
      const rawLatest: any = latest;
      const revenue = rawLatest.totalRevenue || rawLatest.operatingRevenue || 0;
      const cogs = rawLatest.costOfRevenue || rawLatest.reconciledCostOfRevenue || 0;
      const inventory = rawLatest.inventory || 0;
      const accountsReceivable = rawLatest.accountsReceivable || rawLatest.receivables || 0;
      const accountsPayable = rawLatest.accountsPayable || rawLatest.payables || 0;
      const freeCashFlow = rawLatest.freeCashFlow || rawLatest.operatingCashFlow || (revenue * 0.1);

      if (revenue === 0) {
         return res.status(400).json({
           error: 'Insufficient Data',
           message: `Incomplete financial statements for ${ticker.toUpperCase()}. Missing revenue data.`
         });
      }

      res.json({
        ticker: ticker.toUpperCase(),
        date: new Date(latest.date).toISOString(),
        revenue,
        cogs, 
        inventory,
        accountsReceivable,
        accountsPayable,
        freeCashFlow,
      });

    } catch (err: any) {
      console.error('Yahoo Finance Error:', err);
      
      // Handle known Yahoo Finance errors
      if (err.name === 'FailedYahooValidationError' || err.message.includes('Invalid')) {
        return res.status(400).json({ error: 'Invalid Request', message: `Invalid ticker or request parameters for ${ticker}.` });
      }

      if (err.message && err.message.includes('Rate limit')) {
        return res.status(429).json({ error: 'Rate Limit', message: 'API rate limit exceeded. Please try again later.' });
      }

      res.status(500).json({ error: 'Server Error', message: err.message || 'Failed to fetch financial data.' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
