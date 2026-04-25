import React, { useState, useMemo } from 'react';
import { Search, TrendingUp, AlertCircle, DollarSign, Activity, ActivitySquare } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, LineChart, Line } from 'recharts';

type FinancialData = {
  ticker: string;
  date: string;
  revenue: number;
  cogs: number;
  inventory: number;
  accountsReceivable: number;
  accountsPayable: number;
  freeCashFlow?: number;
};

const formatCurrency = (value: number) => {
  const absVal = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absVal >= 1e9) return `${sign}$${(absVal / 1e9).toFixed(1)}B`;
  if (absVal >= 1e6) return `${sign}$${(absVal / 1e6).toFixed(1)}M`;
  if (absVal >= 1e3) return `${sign}$${(absVal / 1e3).toFixed(1)}K`;
  return `${sign}$${absVal.toLocaleString()}`;
};

export default function App() {
  const [ticker, setTicker] = useState('AAPL');
  const [data, setData] = useState<FinancialData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sliders for modifying days
  const [dsoAdjustment, setDsoAdjustment] = useState(0);
  const [dioAdjustment, setDioAdjustment] = useState(0);
  const [dpoAdjustment, setDpoAdjustment] = useState(0);

  const fetchData = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ticker.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/financials/${ticker.trim()}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Failed to fetch data');
      }
      setData(json);
      setDsoAdjustment(0);
      setDioAdjustment(0);
      setDpoAdjustment(0);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching data.');
    } finally {
      setIsLoading(false);
    }
  };

  const metrics = useMemo(() => {
    if (!data) return null;

    const baseDso = data.revenue ? (data.accountsReceivable / data.revenue) * 365 : 0;
    const baseDio = data.cogs ? (data.inventory / data.cogs) * 365 : 0;
    const baseDpo = data.cogs ? (data.accountsPayable / data.cogs) * 365 : 0;

    const currentDso = Math.max(0, baseDso + dsoAdjustment);
    const currentDio = Math.max(0, baseDio + dioAdjustment);
    const currentDpo = Math.max(0, baseDpo + dpoAdjustment);

    const baseCcc = baseDso + baseDio - baseDpo;
    const currentCcc = currentDso + currentDio - currentDpo;

    const dsoValuePerDay = data.revenue / 365;
    const dioValuePerDay = data.cogs / 365;
    const dpoValuePerDay = data.cogs / 365; // Standard proxy

    // Impact on Free Cash Flow (Positive means freeing up cash)
    // Less DSO/DIO = more cash. More DPO = more cash.
    const fcfImpact = 
      (-dsoAdjustment * dsoValuePerDay) + 
      (-dioAdjustment * dioValuePerDay) + 
      (dpoAdjustment * dpoValuePerDay);

    return {
      baseDso, baseDio, baseDpo, baseCcc,
      currentDso, currentDio, currentDpo, currentCcc,
      fcfImpact, dsoValuePerDay, dioValuePerDay, dpoValuePerDay
    };
  }, [data, dsoAdjustment, dioAdjustment, dpoAdjustment]);

  const sensitivityData = useMemo(() => {
    if (!metrics || !data) return [];
    
    // Ensure numbers for baseFCF and safety
    const baseFCF = typeof data.freeCashFlow === 'number' && data.freeCashFlow !== 0 
      ? data.freeCashFlow 
      : (data.revenue * 0.1); 
      
    const absFCF = Math.abs(baseFCF) || 1; // prevent divide by zero
    
    // Validate we have safe numbers
    const safeBaseDso = isNaN(metrics.baseDso) ? 0 : metrics.baseDso;
    const safeBaseDpo = isNaN(metrics.baseDpo) ? 0 : metrics.baseDpo;
    
    const maxDays = Math.min(365, Math.ceil(Math.max(safeBaseDso, safeBaseDpo) * 1.5) || 100);
    const sData = [];
    
    // We increment by 1 day to smooth the line
    for (let i = 0; i <= Math.max(120, maxDays); i += 1) {
      const dsoImpact = (safeBaseDso - i) * (metrics.dsoValuePerDay || 0);
      const dpoImpact = (i - safeBaseDpo) * (metrics.dpoValuePerDay || 0);
      sData.push({
        days: i,
        dsoImpactPct: Number(((dsoImpact / absFCF) * 100).toFixed(2)),
        dpoImpactPct: Number(((dpoImpact / absFCF) * 100).toFixed(2)),
        dsoImpactValue: dsoImpact,
        dpoImpactValue: dpoImpact,
      });
    }
    
    console.log("Sensitivity Data length:", sData.length);
    console.log("Sample Data:", sData[0]);
    return sData;
  }, [metrics, data]);

  const dioSensitivityData = useMemo(() => {
    if (!metrics || !data) return [];
    
    // Ensure numbers for baseFCF and safety
    const baseFCF = typeof data.freeCashFlow === 'number' && data.freeCashFlow !== 0 
      ? data.freeCashFlow 
      : (data.revenue * 0.1); 
      
    const absFCF = Math.abs(baseFCF) || 1; // prevent divide by zero
    
    const safeBaseDio = isNaN(metrics.baseDio) ? 0 : metrics.baseDio;
    const maxDays = Math.min(365, Math.ceil(safeBaseDio * 1.5) || 100);
    const sData = [];
    
    for (let i = 0; i <= Math.max(120, maxDays); i += 1) {
      const dioImpact = (safeBaseDio - i) * (metrics.dioValuePerDay || 0);
      sData.push({
        days: i,
        dioImpactPct: Number(((dioImpact / absFCF) * 100).toFixed(2)),
        dioImpactValue: dioImpact,
      });
    }
    return sData;
  }, [metrics, data]);

  const CustomLineTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-lg text-sm font-sans">
          <p className="font-bold text-slate-800 mb-2 border-b border-slate-100 pb-2">{label} Days</p>
          {payload.map((entry: any, index: number) => {
            let value = 0;
            if (entry.dataKey === 'dsoImpactPct') value = entry.payload.dsoImpactValue;
            else if (entry.dataKey === 'dpoImpactPct') value = entry.payload.dpoImpactValue;
            else if (entry.dataKey === 'dioImpactPct') value = entry.payload.dioImpactValue;
            
            return (
              <div key={index} className="flex items-center justify-between gap-4 py-0.5">
                <span className="font-semibold" style={{ color: entry.color }}>
                  {entry.name}:
                </span>
                <span className="font-mono font-medium text-slate-700">
                  {value > 0 ? '+' : ''}{formatCurrency(value)}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  const handleSensitivityChartClick = (e: any) => {
    if (e && e.activeLabel !== undefined && metrics) {
      const clickedDays = e.activeLabel;
      const dsoDiff = Math.abs(clickedDays - metrics.currentDso);
      const dpoDiff = Math.abs(clickedDays - metrics.currentDpo);
      
      if (dsoDiff < dpoDiff) {
        setDsoAdjustment(clickedDays - metrics.baseDso);
      } else {
        setDpoAdjustment(clickedDays - metrics.baseDpo);
      }
    }
  };

  const handleDioSensitivityChartClick = (e: any) => {
    if (e && e.activeLabel !== undefined && metrics) {
      const clickedDays = e.activeLabel;
      setDioAdjustment(clickedDays - metrics.baseDio);
    }
  };

  const dioYDomain = useMemo(() => {
    if (!metrics || !data) return [-1000, 1000];
    const baseFCF = typeof data.freeCashFlow === 'number' && data.freeCashFlow !== 0 
      ? data.freeCashFlow 
      : (data.revenue * 0.1); 
    const absFCF = Math.abs(baseFCF) || 1;
    const maxImpactDollar = 60 * (metrics.dioValuePerDay || 0);
    const maxImpactPct = Math.ceil((Math.abs(maxImpactDollar) / absFCF) * 100);
    const finalMax = Math.max(10, Math.ceil(maxImpactPct * 1.2));
    return [-finalMax, finalMax];
  }, [metrics, data]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 p-4 sm:p-8 flex flex-col overflow-hidden">
      
      {/* Header Section */}
      <header className="flex flex-col sm:flex-row justify-between items-center mb-8 max-w-6xl mx-auto w-full gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Activity className="text-white w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 uppercase">
            CCC<span className="text-indigo-600 text-sm align-top ml-1">PRO</span>
          </h1>
        </div>

        <form onSubmit={fetchData} className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 cursor-pointer" />
          <input
            id="ticker-search"
            name="ticker"
            type="text"
            required
            className="w-full pl-10 pr-24 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium uppercase text-sm"
            placeholder="e.g. AAPL"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="absolute right-1 top-1 bottom-1 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Analyzing' : 'Analyze'}
          </button>
        </form>
      </header>

      <div className="w-full max-w-6xl mx-auto flex-grow flex flex-col">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm flex items-start shadow-sm border border-red-200">
             <AlertCircle className="h-5 w-5 mr-3 shrink-0" />
             <div className="text-left font-mono">{error}</div>
          </div>
        )}

        {data && metrics && (
          <div className="flex flex-col gap-6 flex-grow pb-12 sm:pb-0">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Main Calculator Card */}
              <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-6">
                  <div>
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Current Assessment</h2>
                    <h3 className="text-3xl font-bold tracking-tight text-slate-800">Cash Conversion Cycle</h3>
                    <p className="text-sm font-medium text-slate-500 mt-1">{data.ticker} - FY {data.date.substring(0, 4)}</p>
                  </div>
                  <div className="text-left sm:text-right mt-4 sm:mt-0">
                    <span className="text-5xl font-black text-indigo-600 tracking-tighter">{metrics.currentCcc.toFixed(1)}</span>
                    <span className="text-slate-500 font-bold ml-1 uppercase text-sm">Days</span>
                    {metrics.fcfImpact !== 0 && (
                      <div className={`text-sm font-bold mt-1 ${metrics.fcfImpact > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        FCF: {metrics.fcfImpact > 0 ? '+' : ''}{formatCurrency(metrics.fcfImpact)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-auto">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
                    <p className="text-xs font-semibold text-slate-500 mb-2">Inventory (DIO)</p>
                    <div className="flex justify-between items-end">
                      <span className="text-2xl font-bold text-slate-800">{metrics.currentDio.toFixed(1)}</span>
                      {dioAdjustment !== 0 && <span className="text-xs font-medium text-indigo-500 mb-1">{dioAdjustment > 0 ? '+' : ''}{dioAdjustment} days</span>}
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full mt-4 overflow-hidden">
                      <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${Math.min(100, (metrics.currentDio / 300) * 100)}%` }}></div>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
                    <p className="text-xs font-semibold text-slate-500 mb-2">Receivables (DSO)</p>
                    <div className="flex justify-between items-end">
                      <span className="text-2xl font-bold text-slate-800">{metrics.currentDso.toFixed(1)}</span>
                      {dsoAdjustment !== 0 && <span className="text-xs font-medium text-indigo-500 mb-1">{dsoAdjustment > 0 ? '+' : ''}{dsoAdjustment} days</span>}
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full mt-4 overflow-hidden">
                      <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${Math.min(100, (metrics.currentDso / 300) * 100)}%` }}></div>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
                    <p className="text-xs font-semibold text-slate-500 mb-2">Payables (DPO)</p>
                    <div className="flex justify-between items-end">
                      <span className="text-2xl font-bold text-slate-800">{metrics.currentDpo.toFixed(1)}</span>
                      {dpoAdjustment !== 0 && <span className="text-xs font-medium text-indigo-500 mb-1">{dpoAdjustment > 0 ? '+' : ''}{dpoAdjustment} days</span>}
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full mt-4 overflow-hidden">
                      <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${Math.min(100, (metrics.currentDpo / 300) * 100)}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sensitivity Sliders Card */}
              <div className="lg:col-span-4 bg-indigo-900 rounded-3xl p-6 text-white shadow-xl flex flex-col">
                <h3 className="text-lg font-bold mb-6">Scenario Modeling</h3>
                <div className="space-y-6 flex-grow">
                  <div>
                    <div className="flex justify-between text-xs mb-3">
                      <span className="opacity-70 uppercase tracking-wider font-semibold">Inventory Offset</span>
                      <span className="font-mono bg-indigo-800 px-2 py-0.5 rounded text-indigo-200">{dioAdjustment > 0 ? '+' : ''}{dioAdjustment} days</span>
                    </div>
                    <input 
                      type="range" 
                      min="-30" max="30" step="1"
                      value={dioAdjustment}
                      onChange={(e) => setDioAdjustment(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-indigo-700 rounded-lg appearance-none cursor-pointer accent-indigo-300"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-3">
                      <span className="opacity-70 uppercase tracking-wider font-semibold">Receivable Col.</span>
                      <span className="font-mono bg-indigo-800 px-2 py-0.5 rounded text-indigo-200">{dsoAdjustment > 0 ? '+' : ''}{dsoAdjustment} days</span>
                    </div>
                    <input 
                      type="range" 
                      min="-30" max="30" step="1"
                      value={dsoAdjustment}
                      onChange={(e) => setDsoAdjustment(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-indigo-700 rounded-lg appearance-none cursor-pointer accent-indigo-300"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-3">
                      <span className="opacity-70 uppercase tracking-wider font-semibold">Payable Delay</span>
                      <span className="font-mono bg-indigo-800 px-2 py-0.5 rounded text-indigo-200">{dpoAdjustment > 0 ? '+' : ''}{dpoAdjustment} days</span>
                    </div>
                    <input 
                      type="range" 
                      min="-30" max="30" step="1"
                      value={dpoAdjustment}
                      onChange={(e) => setDpoAdjustment(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-indigo-700 rounded-lg appearance-none cursor-pointer accent-indigo-300"
                    />
                  </div>
                </div>
                <div className="mt-8 pt-6 border-t border-indigo-800">
                  <p className="text-xs opacity-60 italic leading-relaxed">Adjust sliders to see the immediate impact on the operational liquidity cycle.</p>
                </div>
              </div>
            </div>

            {/* Sensitivity Analysis Graph */}
            {sensitivityData.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col shadow-sm h-[450px]">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h3 className="font-bold text-slate-800">Receivables & Payables Impact (FCF)</h3>
                      <p className="text-sm text-slate-500 mt-1">Click on the chart to adjust scenarios.</p>
                    </div>
                  </div>
                  <div className="flex-1 w-full h-full min-h-[300px] cursor-crosshair">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart 
                        data={sensitivityData} 
                        margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
                        onClick={handleSensitivityChartClick}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis 
                          dataKey="days" 
                          type="number"
                          domain={['dataMin', 'dataMax']}
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fill: '#94a3b8', fontSize: 13, fontWeight: 600}} 
                          dy={10} 
                          label={{ value: 'Absolute Days', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                        />
                        <YAxis 
                          domain={[-1000, 1000]}
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fill: '#94a3b8', fontSize: 13, fontWeight: 500}} 
                          tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}%`}
                          label={{ value: '% Change FCF', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12, fontWeight: 600, dy: 50 }}
                        />
                        <Tooltip content={<CustomLineTooltip />} shared={false} />
                        <Legend wrapperStyle={{fontSize: '12px', color: '#64748b', paddingTop: '20px', fontWeight: 500}} />
                        <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={2} />
                        
                        <Line 
                          type="monotone" 
                          dataKey="dsoImpactPct" 
                          name="DSO Impact" 
                          stroke="#1e293b" 
                          strokeWidth={3} 
                          dot={false}
                          activeDot={{ r: 6, fill: "#1e293b", stroke: "white", strokeWidth: 2 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="dpoImpactPct" 
                          name="DPO Impact" 
                          stroke="#94a3b8" 
                          strokeWidth={3} 
                          dot={false}
                          activeDot={{ r: 6, fill: "#94a3b8", stroke: "white", strokeWidth: 2 }}
                        />
                        
                        <ReferenceLine 
                          x={metrics.currentDso} 
                          stroke="#1e293b" 
                          strokeWidth={2}
                          strokeDasharray="4 4"
                        />
                        <ReferenceLine 
                          x={metrics.currentDpo} 
                          stroke="#94a3b8" 
                          strokeWidth={2}
                          strokeDasharray="4 4"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {dioSensitivityData.length > 0 && (
                  <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col shadow-sm h-[450px]">
                    <div className="flex justify-between items-center mb-6">
                      <div>
                        <h3 className="font-bold text-slate-800">Inventory Impact (FCF)</h3>
                        <p className="text-sm text-slate-500 mt-1">Impact of changing DIO. Click chart to adjust.</p>
                      </div>
                    </div>
                    <div className="flex-1 w-full h-full min-h-[300px] cursor-crosshair">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart 
                          data={dioSensitivityData} 
                          margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
                          onClick={handleDioSensitivityChartClick}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis 
                            dataKey="days" 
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fill: '#94a3b8', fontSize: 13, fontWeight: 600}} 
                            dy={10} 
                            label={{ value: 'Absolute Days', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                          />
                          <YAxis 
                            domain={dioYDomain}
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fill: '#94a3b8', fontSize: 13, fontWeight: 500}} 
                            tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}%`}
                            label={{ value: '% Change FCF', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12, fontWeight: 600, dy: 50 }}
                          />
                          <Tooltip content={<CustomLineTooltip />} shared={false} />
                          <Legend wrapperStyle={{fontSize: '12px', color: '#64748b', paddingTop: '20px', fontWeight: 500}} />
                          <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={2} />
                          
                          <Line 
                            type="monotone" 
                            dataKey="dioImpactPct" 
                            name="DIO Impact (Inventory)" 
                            stroke="#4f46e5" 
                            strokeWidth={3} 
                            dot={false}
                            activeDot={{ r: 6, fill: "#4f46e5", stroke: "white", strokeWidth: 2 }}
                          />
                          
                          <ReferenceLine 
                            x={metrics.currentDio} 
                            stroke="#4f46e5" 
                            strokeWidth={2}
                            strokeDasharray="4 4"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
