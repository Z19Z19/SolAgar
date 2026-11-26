'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  FreeTicketStatus,
  LOBBY_TIERS,
  LobbyStats,
  LobbyTierId,
  PLAYER_SKINS,
} from '@shared/types';
import { EscrowPublicInfo } from '@/lib/solanaDeposit';
import { getServerUrl } from '@/lib/serverUrl';
import { HallOfFame } from '@/components/HallOfFame';
import {
  Coins,
  Crown,
  ExternalLink,
  Flame,
  Gamepad2,
  ShieldAlert,
  Sparkles,
  Ticket,
  Trophy,
  Users,
} from 'lucide-react';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

interface LobbyScreenProps {
  lobbies: LobbyStats[];
  escrowInfo: EscrowPublicInfo | null;
  freeTicketStatus: FreeTicketStatus | null;
  selectedLobby: LobbyTierId;
  onSelectLobby: (id: LobbyTierId) => void;
  username: string;
  onChangeUsername: (name: string) => void;
  skinId: string;
  onSelectSkin: (id: string) => void;
  onJoinArena: () => Promise<void>;
  onClaimFreeMicro: () => Promise<void>;
  isJoining: boolean;
  errorMsg: string | null;
}

export function LobbyScreen({
  lobbies,
  escrowInfo,
  freeTicketStatus,
  selectedLobby,
  onSelectLobby,
  username,
  onChangeUsername,
  skinId,
  onSelectSkin,
  onJoinArena,
  onClaimFreeMicro,
  isJoining,
  errorMsg,
}: LobbyScreenProps) {
  const { connected } = useWallet();
  const [showRules, setShowRules] = useState(false);
  const [activeTab, setActiveTab] = useState<'play' | 'hall-of-fame'>('play');

  const activeLobbyStats = lobbies.find((l) => l.id === selectedLobby);
  const activeTier = LOBBY_TIERS[selectedLobby];
  const isPractice = Boolean(activeTier.isPractice);
  const network = escrowInfo?.network || 'devnet';

  const canJoin = isPractice
    ? Boolean(escrowInfo) && !isJoining
    : connected && !isJoining && Boolean(escrowInfo?.configured);

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-[#0b0f19]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="SolAgar Logo"
              className="w-10 h-10 rounded-xl object-cover border border-emerald-400/40 shadow-lg shadow-emerald-500/20"
            />
            <div>
              <span className="text-xl font-black tracking-tight bg-gradient-to-r from-emerald-400 via-cyan-300 to-purple-400 bg-clip-text text-transparent">
                SOLAGAR
              </span>
              <span className="ml-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {network}
              </span>
            </div>
          </div>

          {/* Center Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800">
            <button
              onClick={() => setActiveTab('play')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                activeTab === 'play'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5" /> Play Arenas
            </button>
            <button
              onClick={() => setActiveTab('hall-of-fame')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                activeTab === 'hall-of-fame'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Crown className="w-3.5 h-3.5" /> Hall of Fame
            </button>
          </nav>

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

        {/* Mobile Tab Switcher */}
        <div className="flex md:hidden border-t border-slate-800/80 px-4 py-2 gap-2">
          <button
            onClick={() => setActiveTab('play')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
              activeTab === 'play'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 bg-slate-900'
            }`}
          >
            <Gamepad2 className="w-3.5 h-3.5" /> Play Arenas
          </button>
          <button
            onClick={() => setActiveTab('hall-of-fame')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
              activeTab === 'hall-of-fame'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 bg-slate-900'
            }`}
          >
            <Crown className="w-3.5 h-3.5" /> Hall of Fame
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'hall-of-fame' ? (
          <HallOfFame />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Spawn & Lobby Selection */}
            <div className="lg:col-span-7 space-y-6">
              <div className="rounded-2xl border border-slate-800 bg-[#0e131f] p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                      Eat Cells. Absorb <span className="text-emerald-400">SOL</span>.
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                      Stake your buy-in, track exiting rivals on the Cash-Out Radar, and survive the 5s channel.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowRules((v) => !v)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition shrink-0"
                  >
                    {showRules ? 'Hide Rules' : 'How it Works'}
                  </button>
                </div>

                {showRules && (
                  <div className="mb-5 p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 space-y-1.5">
                    <p>
                      <strong className="text-cyan-400">Move:</strong> Mouse cursor &nbsp;|&nbsp;{' '}
                      <strong className="text-cyan-400">Split:</strong> Space &nbsp;|&nbsp;{' '}
                      <strong className="text-cyan-400">Eject Mass:</strong> W
                    </p>
                    <p>
                      <strong className="text-emerald-400">Cash Out &amp; Radar:</strong> Hold{' '}
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">C</kbd>{' '}
                      for 5 seconds. Anyone channeling Cash-Out pulses gold on every player&apos;s Minimap Radar!
                    </p>
                    <p>
                      <strong className="text-amber-400">Proportional Splits:</strong> Splitting divides your SOL bounty proportionally by mass. Split cells remerge cleanly once brought back together.
                    </p>
                  </div>
                )}

                {/* Lobby Tier Cards (Practice Sandbox + 3 Real SOL Tiers) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
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
                            ? tier.isPractice
                              ? 'border-sky-400 bg-sky-500/10 shadow-lg shadow-sky-500/10'
                              : 'border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                            : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            {tier.name}
                            {tier.isPractice && (
                              <span className="px-1.5 py-0.5 text-[9px] font-black rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                FREE + BOTS
                              </span>
                            )}
                          </span>
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: tier.accentColor }}
                          />
                        </div>
                        <div className="text-2xl font-black text-white font-mono">
                          {tier.isPractice ? (
                            <span className="text-sky-400">FREE</span>
                          ) : (
                            <>
                              {tier.buyInSol} <span className="text-sm text-emerald-400">SOL</span>
                            </>
                          )}
                        </div>
                        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-cyan-400" />
                            {stats?.playerCount ?? 0} active
                          </span>
                          <span className="font-mono text-emerald-400">
                            {tier.isPractice
                              ? 'No wallet needed'
                              : `${(stats?.totalPotSol ?? 0).toFixed(2)} SOL pot`}
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
                            skinId === skin.id
                              ? 'scale-110 ring-2 ring-white/70'
                              : 'opacity-70 hover:opacity-100'
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

                {!isPractice && escrowInfo && !escrowInfo.configured && (
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
                  disabled={!canJoin}
                  className={`w-full py-4 rounded-xl font-black text-base tracking-wide text-slate-950 shadow-xl hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 ${
                    isPractice
                      ? 'bg-gradient-to-r from-sky-400 via-cyan-300 to-sky-400 shadow-sky-500/20'
                      : 'bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 shadow-emerald-500/20'
                  }`}
                >
                  {isPractice ? <Gamepad2 className="w-5 h-5" /> : <Flame className="w-5 h-5" />}
                  {isPractice
                    ? isJoining
                      ? 'ENTERING SANDBOX...'
                      : 'PLAY FREE PRACTICE SANDBOX'
                    : !connected
                    ? 'CONNECT SOLANA WALLET TO PLAY'
                    : isJoining
                    ? 'SIGNING & VERIFYING ON SOLANA...'
                    : `DEPOSIT ${activeTier.buyInSol} SOL & SPAWN`}
                </button>

                {/* Daily Free Ticket into Micro Arena */}
                {selectedLobby === 'micro' && (
                  <div className="mt-3 p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Ticket className="w-4 h-4 text-sky-400" />
                        <span className="text-xs font-black uppercase tracking-wider text-sky-300">
                          Daily Free Ticket (1 / Day)
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        Slots: {freeTicketStatus?.activeFreePlayers ?? 0}/
                        {freeTicketStatus?.maxFreePlayers ?? 4}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mb-3">
                      Enter Micro Arena with <strong className="text-white">0 SOL</strong> and hunt paying players for real SOL! Anyone who eats a Free Ticket player earns{' '}
                      <strong className="text-sky-300">+25 Mass &amp; a 4s Speed Boost</strong>.
                    </p>
                    <button
                      onClick={onClaimFreeMicro}
                      disabled={
                        !connected ||
                        isJoining ||
                        !escrowInfo?.configured ||
                        !freeTicketStatus?.eligible
                      }
                      className="w-full py-2.5 rounded-lg font-extrabold text-xs tracking-wide bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                    >
                      <Ticket className="w-4 h-4" />
                      {!connected
                        ? 'CONNECT WALLET TO CLAIM DAILY FREE TICKET'
                        : freeTicketStatus && !freeTicketStatus.eligible
                        ? freeTicketStatus.reason || 'FREE TICKET USED TODAY (RESETS 00:00 UTC)'
                        : 'CLAIM DAILY FREE ENTRY (0 SOL)'}
                    </button>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    {isPractice
                      ? '0 SOL Risk • AI Bots Active • Instant Spawn'
                      : `House Rake: ${((escrowInfo?.rakeBps ?? 500) / 100).toFixed(1)}% (${escrowInfo?.rakeMode ?? 'entry'})`}
                  </span>
                  <span>15s Disconnect Protection • 60Hz Server</span>
                </div>
              </div>
            </div>

            {/* Right: Live Arena Leaderboard */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-slate-800 bg-[#0e131f] p-6 shadow-2xl h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    <h2 className="text-lg font-bold">{activeTier.name} Leaderboard</h2>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5" />
                    {(activeLobbyStats?.totalPotSol ?? 0).toFixed(3)}{' '}
                    {isPractice ? 'vSOL' : 'SOL'}
                  </span>
                </div>

                {!activeLobbyStats || activeLobbyStats.leaderboard.length === 0 ? (
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
                          {(entry.totalLamports / 1_000_000_000).toFixed(4)}{' '}
                          {isPractice ? 'vSOL' : 'SOL'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
