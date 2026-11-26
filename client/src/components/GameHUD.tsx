'use client';

import React from 'react';
import { GameStateSnapshot, KillFeedEvent } from '@shared/types';
import { Socket } from 'socket.io-client';
import { Coins, Flame, LogOut, Radio, Trophy, Zap } from 'lucide-react';

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
  const isPractice = snapshot?.isPractice ?? false;
  const speedBoostMs = snapshot?.speedBoostRemainingMs ?? 0;
  const minimap = snapshot?.minimap ?? [];
  const canCashOut = isPractice || mySol > 0;

  const enemyCashOuts = minimap.filter((m) => m.isCashingOut && !m.isMe);

  const startCashOut = () => {
    if (!canCashOut) return;
    socket.emit('cashout:start');
  };
  const cancelCashOut = () => socket.emit('cashout:cancel');

  const circumference = 2 * Math.PI * 24;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-6">
      {/* Top Row: Live SOL HUD + Kill Feed + Leaderboard */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left: Player Balance, Mass & Active Speed Boost */}
        <div className="flex flex-col gap-2">
          <div className="pointer-events-auto rounded-2xl bg-[#0b0f19]/85 backdrop-blur-md border border-slate-800 px-4 py-3 shadow-xl">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {isPractice ? 'Virtual Practice Bounty' : 'Live Bounty Balance'}
              </span>
              {isPractice && (
                <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  SANDBOX
                </span>
              )}
              {!isPractice && mySol === 0 && (
                <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  FREE TICKET
                </span>
              )}
            </div>
            <div className="text-2xl font-black font-mono text-emerald-400 flex items-center gap-2">
              <Coins className="w-5 h-5" />
              {mySol.toFixed(4)} {isPractice ? 'vSOL' : 'SOL'}
            </div>
            <div className="text-xs text-slate-400 mt-0.5 font-mono">
              Mass: <span className="text-white font-bold">{myMass}</span> • Players:{' '}
              <span className="text-cyan-400 font-bold">{snapshot?.playerCount ?? 0}</span>
            </div>
          </div>

          {speedBoostMs > 0 && (
            <div className="rounded-xl bg-sky-500/20 backdrop-blur-md border border-sky-400/60 px-3.5 py-2 text-xs font-black text-sky-300 flex items-center gap-2 shadow-lg animate-pulse">
              <Zap className="w-4 h-4 text-sky-300 fill-sky-300" />
              SPEED BOOST +25% ({(speedBoostMs / 1000).toFixed(1)}s)
            </div>
          )}
        </div>

        {/* Top-Center: Cash-Out Radar Alert + Kill Feed Toasts */}
        <div className="hidden md:flex flex-col items-center gap-1.5">
          {enemyCashOuts.length > 0 && (
            <div className="px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/60 text-amber-300 text-xs font-black tracking-wide flex items-center gap-2 shadow-lg animate-pulse">
              <Radio className="w-3.5 h-3.5 text-amber-400" />
              CASH-OUT ON RADAR: {enemyCashOuts[0].username} ({enemyCashOuts[0].solValue.toFixed(3)}{' '}
              {isPractice ? 'vSOL' : 'SOL'})
            </div>
          )}
          {killFeed.slice(0, 4).map((k) => (
            <div
              key={k.id}
              className="px-3.5 py-1.5 rounded-full bg-[#0b0f19]/85 backdrop-blur-md border border-slate-800 text-xs flex items-center gap-1.5 shadow-lg"
            >
              {k.boostReward ? (
                <Zap className="w-3.5 h-3.5 text-sky-400 fill-sky-400" />
              ) : (
                <Flame className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span className="font-bold text-white">{k.killerName}</span>
              <span className="text-slate-400">absorbed</span>
              <span className="font-bold text-rose-400">{k.victimName}</span>
              {k.boostReward ? (
                <span className="font-mono font-bold text-sky-400">
                  (+25 MASS &amp; SPEED BOOST!)
                </span>
              ) : (
                <span className="font-mono font-bold text-emerald-400">
                  (+{k.bountySol.toFixed(3)} {isPractice ? 'vSOL' : 'SOL'})
                </span>
              )}
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
                <span className="truncate max-w-[115px] text-slate-200 font-medium flex items-center gap-1">
                  {idx + 1}. {entry.username}
                  {entry.isCashingOut && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                  )}
                </span>
                <span className="font-mono font-bold text-emerald-400">
                  {(entry.totalLamports / 1_000_000_000).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Minimap with Cash-Out Radar + Hold-to-Cash-Out Button */}
      <div className="flex items-end justify-between gap-4">
        {/* Bottom-Left: Minimap Radar + Controls */}
        <div className="flex flex-col gap-2">
          <div className="rounded-2xl bg-[#0b0f19]/85 backdrop-blur-md border border-slate-800 p-2.5 shadow-2xl w-40 sm:w-44">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 px-0.5">
              <span className="flex items-center gap-1">
                <Radio className="w-3 h-3 text-cyan-400" /> Radar
              </span>
              {enemyCashOuts.length > 0 ? (
                <span className="text-amber-400 animate-pulse">
                  {enemyCashOuts.length} EXITING
                </span>
              ) : (
                <span className="text-slate-500 font-mono">
                  {snapshot?.arenaSize ?? 4000}m
                </span>
              )}
            </div>

            {/* Square Radar Grid */}
            <div className="relative w-full aspect-square rounded-lg bg-[#05080f] border border-slate-800/90 overflow-hidden">
              {/* Crosshairs */}
              <div className="absolute inset-y-0 left-1/2 w-px bg-slate-800/60" />
              <div className="absolute inset-x-0 top-1/2 h-px bg-slate-800/60" />
              <div className="absolute inset-y-0 left-1/4 w-px bg-slate-800/30" />
              <div className="absolute inset-y-0 left-3/4 w-px bg-slate-800/30" />
              <div className="absolute inset-x-0 top-1/4 h-px bg-slate-800/30" />
              <div className="absolute inset-x-0 top-3/4 h-px bg-slate-800/30" />

              {minimap.map((dot) => {
                const left = `${dot.x * 100}%`;
                const top = `${dot.y * 100}%`;

                if (dot.isCashingOut) {
                  return (
                    <div
                      key={dot.id}
                      style={{ left, top }}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      title={`${dot.username} CASHING OUT (${dot.solValue.toFixed(3)} SOL)`}
                    >
                      <span className="absolute -inset-2 rounded-full bg-amber-400/50 animate-ping" />
                      <span className="relative block w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-200 shadow-lg shadow-amber-400/80" />
                    </div>
                  );
                }

                if (dot.isMe) {
                  return (
                    <div
                      key={dot.id}
                      style={{ left, top }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
                    >
                      <span className="block w-2.5 h-2.5 rounded-full bg-cyan-400 ring-2 ring-white shadow-lg shadow-cyan-400/70" />
                    </div>
                  );
                }

                if (dot.isLeader) {
                  return (
                    <div
                      key={dot.id}
                      style={{ left, top }}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                    >
                      <span className="block w-2 h-2 rounded-full bg-purple-400 ring-1 ring-purple-200" />
                    </div>
                  );
                }

                return (
                  <div
                    key={dot.id}
                    style={{ left, top }}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                  >
                    <span className="block w-1.5 h-1.5 rounded-full bg-slate-400/70" />
                  </div>
                );
              })}
            </div>

            {/* Radar Legend */}
            <div className="mt-1.5 flex items-center justify-between text-[9px] text-slate-400 px-0.5">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> You
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> #1
              </span>
              <span className="flex items-center gap-1 text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Cash-Out
              </span>
            </div>
          </div>

          <div className="hidden sm:block rounded-xl bg-[#0b0f19]/80 backdrop-blur-md border border-slate-800 px-3.5 py-2 text-[11px] text-slate-400">
            <span className="text-cyan-400 font-bold">SPACE</span> Split &nbsp;•&nbsp;{' '}
            <span className="text-cyan-400 font-bold">W</span> Eject &nbsp;•&nbsp;{' '}
            <span className="text-amber-400 font-bold">HOLD C</span> Cash Out (5s)
          </div>
        </div>

        {/* Bottom-Right: Hold-to-Cash-Out Button */}
        <button
          disabled={!canCashOut}
          onMouseDown={startCashOut}
          onMouseUp={cancelCashOut}
          onMouseLeave={cancelCashOut}
          onTouchStart={startCashOut}
          onTouchEnd={cancelCashOut}
          className={`pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-2xl border font-black text-sm tracking-wide shadow-2xl transition-all ${
            !canCashOut
              ? 'bg-[#0b0f19]/75 border-slate-700 text-slate-500 cursor-not-allowed opacity-70'
              : isCashingOut
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
                stroke={isCashingOut ? '#fbbf24' : canCashOut ? '#10b981' : '#475569'}
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
            <div>
              {!canCashOut
                ? 'STEAL SOL TO CASH OUT'
                : isCashingOut
                ? 'CHANNELING...'
                : isPractice
                ? 'EXIT SANDBOX'
                : 'HOLD TO CASH OUT'}
            </div>
            <div className="text-[11px] font-mono font-normal text-slate-400">
              {!canCashOut
                ? 'Absorb a SOL player first'
                : isCashingOut
                ? `${Math.max(0, 5 - progress * 5).toFixed(1)}s remaining`
                : 'Hold C or button (5s)'}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
