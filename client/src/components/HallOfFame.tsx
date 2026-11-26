'use client';

import React, { useEffect, useState } from 'react';
import { HallOfFameData } from '@shared/types';
import { getServerUrl } from '@/lib/serverUrl';
import {
  Award,
  Coins,
  Crown,
  ExternalLink,
  Flame,
  History,
  RefreshCw,
  Skull,
  Trophy,
} from 'lucide-react';

export function HallOfFame() {
  const [data, setData] = useState<HallOfFameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getServerUrl()}/api/hall-of-fame`);
      if (!res.ok) throw new Error('Failed to load Hall of Fame');
      const json: HallOfFameData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch Hall of Fame');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-[#0e131f] p-12 text-center text-slate-400">
        <RefreshCw className="w-6 h-6 mx-auto mb-3 animate-spin text-emerald-400" />
        Loading verified on-chain Hall of Fame...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-rose-300 text-sm">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header & Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Crown className="w-6 h-6 text-amber-400" />
            All-Time Hall of Fame
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Every payout and bounty absorption recorded on-chain and audited by the game server.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Global Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-[#0e131f] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-emerald-400" /> Total Volume Staked
          </div>
          <div className="text-2xl font-black font-mono text-white mt-2">
            {data.stats.totalDepositsSol.toFixed(3)}{' '}
            <span className="text-xs text-emerald-400">SOL</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0e131f] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-cyan-400" /> Total Paid Out
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400 mt-2">
            {data.stats.totalPayoutsSol.toFixed(3)}{' '}
            <span className="text-xs text-cyan-300">SOL</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0e131f] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Skull className="w-3.5 h-3.5 text-rose-400" /> Total Absorptions
          </div>
          <div className="text-2xl font-black font-mono text-white mt-2">
            {data.stats.totalKills.toLocaleString()}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0e131f] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-400" /> Verified Cash-Outs
          </div>
          <div className="text-2xl font-black font-mono text-white mt-2">
            {data.stats.totalCashOuts.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Main Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Biggest Single Cash-Outs */}
        <div className="rounded-2xl border border-slate-800 bg-[#0e131f] p-5">
          <h3 className="text-sm font-black uppercase tracking-wider text-amber-400 flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4" /> Biggest Single Cash-Outs
          </h3>
          {data.topCashOuts.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              No completed on-chain cash-outs yet. Be the first legend on the board!
            </p>
          ) : (
            <div className="space-y-2">
              {data.topCashOuts.map((c, idx) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${
                        idx === 0
                          ? 'bg-amber-400/20 text-amber-300'
                          : idx === 1
                          ? 'bg-slate-300/20 text-slate-200'
                          : idx === 2
                          ? 'bg-orange-400/20 text-orange-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div>
                      <div className="text-sm font-mono font-bold text-white">
                        {c.walletShort}
                      </div>
                      <div className="text-[11px] text-slate-500 uppercase">
                        {c.lobbyTier} arena • {new Date(c.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-black text-emerald-400 text-sm">
                      {c.netSol.toFixed(4)} SOL
                    </span>
                    {c.explorerUrl && (
                      <a
                        href={c.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Verify on Solana Explorer"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Bounty Hunters */}
        <div className="rounded-2xl border border-slate-800 bg-[#0e131f] p-5">
          <h3 className="text-sm font-black uppercase tracking-wider text-rose-400 flex items-center gap-2 mb-4">
            <Flame className="w-4 h-4" /> Top Bounty Hunters
          </h3>
          {data.topHunters.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              No real-SOL absorptions recorded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {data.topHunters.map((h, idx) => (
                <div
                  key={`${h.walletShort}_${idx}`}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-black text-slate-300">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="text-sm font-bold text-white">{h.username}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {h.walletShort} • {h.kills} {h.kills === 1 ? 'kill' : 'kills'}
                      </div>
                    </div>
                  </div>
                  <div className="font-mono font-black text-emerald-400 text-sm">
                    +{h.totalBountySol.toFixed(4)} SOL
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Verified Payouts */}
      <div className="rounded-2xl border border-slate-800 bg-[#0e131f] p-5">
        <h3 className="text-sm font-black uppercase tracking-wider text-cyan-400 flex items-center gap-2 mb-4">
          <History className="w-4 h-4" /> Recent On-Chain Payouts
        </h3>
        {data.recentPayouts.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            Recent on-chain cash-out transactions will appear here live.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {data.recentPayouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-white">{p.walletShort}</span>
                  <span className="ml-2 text-slate-500 uppercase">{p.lobbyTier}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-emerald-400">
                    {p.netSol.toFixed(4)} SOL
                  </span>
                  {p.explorerUrl && (
                    <a
                      href={p.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1"
                    >
                      Tx <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
