export type LobbyTierId = 'practice' | 'micro' | 'standard' | 'whale';

export interface LobbyTierConfig {
  id: LobbyTierId;
  name: string;
  buyInSol: number;
  buyInLamports: number;
  arenaSize: number;
  maxPellets: number;
  maxViruses: number;
  accentColor: string;
  isPractice?: boolean;
  botCount?: number;
}

export const LOBBY_TIERS: Record<LobbyTierId, LobbyTierConfig> = {
  practice: {
    id: 'practice',
    name: 'Practice Sandbox',
    buyInSol: 0,
    buyInLamports: 0,
    arenaSize: 3200,
    maxPellets: 350,
    maxViruses: 10,
    accentColor: '#38bdf8',
    isPractice: true,
    botCount: 8,
  },
  micro: {
    id: 'micro',
    name: 'Micro Arena',
    buyInSol: 0.05,
    buyInLamports: 50_000_000,
    arenaSize: 4000,
    maxPellets: 450,
    maxViruses: 14,
    accentColor: '#10b981',
  },
  standard: {
    id: 'standard',
    name: 'Standard Arena',
    buyInSol: 0.25,
    buyInLamports: 250_000_000,
    arenaSize: 4500,
    maxPellets: 500,
    maxViruses: 16,
    accentColor: '#06b6d4',
  },
  whale: {
    id: 'whale',
    name: 'Whale Arena',
    buyInSol: 1.0,
    buyInLamports: 1_000_000_000,
    arenaSize: 5000,
    maxPellets: 550,
    maxViruses: 18,
    accentColor: '#a855f7',
  },
};

export interface PlayerSkin {
  id: string;
  name: string;
  fill: string;
  border: string;
  glow: string;
}

export const PLAYER_SKINS: PlayerSkin[] = [
  { id: 'cyber-cyan', name: 'Cyber Cyan', fill: '#06b6d4', border: '#67e8f9', glow: 'rgba(6,182,212,0.5)' },
  { id: 'sol-emerald', name: 'Solana Emerald', fill: '#10b981', border: '#6ee7b7', glow: 'rgba(16,185,129,0.5)' },
  { id: 'phantom-purple', name: 'Phantom Violet', fill: '#8b5cf6', border: '#c4b5fd', glow: 'rgba(139,92,246,0.5)' },
  { id: 'plasma-pink', name: 'Plasma Pink', fill: '#ec4899', border: '#f9a8d4', glow: 'rgba(236,72,153,0.5)' },
  { id: 'solar-gold', name: 'Solar Gold', fill: '#f59e0b', border: '#fcd34d', glow: 'rgba(245,158,11,0.5)' },
  { id: 'crimson-fury', name: 'Crimson Fury', fill: '#ef4444', border: '#fca5a5', glow: 'rgba(239,68,68,0.5)' },
];

export interface NetCell {
  id: string;
  ownerId: string;
  username: string;
  x: number;
  y: number;
  radius: number;
  mass: number;
  lamports: number;
  fill: string;
  border: string;
  isCashingOut: boolean;
  cashoutProgress: number; // 0 to 1
  isDisconnected: boolean;
  isFreeEntry?: boolean;
  hasSpeedBoost?: boolean;
}

export interface NetPellet {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  isEjected?: boolean;
}

export interface NetVirus {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface LeaderboardEntry {
  playerId: string;
  username: string;
  walletShort: string;
  totalMass: number;
  totalLamports: number;
  isCashingOut: boolean;
}

export interface MinimapDot {
  id: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  isMe: boolean;
  isCashingOut: boolean;
  isLeader: boolean;
  cashoutProgress: number;
  solValue: number;
  username: string;
}

export interface GameStateSnapshot {
  tick: number;
  arenaSize: number;
  isPractice: boolean;
  cells: NetCell[];
  pellets: NetPellet[];
  viruses: NetVirus[];
  leaderboard: LeaderboardEntry[];
  minimap: MinimapDot[];
  playerCount: number;
  myTotalMass: number;
  myTotalLamports: number;
  myCenterX: number;
  myCenterY: number;
  isCashingOut: boolean;
  cashoutProgress: number;
  speedBoostRemainingMs: number;
}

export interface KillFeedEvent {
  id: string;
  killerName: string;
  victimName: string;
  bountySol: number;
  boostReward?: boolean;
  timestamp: number;
}

export interface LobbyStats {
  id: LobbyTierId;
  name: string;
  buyInSol: number;
  isPractice?: boolean;
  playerCount: number;
  totalPotSol: number;
  leaderboard: LeaderboardEntry[];
}

export interface JoinArenaPayload {
  lobbyId: LobbyTierId;
  username: string;
  walletAddress?: string;
  txSignature?: string;
  skinId: string;
  isFreeEntry?: boolean;
}

export interface FreeTicketStatus {
  eligible: boolean;
  reason?: string;
  activeFreePlayers: number;
  maxFreePlayers: number;
  dayKey: string;
}

export interface CashOutResult {
  txSignature: string;
  grossSol: number;
  rakeSol: number;
  netSol: number;
  explorerUrl: string;
  isPractice?: boolean;
}

export interface HallOfFameData {
  stats: {
    totalDepositsSol: number;
    totalPayoutsSol: number;
    totalKills: number;
    totalCashOuts: number;
  };
  topCashOuts: {
    id: string;
    walletShort: string;
    lobbyTier: string;
    netSol: number;
    txSignature: string | null;
    explorerUrl: string | null;
    createdAt: string;
  }[];
  topHunters: {
    walletShort: string;
    username: string;
    kills: number;
    totalBountySol: number;
  }[];
  recentPayouts: {
    id: string;
    walletShort: string;
    lobbyTier: string;
    netSol: number;
    txSignature: string | null;
    explorerUrl: string | null;
    createdAt: string;
  }[];
}
