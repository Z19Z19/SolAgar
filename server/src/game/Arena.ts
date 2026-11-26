import { Server } from 'socket.io';
import {
  CashOutResult,
  GameStateSnapshot,
  KillFeedEvent,
  LeaderboardEntry,
  LobbyTierConfig,
  MinimapDot,
  NetCell,
  NetPellet,
  NetVirus,
  PLAYER_SKINS,
} from '@shared/types';
import { config } from '../config';
import { prisma } from '../db/prisma';
import { escrowService } from '../solana/escrowService';
import { Quadtree, SpatialItem } from './Quadtree';

interface CellEntity extends SpatialItem {
  ownerId: string;
  username: string;
  mass: number;
  lamports: number;
  vx: number;
  vy: number;
  boostVx: number;
  boostVy: number;
  mergeAt: number;
  fill: string;
  border: string;
}

interface PelletEntity extends SpatialItem {
  mass: number;
  color: string;
  vx: number;
  vy: number;
  isEjected: boolean;
  ejectorWallet?: string;
}

interface VirusEntity extends SpatialItem {
  mass: number;
}

export interface PlayerSession {
  id: string; // unique player session id
  socketId: string;
  walletAddress: string;
  username: string;
  fill: string;
  border: string;
  inputDx: number;
  inputDy: number;
  cells: CellEntity[];
  isCashingOut: boolean;
  cashoutStartedAt: number | null;
  cashoutProcessing: boolean;
  disconnectedAt: number | null;
  lastMoveAt: number;
  lastActionAt: number;
  isBot?: boolean;
  botDecisionAt?: number;
  isFreeTicket?: boolean;
  speedBoostUntil?: number;
  // Anti-teaming tracker: targetWallet -> timestamps of ejects eaten
  feedTracker: Map<string, number[]>;
}

const BOT_NAMES = [
  'SolBot',
  'DegenAI',
  'WhaleBot',
  'NeonOrca',
  'ApexCell',
  'PhantomAI',
  'PixelShark',
  'OrbitBot',
  'HyperBlob',
  'SolViper',
];

const PELLET_COLORS = [
  '#22d3ee',
  '#34d399',
  '#a78bfa',
  '#f472b6',
  '#fbbf24',
  '#60a5fa',
  '#fb7185',
];

function massToRadius(mass: number): number {
  return Math.sqrt(mass) * 4.8;
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export class Arena {
  public readonly tier: LobbyTierConfig;
  private io: Server;
  private players = new Map<string, PlayerSession>(); // playerId -> PlayerSession
  private socketToPlayer = new Map<string, string>(); // socketId -> playerId
  private pellets = new Map<string, PelletEntity>();
  private viruses = new Map<string, VirusEntity>();
  private tickCount = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private lastTickTime = Date.now();

  private cellTree: Quadtree<CellEntity>;
  private pelletTree: Quadtree<PelletEntity>;
  private virusTree: Quadtree<VirusEntity>;

  constructor(tier: LobbyTierConfig, io: Server) {
    this.tier = tier;
    this.io = io;

    const bounds = { x: 0, y: 0, w: tier.arenaSize, h: tier.arenaSize };
    this.cellTree = new Quadtree<CellEntity>(bounds);
    this.pelletTree = new Quadtree<PelletEntity>(bounds);
    this.virusTree = new Quadtree<VirusEntity>(bounds);

    this.populateInitialEntities();
  }

  public start(): void {
    if (this.intervalId) return;
    const stepMs = Math.round(1000 / config.tickRateHz);
    this.lastTickTime = Date.now();
    this.intervalId = setInterval(() => this.tick(), stepMs);
    console.log(`[Arena:${this.tier.id}] Started at ${config.tickRateHz}Hz (size ${this.tier.arenaSize})`);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private populateInitialEntities(): void {
    for (let i = 0; i < this.tier.maxPellets; i++) {
      this.spawnPellet();
    }
    for (let i = 0; i < this.tier.maxViruses; i++) {
      this.spawnVirus();
    }
    const targetBots = this.tier.botCount ?? 0;
    for (let i = 0; i < targetBots; i++) {
      this.spawnPracticeBot();
    }
  }

  private spawnPracticeBot(): void {
    const skin = PLAYER_SKINS[Math.floor(Math.random() * PLAYER_SKINS.length)];
    const botId = randomId('bot');
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const margin = 250;
    const spawnX = margin + Math.random() * (this.tier.arenaSize - margin * 2);
    const spawnY = margin + Math.random() * (this.tier.arenaSize - margin * 2);
    const initialMass = 18 + Math.floor(Math.random() * 28);

    const cell: CellEntity = {
      id: randomId('c'),
      ownerId: botId,
      username: `[BOT] ${name}`,
      x: spawnX,
      y: spawnY,
      mass: initialMass,
      radius: massToRadius(initialMass),
      lamports: 50_000_000, // Virtual 0.05 Practice SOL
      vx: 0,
      vy: 0,
      boostVx: 0,
      boostVy: 0,
      mergeAt: 0,
      fill: skin.fill,
      border: skin.border,
    };

    this.players.set(botId, {
      id: botId,
      socketId: `bot_socket_${botId}`,
      walletAddress: 'PRACTICE_BOT',
      username: `[BOT] ${name}`,
      fill: skin.fill,
      border: skin.border,
      inputDx: (Math.random() - 0.5) * 400,
      inputDy: (Math.random() - 0.5) * 400,
      cells: [cell],
      isCashingOut: false,
      cashoutStartedAt: null,
      cashoutProcessing: false,
      disconnectedAt: null,
      lastMoveAt: Date.now(),
      lastActionAt: 0,
      isBot: true,
      botDecisionAt: 0,
      feedTracker: new Map(),
    });
  }

  private spawnPellet(): void {
    const id = randomId('p');
    const margin = 40;
    const x = margin + Math.random() * (this.tier.arenaSize - margin * 2);
    const y = margin + Math.random() * (this.tier.arenaSize - margin * 2);
    this.pellets.set(id, {
      id,
      x,
      y,
      radius: 7,
      mass: 1,
      color: PELLET_COLORS[Math.floor(Math.random() * PELLET_COLORS.length)],
      vx: 0,
      vy: 0,
      isEjected: false,
    });
  }

  private spawnVirus(): void {
    const id = randomId('v');
    const margin = 180;
    const x = margin + Math.random() * (this.tier.arenaSize - margin * 2);
    const y = margin + Math.random() * (this.tier.arenaSize - margin * 2);
    const mass = 100;
    this.viruses.set(id, {
      id,
      x,
      y,
      mass,
      radius: massToRadius(mass),
    });
  }

  public spawnPlayer(params: {
    socketId: string;
    walletAddress: string;
    username: string;
    skinId: string;
    netLamports: number;
    isFreeTicket?: boolean;
  }): PlayerSession {
    const skin = PLAYER_SKINS.find((s) => s.id === params.skinId) ?? PLAYER_SKINS[0];
    const playerId = randomId('pl');
    const margin = 250;
    const spawnX = margin + Math.random() * (this.tier.arenaSize - margin * 2);
    const spawnY = margin + Math.random() * (this.tier.arenaSize - margin * 2);

    const initialCell: CellEntity = {
      id: randomId('c'),
      ownerId: playerId,
      username: params.username,
      x: spawnX,
      y: spawnY,
      mass: config.initialMass,
      radius: massToRadius(config.initialMass),
      lamports: params.netLamports,
      vx: 0,
      vy: 0,
      boostVx: 0,
      boostVy: 0,
      mergeAt: 0,
      fill: skin.fill,
      border: skin.border,
    };

    const session: PlayerSession = {
      id: playerId,
      socketId: params.socketId,
      walletAddress: params.walletAddress,
      username: params.username,
      fill: skin.fill,
      border: skin.border,
      inputDx: 0,
      inputDy: 0,
      cells: [initialCell],
      isCashingOut: false,
      cashoutStartedAt: null,
      cashoutProcessing: false,
      disconnectedAt: null,
      lastMoveAt: Date.now(),
      lastActionAt: 0,
      isFreeTicket: Boolean(params.isFreeTicket),
      speedBoostUntil: 0,
      feedTracker: new Map(),
    };

    this.players.set(playerId, session);
    this.socketToPlayer.set(params.socketId, playerId);
    return session;
  }

  public handleMove(socketId: string, dx: number, dy: number): void {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.disconnectedAt !== null) return;

    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    player.inputDx = Math.max(-5000, Math.min(5000, dx));
    player.inputDy = Math.max(-5000, Math.min(5000, dy));
  }

  private getPlayerCenter(player: PlayerSession): { cx: number; cy: number } {
    let totalMass = 0;
    let sumX = 0;
    let sumY = 0;
    for (const c of player.cells) {
      totalMass += c.mass;
      sumX += c.x * c.mass;
      sumY += c.y * c.mass;
    }
    if (totalMass <= 0) return { cx: this.tier.arenaSize / 2, cy: this.tier.arenaSize / 2 };
    return { cx: sumX / totalMass, cy: sumY / totalMass };
  }

  public handleSplit(socketId: string): void {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.isCashingOut || player.cashoutProcessing || player.disconnectedAt !== null) {
      return;
    }

    const now = Date.now();
    if (now - player.lastActionAt < 80) return;
    player.lastActionAt = now;

    const { cx, cy } = this.getPlayerCenter(player);
    const targetX = cx + player.inputDx;
    const targetY = cy + player.inputDy;

    const newCells: CellEntity[] = [];
    for (const cell of player.cells) {
      if (player.cells.length + newCells.length >= config.maxCellsPerPlayer) break;
      if (cell.mass < config.minSplitMass) continue;

      const mass1 = Math.floor(cell.mass / 2);
      const mass2 = cell.mass - mass1;

      // Exact integer lamport proportional splitting (conserves sum to exact lamport)
      const totalLamports = cell.lamports;
      const lamports2 = Math.floor((totalLamports * mass2) / cell.mass);
      const lamports1 = totalLamports - lamports2;

      cell.mass = mass1;
      cell.radius = massToRadius(mass1);
      cell.lamports = lamports1;

      const dx = targetX - cell.x;
      const dy = targetY - cell.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      // Short 1.5s launch grace period so split cells shoot out cleanly before they can remerge
      const mergeDelay = 1500;
      cell.mergeAt = now + mergeDelay;

      const childRadius = massToRadius(mass2);
      const launchSpeed = 620;

      newCells.push({
        id: randomId('c'),
        ownerId: player.id,
        username: player.username,
        x: Math.max(childRadius, Math.min(this.tier.arenaSize - childRadius, cell.x + nx * (cell.radius + 8))),
        y: Math.max(childRadius, Math.min(this.tier.arenaSize - childRadius, cell.y + ny * (cell.radius + 8))),
        mass: mass2,
        radius: childRadius,
        lamports: lamports2,
        vx: 0,
        vy: 0,
        boostVx: nx * launchSpeed,
        boostVy: ny * launchSpeed,
        mergeAt: now + mergeDelay,
        fill: cell.fill,
        border: cell.border,
      });
    }

    if (newCells.length > 0) {
      player.cells.push(...newCells);
    }
  }

  public handleEject(socketId: string): void {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.isCashingOut || player.cashoutProcessing || player.disconnectedAt !== null) {
      return;
    }

    const now = Date.now();
    if (now - player.lastActionAt < 80) return;
    player.lastActionAt = now;

    const { cx, cy } = this.getPlayerCenter(player);
    const targetX = cx + player.inputDx;
    const targetY = cy + player.inputDy;

    for (const cell of player.cells) {
      if (cell.mass < config.minEjectMass) continue;

      cell.mass -= config.ejectMassCost;
      cell.radius = massToRadius(cell.mass);

      const dx = targetX - cell.x;
      const dy = targetY - cell.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      const pId = randomId('ej');
      this.pellets.set(pId, {
        id: pId,
        x: Math.max(15, Math.min(this.tier.arenaSize - 15, cell.x + nx * (cell.radius + 14))),
        y: Math.max(15, Math.min(this.tier.arenaSize - 15, cell.y + ny * (cell.radius + 14))),
        radius: 11,
        mass: config.ejectPelletMass,
        color: cell.fill,
        vx: nx * 520,
        vy: ny * 520,
        isEjected: true,
        ejectorWallet: player.walletAddress,
      });
    }
  }

  public handleCashOutStart(socketId: string): void {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.cells.length === 0 || player.cashoutProcessing || player.isCashingOut) {
      return;
    }
    const totalLamports = player.cells.reduce((sum, c) => sum + c.lamports, 0);
    if (!this.tier.isPractice && totalLamports <= 0) {
      this.io.to(socketId).emit('arena:error', {
        message: 'Absorb SOL from another player before cashing out!',
      });
      return;
    }
    player.isCashingOut = true;
    player.cashoutStartedAt = Date.now();
  }

  public handleCashOutCancel(socketId: string): void {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.cashoutProcessing) return;
    player.isCashingOut = false;
    player.cashoutStartedAt = null;
  }

  public handleDisconnect(socketId: string): void {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;
    this.socketToPlayer.delete(socketId);
    const player = this.players.get(playerId);
    if (!player) return;

    // 15-second disconnect grace period: cell stays vulnerable in arena
    player.disconnectedAt = Date.now();
    player.isCashingOut = false;
    player.cashoutStartedAt = null;
  }

  public hasPlayer(socketId: string): boolean {
    return this.socketToPlayer.has(socketId);
  }

  public getPlayerCount(): number {
    return this.players.size;
  }

  public getActiveFreePlayerCount(): number {
    let count = 0;
    for (const p of this.players.values()) {
      if (p.isFreeTicket && p.cells.length > 0) count++;
    }
    return count;
  }

  public getTotalPotLamports(): number {
    let total = 0;
    for (const p of this.players.values()) {
      for (const c of p.cells) total += c.lamports;
    }
    return total;
  }

  public getLeaderboard(): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = [];
    for (const p of this.players.values()) {
      if (p.cells.length === 0) continue;
      let totalMass = 0;
      let totalLamports = 0;
      for (const c of p.cells) {
        totalMass += c.mass;
        totalLamports += c.lamports;
      }
      entries.push({
        playerId: p.id,
        username: p.username,
        walletShort: `${p.walletAddress.slice(0, 4)}...${p.walletAddress.slice(-4)}`,
        totalMass: Math.round(totalMass),
        totalLamports,
        isCashingOut: p.isCashingOut,
      });
    }
    entries.sort((a, b) => b.totalLamports - a.totalLamports || b.totalMass - a.totalMass);
    return entries.slice(0, 10);
  }

  private tick(): void {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTickTime) / 1000);
    this.lastTickTime = now;
    this.tickCount++;

    // 1. Remove expired disconnected players (after 15s grace)
    for (const [playerId, player] of this.players.entries()) {
      if (player.disconnectedAt !== null && now - player.disconnectedAt >= config.disconnectGraceMs) {
        this.players.delete(playerId);
      }
    }

    // 2. Check Cash-Out completions (5s channel survived)
    for (const player of this.players.values()) {
      if (
        player.isCashingOut &&
        !player.cashoutProcessing &&
        player.cashoutStartedAt !== null &&
        now - player.cashoutStartedAt >= config.cashoutChannelMs
      ) {
        this.completeCashOut(player);
      }
    }

    // 3. Update pellets (ejected mass velocity damping)
    for (const pellet of this.pellets.values()) {
      if (pellet.vx !== 0 || pellet.vy !== 0) {
        pellet.x = Math.max(pellet.radius, Math.min(this.tier.arenaSize - pellet.radius, pellet.x + pellet.vx * dt));
        pellet.y = Math.max(pellet.radius, Math.min(this.tier.arenaSize - pellet.radius, pellet.y + pellet.vy * dt));
        const damping = Math.pow(0.08, dt);
        pellet.vx *= damping;
        pellet.vy *= damping;
        if (Math.hypot(pellet.vx, pellet.vy) < 5) {
          pellet.vx = 0;
          pellet.vy = 0;
        }
      }
    }

    // 3b. Update AI bots in Practice Sandbox
    if (this.tier.botCount && this.tier.botCount > 0) {
      this.updateBots(now);
    }

    // 4. Update player cells (movement, boost damping, mass decay, own-cell separation/merging)
    for (const player of this.players.values()) {
      if (player.cashoutProcessing) continue;

      const { cx, cy } = this.getPlayerCenter(player);
      const targetX = cx + player.inputDx;
      const targetY = cy + player.inputDy;

      for (const cell of player.cells) {
        // Mass decay for large cells
        if (cell.mass > config.massDecayThreshold) {
          const decay = cell.mass * config.massDecayRatePerSec * dt;
          cell.mass = Math.max(config.massDecayThreshold, cell.mass - decay);
          cell.radius = massToRadius(cell.mass);
        }

        // Target steering (frozen/slowed if disconnected)
        if (player.disconnectedAt === null) {
          const dx = targetX - cell.x;
          const dy = targetY - cell.y;
          const dist = Math.hypot(dx, dy);
          // Server-enforced velocity cap based on mass (+25% surge during active Speed Boost)
          const boostMultiplier =
            player.speedBoostUntil && now < player.speedBoostUntil ? 1.25 : 1.0;
          const maxSpeed =
            config.baseSpeed * Math.pow(Math.max(10, cell.mass), -0.439) * 3.2 * boostMultiplier;
          // Smooth deadzone only when cursor is very close to cell center (< 45px)
          const speedFactor = Math.min(1, dist / 45);
          if (dist > 0.5) {
            const targetVx = (dx / dist) * maxSpeed * speedFactor;
            const targetVy = (dy / dist) * maxSpeed * speedFactor;
            // Smooth velocity response
            cell.vx += (targetVx - cell.vx) * Math.min(1, dt * 22);
            cell.vy += (targetVy - cell.vy) * Math.min(1, dt * 22);
          } else {
            cell.vx = 0;
            cell.vy = 0;
          }
        } else {
          cell.vx = 0;
          cell.vy = 0;
        }

        // Apply velocity + split boost
        cell.x += (cell.vx + cell.boostVx) * dt;
        cell.y += (cell.vy + cell.boostVy) * dt;

        // Dampen boost velocity
        if (cell.boostVx !== 0 || cell.boostVy !== 0) {
          const damp = Math.pow(0.02, dt);
          cell.boostVx *= damp;
          cell.boostVy *= damp;
          if (Math.hypot(cell.boostVx, cell.boostVy) < 4) {
            cell.boostVx = 0;
            cell.boostVy = 0;
          }
        }

        // Clamp to arena boundaries
        cell.x = Math.max(cell.radius, Math.min(this.tier.arenaSize - cell.radius, cell.x));
        cell.y = Math.max(cell.radius, Math.min(this.tier.arenaSize - cell.radius, cell.y));
      }

      // Own-cell collision separation vs merging
      this.resolveOwnCells(player, now);
    }

    // 5. Rebuild Quadtrees
    this.cellTree.clear();
    this.pelletTree.clear();
    this.virusTree.clear();

    for (const player of this.players.values()) {
      if (player.cashoutProcessing) continue;
      for (const cell of player.cells) {
        this.cellTree.insert(cell);
      }
    }
    for (const pellet of this.pellets.values()) {
      this.pelletTree.insert(pellet);
    }
    for (const virus of this.viruses.values()) {
      this.virusTree.insert(virus);
    }

    // 6. Collisions: Cells eating Pellets, Cells hitting Viruses, Cells eating Cells
    this.resolveCollisions(now);

    // 7. Replenish pellets & viruses
    while (this.pellets.size < this.tier.maxPellets) {
      this.spawnPellet();
    }
    while (this.viruses.size < this.tier.maxViruses) {
      this.spawnVirus();
    }

    // 8. Broadcast interest-managed state snapshots to each active player
    this.broadcastState(now);
  }

  private resolveOwnCells(player: PlayerSession, now: number): void {
    const cells = player.cells;
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i];
        const b = cells[j];
        if (!a || !b) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const minDist = a.radius + b.radius;

        const canMerge = now >= a.mergeAt && now >= b.mergeAt;
        if (canMerge) {
          // Remerge as soon as the two cells overlap / get close enough
          if (dist < minDist * 0.85) {
            const totalMass = a.mass + b.mass;
            a.x = (a.x * a.mass + b.x * b.mass) / totalMass;
            a.y = (a.y * a.mass + b.y * b.mass) / totalMass;
            a.mass = totalMass;
            a.lamports += b.lamports;
            a.radius = massToRadius(a.mass);
            cells.splice(j, 1);
            j--;
          } else if (dist < minDist * 1.15) {
            // Gentle magnetic pull when nearly touching so remerging feels snappy
            const nx = dx / dist;
            const ny = dy / dist;
            const pull = 2.5;
            a.x += nx * pull;
            a.y += ny * pull;
            b.x -= nx * pull;
            b.y -= ny * pull;
          }
        } else if (dist < minDist) {
          // Push apart smoothly during initial launch separation
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          const push = overlap * 0.35;
          a.x = Math.max(a.radius, Math.min(this.tier.arenaSize - a.radius, a.x - nx * push));
          a.y = Math.max(a.radius, Math.min(this.tier.arenaSize - a.radius, a.y - ny * push));
          b.x = Math.max(b.radius, Math.min(this.tier.arenaSize - b.radius, b.x + nx * push));
          b.y = Math.max(b.radius, Math.min(this.tier.arenaSize - b.radius, b.y + ny * push));
        }
      }
    }
  }

  private resolveCollisions(now: number): void {
    const eatenCells = new Set<string>();

    for (const player of this.players.values()) {
      if (player.cashoutProcessing) continue;

      for (const cell of [...player.cells]) {
        if (eatenCells.has(cell.id)) continue;

        const queryBounds = {
          x: cell.x - cell.radius - 20,
          y: cell.y - cell.radius - 20,
          w: (cell.radius + 20) * 2,
          h: (cell.radius + 20) * 2,
        };

        // A. Eat Pellets
        const nearbyPellets = this.pelletTree.query(queryBounds);
        for (const pellet of nearbyPellets) {
          if (!this.pellets.has(pellet.id)) continue;
          const dist = Math.hypot(cell.x - pellet.x, cell.y - pellet.y);
          if (dist < cell.radius - pellet.radius * 0.25) {
            cell.mass += pellet.mass;
            cell.radius = massToRadius(cell.mass);
            this.pellets.delete(pellet.id);

            // Anti-teaming check for ejected mass
            if (pellet.isEjected && pellet.ejectorWallet && pellet.ejectorWallet !== player.walletAddress) {
              this.recordFeedEvent(pellet.ejectorWallet, player.walletAddress, now);
            }
          }
        }

        // B. Hit Viruses
        const nearbyViruses = this.virusTree.query(queryBounds);
        for (const virus of nearbyViruses) {
          if (!this.viruses.has(virus.id)) continue;
          const dist = Math.hypot(cell.x - virus.x, cell.y - virus.y);
          if (cell.mass > virus.mass * 1.15 && dist < cell.radius * 0.85) {
            this.viruses.delete(virus.id);
            this.explodeCellFromVirus(player, cell, now);
            break;
          }
        }

        // C. Eat Enemy Cells
        const nearbyCells = this.cellTree.query(queryBounds);
        for (const other of nearbyCells) {
          if (other.ownerId === cell.ownerId || eatenCells.has(other.id)) continue;
          if (cell.mass > other.mass * 1.15) {
            const dist = Math.hypot(cell.x - other.x, cell.y - other.y);
            if (dist < cell.radius - other.radius * 0.4) {
              eatenCells.add(other.id);
              const victim = this.players.get(other.ownerId);
              const isFreeBoostTarget = Boolean(victim?.isFreeTicket && other.lamports === 0);

              cell.mass += other.mass + (isFreeBoostTarget ? 25 : 0);
              cell.radius = massToRadius(cell.mass);
              cell.lamports += other.lamports;

              if (isFreeBoostTarget) {
                const baseUntil = Math.max(player.speedBoostUntil ?? 0, now);
                player.speedBoostUntil = Math.min(now + 6000, baseUntil + 4000);
              }

              if (victim) {
                victim.cells = victim.cells.filter((c) => c.id !== other.id);
                this.onCellEaten(player, victim, other.lamports, isFreeBoostTarget);
              }
            }
          }
        }
      }
    }
  }

  private explodeCellFromVirus(player: PlayerSession, cell: CellEntity, now: number): void {
    const availableSlots = config.maxCellsPerPlayer - player.cells.length;
    if (availableSlots <= 0) {
      cell.mass += 25;
      cell.radius = massToRadius(cell.mass);
      return;
    }

    const pieces = Math.min(availableSlots + 1, 6);
    const totalMass = cell.mass;
    const totalLamports = cell.lamports;
    const pieceMass = Math.max(14, Math.floor(totalMass / pieces));

    let remainingMass = totalMass;
    let remainingLamports = totalLamports;

    // Keep first piece in original cell
    const firstLamports = Math.floor((totalLamports * pieceMass) / totalMass);
    cell.mass = pieceMass;
    cell.radius = massToRadius(pieceMass);
    cell.lamports = firstLamports;
    cell.mergeAt = now + 20000;
    remainingMass -= pieceMass;
    remainingLamports -= firstLamports;

    for (let i = 1; i < pieces; i++) {
      const isLast = i === pieces - 1;
      const m = isLast ? remainingMass : Math.min(pieceMass, remainingMass);
      const l = isLast ? remainingLamports : Math.floor((totalLamports * m) / totalMass);
      remainingMass -= m;
      remainingLamports -= l;

      if (m <= 0) continue;
      const angle = (Math.PI * 2 * i) / (pieces - 1) + Math.random() * 0.3;
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      const r = massToRadius(m);

      player.cells.push({
        id: randomId('c'),
        ownerId: player.id,
        username: player.username,
        x: Math.max(r, Math.min(this.tier.arenaSize - r, cell.x + nx * (cell.radius + 10))),
        y: Math.max(r, Math.min(this.tier.arenaSize - r, cell.y + ny * (cell.radius + 10))),
        mass: m,
        radius: r,
        lamports: l,
        vx: 0,
        vy: 0,
        boostVx: nx * 520,
        boostVy: ny * 520,
        mergeAt: now + 20000,
        fill: cell.fill,
        border: cell.border,
      });
    }
  }

  private updateBots(now: number): void {
    const targetBots = this.tier.botCount ?? 0;
    let botCount = 0;

    for (const bot of this.players.values()) {
      if (!bot.isBot) continue;
      botCount++;
      if (bot.cells.length === 0) continue;
      if (bot.botDecisionAt && now < bot.botDecisionAt) continue;

      bot.botDecisionAt = now + 220 + Math.random() * 180;
      const primary = bot.cells[0];

      // Stay away from arena walls
      const wallMargin = 180;
      if (
        primary.x < wallMargin ||
        primary.x > this.tier.arenaSize - wallMargin ||
        primary.y < wallMargin ||
        primary.y > this.tier.arenaSize - wallMargin
      ) {
        bot.inputDx = this.tier.arenaSize / 2 - primary.x;
        bot.inputDy = this.tier.arenaSize / 2 - primary.y;
        continue;
      }

      const scanRange = 460;
      const scanBounds = {
        x: primary.x - scanRange,
        y: primary.y - scanRange,
        w: scanRange * 2,
        h: scanRange * 2,
      };

      // 1. Check nearby threats or prey
      const nearbyCells = this.cellTree.query(scanBounds);
      let threatX = 0;
      let threatY = 0;
      let hasThreat = false;
      let prey: CellEntity | null = null;
      let preyDist = Infinity;

      for (const other of nearbyCells) {
        if (other.ownerId === bot.id) continue;
        const d = Math.hypot(other.x - primary.x, other.y - primary.y);
        if (other.mass > primary.mass * 1.15 && d < 320) {
          threatX += primary.x - other.x;
          threatY += primary.y - other.y;
          hasThreat = true;
        } else if (primary.mass > other.mass * 1.2 && d < preyDist) {
          prey = other;
          preyDist = d;
        }
      }

      if (hasThreat) {
        bot.inputDx = threatX * 4;
        bot.inputDy = threatY * 4;
        continue;
      }

      if (prey) {
        bot.inputDx = (prey.x - primary.x) * 2;
        bot.inputDy = (prey.y - primary.y) * 2;
        continue;
      }

      // 2. Otherwise seek nearest pellet
      const nearbyPellets = this.pelletTree.query(scanBounds);
      let nearestPellet: PelletEntity | null = null;
      let bestDist = Infinity;
      for (const p of nearbyPellets) {
        const d = Math.hypot(p.x - primary.x, p.y - primary.y);
        if (d < bestDist) {
          bestDist = d;
          nearestPellet = p;
        }
      }

      if (nearestPellet) {
        bot.inputDx = (nearestPellet.x - primary.x) * 3;
        bot.inputDy = (nearestPellet.y - primary.y) * 3;
      } else {
        const angle = Math.random() * Math.PI * 2;
        bot.inputDx = Math.cos(angle) * 400;
        bot.inputDy = Math.sin(angle) * 400;
      }
    }

    while (botCount < targetBots) {
      this.spawnPracticeBot();
      botCount++;
    }
  }

  private onCellEaten(
    killer: PlayerSession,
    victim: PlayerSession,
    bountyLamports: number,
    boostReward = false
  ): void {
    const bountySol = bountyLamports / 1_000_000_000;
    const killEvent: KillFeedEvent = {
      id: randomId('k'),
      killerName: killer.username,
      victimName: victim.username,
      bountySol,
      boostReward,
      timestamp: Date.now(),
    };

    // Broadcast kill feed to everyone in this arena
    this.io.to(`arena:${this.tier.id}`).emit('arena:kill', killEvent);

    // Log real-SOL kill events to Prisma asynchronously (skip practice mode / bots)
    if (!this.tier.isPractice && !killer.isBot && !victim.isBot) {
      prisma.killEvent
        .create({
          data: {
            lobbyTier: this.tier.id,
            killerWallet: killer.walletAddress,
            killerName: killer.username,
            victimWallet: victim.walletAddress,
            victimName: victim.username,
            bountyLamports: BigInt(bountyLamports),
          },
        })
        .catch((err) => console.error('[DB] Failed to log kill event:', err));
    }

    // If victim has no cells left, notify them of elimination and clean up
    if (victim.cells.length === 0) {
      victim.isCashingOut = false;
      victim.cashoutStartedAt = null;
      if (!victim.isBot) {
        this.io.to(victim.socketId).emit('player:eliminated', {
          killerName: killer.username,
          bountySol,
        });
      }
      this.socketToPlayer.delete(victim.socketId);
      this.players.delete(victim.id);
    }
  }

  private recordFeedEvent(ejectorWallet: string, receiverWallet: string, now: number): void {
    if (this.tier.isPractice) return;
    const receiver = Array.from(this.players.values()).find((p) => p.walletAddress === receiverWallet);
    if (!receiver) return;

    const history = receiver.feedTracker.get(ejectorWallet) ?? [];
    const recent = history.filter((t) => now - t < 15000);
    recent.push(now);
    receiver.feedTracker.set(ejectorWallet, recent);

    if (recent.length >= 12) {
      // Reset counter and log anti-teaming flag
      receiver.feedTracker.set(ejectorWallet, []);
      prisma.antiCheatFlag
        .create({
          data: {
            wallet: ejectorWallet,
            targetWallet: receiverWallet,
            reason: 'POTENTIAL_TEAMING_FEED',
            details: `12+ ejected mass pellets transferred within 15s in ${this.tier.id} arena.`,
          },
        })
        .catch((err) => console.error('[DB] AntiCheatFlag error:', err));
    }
  }

  private async completeCashOut(player: PlayerSession): Promise<void> {
    player.cashoutProcessing = true;
    const totalLamports = player.cells.reduce((sum, c) => sum + c.lamports, 0);

    // Despawn player's cells immediately upon completing 5s channel
    player.cells = [];
    this.socketToPlayer.delete(player.socketId);
    this.players.delete(player.id);

    // Practice Sandbox: instant simulated cash-out without on-chain transfer
    if (this.tier.isPractice) {
      const virtualSol = totalLamports / 1_000_000_000;
      const result: CashOutResult = {
        txSignature: 'PRACTICE_MODE',
        grossSol: virtualSol,
        rakeSol: 0,
        netSol: virtualSol,
        explorerUrl: '',
        isPractice: true,
      };
      this.io.to(player.socketId).emit('cashout:success', result);
      return;
    }

    try {
      const result: CashOutResult = await escrowService.executeCashOut({
        walletAddress: player.walletAddress,
        lobbyId: this.tier.id,
        grossLamports: totalLamports,
      });
      this.io.to(player.socketId).emit('cashout:success', result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payout failed';
      this.io.to(player.socketId).emit('cashout:error', { message });
    }
  }

  private broadcastState(now: number): void {
    const leaderboard = this.getLeaderboard();
    const leaderId = leaderboard[0]?.playerId ?? null;
    const playerCount = this.players.size;

    // Pre-compute normalized minimap data once per tick (Cash-Out Radar + Leader + Active Players)
    const rawMinimapPoints: {
      playerId: string;
      x: number;
      y: number;
      isCashingOut: boolean;
      isLeader: boolean;
      cashoutProgress: number;
      solValue: number;
      username: string;
      totalMass: number;
    }[] = [];

    for (const p of this.players.values()) {
      if (p.cells.length === 0) continue;
      let m = 0;
      let lamports = 0;
      let sx = 0;
      let sy = 0;
      for (const c of p.cells) {
        m += c.mass;
        lamports += c.lamports;
        sx += c.x * c.mass;
        sy += c.y * c.mass;
      }
      if (m <= 0) continue;
      const cx = sx / m;
      const cy = sy / m;
      const cashoutProgress =
        p.isCashingOut && p.cashoutStartedAt
          ? Math.min(1, (now - p.cashoutStartedAt) / config.cashoutChannelMs)
          : 0;

      rawMinimapPoints.push({
        playerId: p.id,
        x: Math.max(0, Math.min(1, cx / this.tier.arenaSize)),
        y: Math.max(0, Math.min(1, cy / this.tier.arenaSize)),
        isCashingOut: p.isCashingOut,
        isLeader: p.id === leaderId,
        cashoutProgress,
        solValue: lamports / 1_000_000_000,
        username: p.username,
        totalMass: m,
      });
    }

    for (const player of this.players.values()) {
      if (player.isBot || player.disconnectedAt !== null || player.cells.length === 0) continue;

      let totalMass = 0;
      let totalLamports = 0;
      let sumX = 0;
      let sumY = 0;

      for (const c of player.cells) {
        totalMass += c.mass;
        totalLamports += c.lamports;
        sumX += c.x * c.mass;
        sumY += c.y * c.mass;
      }

      const centerX = totalMass > 0 ? sumX / totalMass : this.tier.arenaSize / 2;
      const centerY = totalMass > 0 ? sumY / totalMass : this.tier.arenaSize / 2;

      // Dynamic viewport radius based on total mass (interest management)
      const zoom = Math.max(0.35, Math.min(1.0, 28 / Math.pow(Math.max(20, totalMass), 0.35)));
      const viewW = 1920 / zoom + 400;
      const viewH = 1080 / zoom + 400;
      const viewBounds = {
        x: centerX - viewW / 2,
        y: centerY - viewH / 2,
        w: viewW,
        h: viewH,
      };

      const visibleCells: NetCell[] = this.cellTree.query(viewBounds).map((c) => {
        const owner = this.players.get(c.ownerId);
        const isCashingOut = owner?.isCashingOut ?? false;
        const cashoutProgress =
          isCashingOut && owner?.cashoutStartedAt
            ? Math.min(1, (now - owner.cashoutStartedAt) / config.cashoutChannelMs)
            : 0;
        const hasSpeedBoost = Boolean(owner?.speedBoostUntil && now < owner.speedBoostUntil);
        const isFreeEntry = Boolean(owner?.isFreeTicket && c.lamports === 0);

        return {
          id: c.id,
          ownerId: c.ownerId,
          username: c.username,
          x: Math.round(c.x * 10) / 10,
          y: Math.round(c.y * 10) / 10,
          radius: Math.round(c.radius * 10) / 10,
          mass: Math.round(c.mass),
          lamports: c.lamports,
          fill: c.fill,
          border: c.border,
          isCashingOut,
          cashoutProgress,
          isDisconnected: owner?.disconnectedAt !== null,
          isFreeEntry,
          hasSpeedBoost,
        };
      });

      const visiblePellets: NetPellet[] = this.pelletTree.query(viewBounds).map((p) => ({
        id: p.id,
        x: Math.round(p.x),
        y: Math.round(p.y),
        radius: p.radius,
        color: p.color,
        isEjected: p.isEjected,
      }));

      const visibleViruses: NetVirus[] = this.virusTree.query(viewBounds).map((v) => ({
        id: v.id,
        x: Math.round(v.x),
        y: Math.round(v.y),
        radius: Math.round(v.radius),
      }));

      const cashoutProgress =
        player.isCashingOut && player.cashoutStartedAt
          ? Math.min(1, (now - player.cashoutStartedAt) / config.cashoutChannelMs)
          : 0;

      const speedBoostRemainingMs =
        player.speedBoostUntil && now < player.speedBoostUntil
          ? player.speedBoostUntil - now
          : 0;

      // Send minimap dots: self + anyone cashing out + #1 leader + up to 12 other players
      const minimap: MinimapDot[] = [];
      let otherCount = 0;
      for (const pt of rawMinimapPoints) {
        const isMe = pt.playerId === player.id;
        if (isMe || pt.isCashingOut || pt.isLeader || otherCount < 12) {
          if (!isMe && !pt.isCashingOut && !pt.isLeader) otherCount++;
          minimap.push({
            id: pt.playerId,
            x: Math.round(pt.x * 1000) / 1000,
            y: Math.round(pt.y * 1000) / 1000,
            isMe,
            isCashingOut: pt.isCashingOut,
            isLeader: pt.isLeader,
            cashoutProgress: pt.cashoutProgress,
            solValue: Math.round(pt.solValue * 1000) / 1000,
            username: pt.username,
          });
        }
      }

      const snapshot: GameStateSnapshot = {
        tick: this.tickCount,
        arenaSize: this.tier.arenaSize,
        isPractice: Boolean(this.tier.isPractice),
        cells: visibleCells,
        pellets: visiblePellets,
        viruses: visibleViruses,
        leaderboard,
        minimap,
        playerCount,
        myTotalMass: Math.round(totalMass),
        myTotalLamports: totalLamports,
        myCenterX: centerX,
        myCenterY: centerY,
        isCashingOut: player.isCashingOut,
        cashoutProgress,
        speedBoostRemainingMs,
      };

      this.io.to(player.socketId).emit('arena:state', snapshot);
    }
  }
}
