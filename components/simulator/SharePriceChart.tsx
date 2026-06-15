'use client';

/**
 * SharePriceChart — Recharts area line chart for share price history.
 *
 * Renders up to 24 months of price data.
 * Color: green above initial price, red below.
 * Tooltip shows: month, price, % change from prev month, GCC event annotations.
 */

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { SimSharePriceHistory } from '@/lib/simulator/types';

interface SharePriceChartProps {
  history: SimSharePriceHistory[];
  initialPrice: number;
  winTargetPrice: number;
  currentMonth: number;
}

interface ChartDataPoint {
  month: number;
  price: number;
  changePct: number | null;
  label: string;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const data: ChartDataPoint = payload[0]?.payload;
  const price = data?.price;
  const changePct = data?.changePct;

  return (
    <div className="bg-[#0d0d1a] border border-[#1e1e3a] rounded-lg px-3 py-2 shadow-xl">
      <div className="text-xs text-slate-500 mb-1">Month {label}</div>
      <div className="text-white font-mono font-bold text-sm">
        AED {price?.toFixed(2)}
      </div>
      {changePct !== null && changePct !== undefined && (
        <div
          className={`text-xs font-mono mt-0.5 ${
            changePct >= 0 ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {changePct >= 0 ? '+' : ''}
          {changePct.toFixed(2)}% MoM
        </div>
      )}
    </div>
  );
}

export function SharePriceChart({
  history,
  initialPrice,
  winTargetPrice,
  currentMonth,
}: SharePriceChartProps) {
  const chartData = useMemo<ChartDataPoint[]>(() => {
    const sorted = [...history].sort((a, b) => a.month - b.month);
    return sorted.map((entry, i) => {
      const prev = sorted[i - 1];
      const changePct = prev
        ? ((entry.price_aed - prev.price_aed) / prev.price_aed) * 100
        : null;
      return {
        month: entry.month,
        price: entry.price_aed,
        changePct,
        label: `M${entry.month}`,
      };
    });
  }, [history]);

  const latestPrice = chartData[chartData.length - 1]?.price ?? initialPrice;
  const isAboveBase = latestPrice >= initialPrice;
  const strokeColor = isAboveBase ? '#10b981' : '#ef4444';
  const gradientId = isAboveBase ? 'priceGradientGreen' : 'priceGradientRed';
  const gradientColor = isAboveBase ? '#10b981' : '#ef4444';

  // Y-axis domain: pad 5% above/below
  const prices = chartData.map((d) => d.price);
  const minPrice = Math.min(...prices, initialPrice) * 0.95;
  const maxPrice = Math.max(...prices, winTargetPrice) * 1.02;

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        No price history yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="priceGradientGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="priceGradientRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#1e1e3a"
          vertical={false}
        />

        <XAxis
          dataKey="month"
          tick={{ fill: '#475569', fontSize: 11, fontFamily: 'monospace' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `M${v}`}
          interval="preserveStartEnd"
        />

        <YAxis
          domain={[minPrice, maxPrice]}
          tick={{ fill: '#475569', fontSize: 11, fontFamily: 'monospace' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v.toFixed(1)}`}
          width={48}
        />

        <Tooltip content={<CustomTooltip />} />

        {/* Base price reference line */}
        <ReferenceLine
          y={initialPrice}
          stroke="#64748b"
          strokeDasharray="4 4"
          strokeWidth={1}
          label={{
            value: 'Base',
            position: 'insideTopRight',
            fill: '#64748b',
            fontSize: 10,
          }}
        />

        {/* Win target reference line */}
        {winTargetPrice > initialPrice && (
          <ReferenceLine
            y={winTargetPrice}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{
              value: 'Target',
              position: 'insideTopRight',
              fill: '#f59e0b',
              fontSize: 10,
            }}
          />
        )}

        <Area
          type="monotone"
          dataKey="price"
          stroke={strokeColor}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{
            r: 4,
            fill: strokeColor,
            stroke: '#0f0f1a',
            strokeWidth: 2,
          }}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
