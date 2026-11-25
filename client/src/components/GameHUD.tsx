'use client';

import React from 'react';
import { GameStateSnapshot, KillFeedEvent } from '@shared/types';
import { Socket } from 'socket.io-client';
import { Coins, Flame, LogOut, Trophy } from 'lucide-react';

interface GameHUDProps {
  snapshot: GameStateSnapshot | null;
  killFeed: KillFeedEvent[];
  socket: Socket;
}

export function GameHUD({ snapshot, killFeed, socket }: GameHUDProps) {
  const mySol = snapshot ? snapshot.myTotalLamports / 1_000_000_000 : 0;
  const myMass = snapshot?.myTotalMass ?? 0;
  const isCashingOut = snapshot?.isCashingOut ?? false;
  const progress = snapshot?.cashoutProgress ?? 0;

  const startCashOut = () => socket.emit('cashout:start');
  const cancelCashOut = () => socket.emit('cashout:cancel');

  const circumference = 2 * Math.PI * 24;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-6">
      {/* Top Row: Live SOL HUD + Kill Feed + Leaderboard */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left: Player Balance & Mass */}
        <div className="pointer-events-auto rounded-2xl bg-[#0b0f19]/85 backdrop-blur-md border border-slate-800 px-4 py-3 shadow-xl">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Live Bounty Balance
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400 flex items-center gap-2">
            <Coins className="w-5 h-5" />
            {mySol.toFixed(4)} SOL
          </div>
          <div className="text-xs text-slate-400 mt-0.5 font-mono">
            Mass: <span className="text-white font-bold">{myMass}</span> • Players:{' '}
            <span className="text-cyan-400 font-bold">{snapshot?.playerCount ?? 0}</span>
          </div>
        </div>

        {/* Top-Center: Kill Feed Toasts */}
        <div className="hidden md:flex flex-col items-center gap-1.5">
          {killFeed.slice(0, 4).map((k) => (
            <div
              key={k.id}
              className="px-3.5 py-1.5 rounded-full bg-[#0b0f19]/85 backdrop-blur-md border border-slate-800 text-xs flex items-center gap-1.5 shadow-lg"
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold text-white">{k.killerName}</span>
              <span className="text-slate-400">absorbed</span>
              <span className="font-bold text-rose-400">{k.victimName}</span>
              <span className="font-mono font-bold text-emerald-400">
                (+{k.bountySol.toFixed(3)} SOL)
              </span>
            </div>
          ))}
        </div>

        {/* Top-Right: Live Leaderboard */}
        <div className="w-56 rounded-2xl bg-[#0b0f19]/85 backdrop-blur-md border border-slate-800 p-3.5 shadow-xl">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
            <Trophy className="w-3.5 h-3.5" /> Leaderboard
          </div>
          <div className="space-y-1">
            {(snapshot?.leaderboard ?? []).slice(0, 6).map((entry, idx) => (
              <div
                key={entry.playerId}
                className="flex items-center justify-between text-xs"
              >
                <span className="truncate max-w-[115px] text-slate-200 font-medium">
                  {idx + 1}. {entry.username}
                </span>
                <span className="font-mono font-bold text-emerald-400">
                  {(entry.totalLamports / 1_000_000_000).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Controls Hint + Hold-to-Cash-Out Button with Radial Progress */}
      <div className="flex items-end justify-between">
        <div className="hidden sm:block rounded-xl bg-[#0b0f19]/80 backdrop-blur-md border border-slate-800 px-3.5 py-2 text-[11px] text-slate-400">
          <span className="text-cyan-400 font-bold">SPACE</span> Split &nbsp;•&nbsp;{' '}
          <span className="text-cyan-400 font-bold">W</span> Eject &nbsp;•&nbsp;{' '}
          <span className="text-amber-400 font-bold">HOLD C</span> Cash Out (5s)
        </div>

        <button
          onMouseDown={startCashOut}
          onMouseUp={cancelCashOut}
          onMouseLeave={cancelCashOut}
          onTouchStart={startCashOut}
          onTouchEnd={cancelCashOut}
          className={`pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-2xl border font-black text-sm tracking-wide shadow-2xl transition-all ${
            isCashingOut
              ? 'bg-amber-500/20 border-amber-400 text-amber-300 scale-105'
              : 'bg-[#0b0f19]/90 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10'
          }`}
        >
          <div className="relative w-12 h-12 flex items-center justify-center">
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 56 56">
              <circle
                cx="28"
                cy="28"
                r="24"
                stroke="rgba(148,163,184,0.2)"
                strokeWidth="4"
                fill="none"
              />
              <circle
                cx="28"
                cy="28"
                r="24"
                stroke={isCashingOut ? '#fbbf24' : '#10b981'}
                strokeWidth="4"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <LogOut className="w-4 h-4 absolute" />
          </div>
          <div className="text-left">
            <div>{isCashingOut ? 'CHANNELING...' : 'HOLD TO CASH OUT'}</div>
            <div className="text-[11px] font-mono font-normal text-slate-400">
              {isCashingOut
                ? `${Math.max(0, 5 - progress * 5).toFixed(1)}s remaining`
                : 'Hold C or button (5s)'}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
