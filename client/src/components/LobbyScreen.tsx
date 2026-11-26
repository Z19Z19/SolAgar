'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  LOBBY_TIERS,
  LobbyStats,
  LobbyTierId,
  PLAYER_SKINS,
} from '@shared/types';
import { EscrowPublicInfo } from '@/lib/solanaDeposit';
import { getServerUrl } from '@/lib/serverUrl';
import {
  Coins,
  ExternalLink,
  Flame,
  ShieldAlert,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

interface LobbyScreenProps {
  lobbies: LobbyStats[];
  escrowInfo: EscrowPublicInfo | null;
  selectedLobby: LobbyTierId;
  onSelectLobby: (id: LobbyTierId) => void;
  username: string;
  onChangeUsername: (name: string) => void;
  skinId: string;
  onSelectSkin: (id: string) => void;
  onJoinArena: () => Promise<void>;
  isJoining: boolean;
  errorMsg: string | null;
}

export function LobbyScreen({
  lobbies,
  escrowInfo,
  selectedLobby,
  onSelectLobby,
  username,
  onChangeUsername,
  skinId,
  onSelectSkin,
  onJoinArena,
  isJoining,
  errorMsg,
}: LobbyScreenProps) {
  const { connected } = useWallet();
  const [showRules, setShowRules] = useState(false);

  const activeLobbyStats = lobbies.find((l) => l.id === selectedLobby);
  const activeTier = LOBBY_TIERS[selectedLobby];
  const network = escrowInfo?.network || 'devnet';

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-[#0b0f19]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap className="w-5 h-5 text-slate-950 fill-slate-950" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight bg-gradient-to-r from-emerald-400 via-cyan-300 to-purple-400 bg-clip-text text-transparent">
                SOLAGAR
              </span>
              <span className="ml-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {network}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {network === 'devnet' && (
              <a
                href="https://faucet.solana.com/"
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700/80 text-cyan-300 border border-slate-700 transition"
              >
                Devnet Faucet <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <WalletMultiButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Spawn & Lobby Selection */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-[#0e131f] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                  Eat Cells. Absorb <span className="text-emerald-400">SOL</span>.
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  Stake your buy-in, hunt rivals for their live bounty, and survive the 5s Cash-Out channel.
                </p>
              </div>
              <button
                onClick={() => setShowRules((v) => !v)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                {showRules ? 'Hide Rules' : 'How it Works'}
              </button>
            </div>

            {showRules && (
              <div className="mb-5 p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 space-y-1.5">
                <p><strong className="text-cyan-400">Move:</strong> Mouse cursor &nbsp;|&nbsp; <strong className="text-cyan-400">Split:</strong> Space &nbsp;|&nbsp; <strong className="text-cyan-400">Eject Mass:</strong> W</p>
                <p><strong className="text-emerald-400">Cash Out:</strong> Hold <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">C</kbd> or the Cash Out button for 5 seconds. You cannot split or eject while channeling.</p>
                <p><strong className="text-amber-400">Proportional Splits:</strong> Splitting divides your SOL bounty proportionally by mass. If one cell is eaten, only that cell&apos;s share is lost.</p>
              </div>
            )}

            {/* Lobby Tier Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {(Object.keys(LOBBY_TIERS) as LobbyTierId[]).map((id) => {
                const tier = LOBBY_TIERS[id];
                const stats = lobbies.find((l) => l.id === id);
                const isSelected = selectedLobby === id;
                return (
                  <button
                    key={id}
                    onClick={() => onSelectLobby(id)}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {tier.name}
                      </span>
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: tier.accentColor }}
                      />
                    </div>
                    <div className="text-2xl font-black text-white font-mono">
                      {tier.buyInSol} <span className="text-sm text-emerald-400">SOL</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-cyan-400" />
                        {stats?.playerCount ?? 0} live
                      </span>
                      <span className="font-mono text-emerald-400">
                        {(stats?.totalPotSol ?? 0).toFixed(2)} SOL pot
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Username & Skin */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Callsign
                </label>
                <input
                  type="text"
                  maxLength={16}
                  value={username}
                  onChange={(e) => onChangeUsername(e.target.value)}
                  placeholder="Enter nickname..."
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm font-semibold text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Cell Skin
                </label>
                <div className="flex items-center gap-2.5 py-1.5">
                  {PLAYER_SKINS.map((skin) => (
                    <button
                      key={skin.id}
                      type="button"
                      title={skin.name}
                      onClick={() => onSelectSkin(skin.id)}
                      className={`w-9 h-9 rounded-full border-2 transition-transform ${
                        skinId === skin.id ? 'scale-110 ring-2 ring-white/70' : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: skin.fill,
                        borderColor: skin.border,
                        boxShadow: skinId === skin.id ? `0 0 14px ${skin.glow}` : undefined,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Escrow Status / Errors */}
            {!escrowInfo && (
              <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Connecting to Game Server at <code>{getServerUrl()}</code>...
                </span>
              </div>
            )}

            {escrowInfo && !escrowInfo.configured && (
              <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Server Escrow Vault is not configured. Add <code>ESCROW_PRIVATE_KEY</code> and{' '}
                  <code>DEV_TREASURY_WALLET</code> in your Railway Variables tab (or <code>server/.env</code> locally).
                </span>
              </div>
            )}

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
                {errorMsg}
              </div>
            )}

            {/* Spawn CTA */}
            <button
              onClick={onJoinArena}
              disabled={!connected || isJoining || !escrowInfo?.configured}
              className="w-full py-4 rounded-xl font-black text-base tracking-wide bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 text-slate-950 shadow-xl shadow-emerald-500/20 hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              <Flame className="w-5 h-5" />
              {!connected
                ? 'CONNECT SOLANA WALLET TO PLAY'
                : isJoining
                ? 'SIGNING & VERIFYING ON SOLANA...'
                : `DEPOSIT ${activeTier.buyInSol} SOL & SPAWN`}
            </button>

            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
              <span>
                House Rake: {((escrowInfo?.rakeBps ?? 500) / 100).toFixed(1)}% ({escrowInfo?.rakeMode ?? 'entry'})
              </span>
              <span>15s Disconnect Protection • Server-Authoritative 30Hz</span>
            </div>
          </div>
        </div>

        {/* Right: Live Arena Leaderboard */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-slate-800 bg-[#0e131f] p-6 shadow-2xl h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold">
                  {activeTier.name} Leaderboard
                </h2>
              </div>
              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                <Coins className="w-3.5 h-3.5" />
                {(activeLobbyStats?.totalPotSol ?? 0).toFixed(3)} SOL
              </span>
            </div>

            {(!activeLobbyStats || activeLobbyStats.leaderboard.length === 0) ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-slate-500">
                <Sparkles className="w-8 h-8 mb-2 text-slate-600" />
                <p className="text-sm font-medium text-slate-400">Arena is empty</p>
                <p className="text-xs mt-1">Be the first shark to claim the center!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeLobbyStats.leaderboard.map((entry, idx) => (
                  <div
                    key={entry.playerId}
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
                        <div className="text-sm font-bold text-white flex items-center gap-1.5">
                          {entry.username}
                          {entry.isCashingOut && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                              CASHING OUT
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {entry.walletShort} • {entry.totalMass} mass
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-mono font-bold text-emerald-400">
                      {(entry.totalLamports / 1_000_000_000).toFixed(4)} SOL
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
