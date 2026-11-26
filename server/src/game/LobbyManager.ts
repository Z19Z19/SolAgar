import { Server, Socket } from 'socket.io';
import {
  JoinArenaPayload,
  LOBBY_TIERS,
  LobbyStats,
  LobbyTierId,
} from '@shared/types';
import { escrowService } from '../solana/escrowService';
import { getClientIp, SocketEventThrottle } from '../security/rateLimiter';
import { claimDailyFreeTicket } from '../security/freeTicketService';
import { Arena } from './Arena';

export class LobbyManager {
  private io: Server;
  private arenas = new Map<LobbyTierId, Arena>();
  private socketArena = new Map<string, LobbyTierId>();

  constructor(io: Server) {
    this.io = io;
    for (const tier of Object.values(LOBBY_TIERS)) {
      const arena = new Arena(tier, io);
      arena.start();
      this.arenas.set(tier.id, arena);
    }
  }

  public stopAll(): void {
    for (const arena of this.arenas.values()) {
      arena.stop();
    }
  }

  public getActiveFreePlayerCount(lobbyId: LobbyTierId = 'micro'): number {
    return this.arenas.get(lobbyId)?.getActiveFreePlayerCount() ?? 0;
  }

  public getLobbyStats(): LobbyStats[] {
    return Object.values(LOBBY_TIERS).map((tier) => {
      const arena = this.arenas.get(tier.id)!;
      return {
        id: tier.id,
        name: tier.name,
        buyInSol: tier.buyInSol,
        isPractice: tier.isPractice,
        playerCount: arena.getPlayerCount(),
        totalPotSol: arena.getTotalPotLamports() / 1_000_000_000,
        leaderboard: arena.getLeaderboard(),
      };
    });
  }

  public registerSocket(socket: Socket): void {
    const throttle = new SocketEventThrottle(150);

    const checkThrottle = (): boolean => {
      const res = throttle.allow();
      if (res.shouldDisconnect) {
        socket.emit('arena:error', { message: 'Disconnected: event rate limit exceeded.' });
        socket.disconnect(true);
        return false;
      }
      return res.ok;
    };

    socket.on('arena:join', async (payload: JoinArenaPayload) => {
      if (!checkThrottle()) return;
      try {
        if (!payload || typeof payload !== 'object') {
          socket.emit('arena:error', { message: 'Invalid join payload.' });
          return;
        }

        if (this.socketArena.has(socket.id)) {
          socket.emit('arena:error', { message: 'Already in an active arena.' });
          return;
        }

        const { lobbyId, username, walletAddress, txSignature, skinId, isFreeEntry } = payload;
        const arena = this.arenas.get(lobbyId);
        if (!arena) {
          socket.emit('arena:error', { message: 'Invalid lobby tier.' });
          return;
        }

        const cleanName =
          String(username || 'Anon')
            .replace(/[^\w\s\-_.]/g, '')
            .trim()
            .slice(0, 16) || 'Anon';
        const cleanSkin = typeof skinId === 'string' ? skinId.slice(0, 32) : 'cyber-cyan';

        let netLamports = 0;
        let effectiveWallet = walletAddress || 'PRACTICE_GUEST';
        let spawnedAsFreeTicket = false;

        if (arena.tier.isPractice) {
          // Free Practice Sandbox: zero buy-in, virtual 0.10 SOL starting bounty
          netLamports = 100_000_000;
          effectiveWallet =
            typeof walletAddress === 'string' && walletAddress.length >= 32
              ? walletAddress
              : `PRACTICE_${socket.id.slice(0, 8)}`;
        } else if (isFreeEntry && lobbyId === 'micro') {
          // Daily Free Ticket into Micro Arena: 0 SOL start, requires valid wallet for payouts
          if (typeof walletAddress !== 'string' || walletAddress.length < 32) {
            socket.emit('arena:error', {
              message: 'Connect a Solana wallet to claim your Daily Free Ticket.',
            });
            return;
          }

          await claimDailyFreeTicket({
            wallet: walletAddress,
            ip: getClientIp(socket),
            activeFreePlayers: arena.getActiveFreePlayerCount(),
          });

          netLamports = 0;
          effectiveWallet = walletAddress;
          spawnedAsFreeTicket = true;
        } else {
          if (
            typeof txSignature !== 'string' ||
            txSignature.length < 32 ||
            typeof walletAddress !== 'string' ||
            walletAddress.length < 32
          ) {
            socket.emit('arena:error', {
              message: 'Valid Solana wallet address and deposit tx signature required.',
            });
            return;
          }

          // Verify deposit on Solana & record in DB (with replay protection)
          const verified = await escrowService.verifyAndRecordDeposit({
            walletAddress,
            lobbyId,
            txSignature,
          });
          netLamports = verified.netLamports;
        }

        const session = arena.spawnPlayer({
          socketId: socket.id,
          walletAddress: effectiveWallet,
          username: cleanName,
          skinId: cleanSkin,
          netLamports,
          isFreeTicket: spawnedAsFreeTicket,
        });

        this.socketArena.set(socket.id, lobbyId);
        socket.join(`arena:${lobbyId}`);

        socket.emit('arena:joined', {
          playerId: session.id,
          lobbyId,
          arenaSize: arena.tier.arenaSize,
          netSol: netLamports / 1_000_000_000,
          isPractice: Boolean(arena.tier.isPractice),
          isFreeTicket: spawnedAsFreeTicket,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to join arena';
        socket.emit('arena:error', { message });
      }
    });

    socket.on('player:move', (data: { dx: number; dy: number }) => {
      if (!checkThrottle()) return;
      if (!data || typeof data.dx !== 'number' || typeof data.dy !== 'number') return;
      const arenaId = this.socketArena.get(socket.id);
      if (!arenaId) return;
      this.arenas.get(arenaId)?.handleMove(socket.id, data.dx, data.dy);
    });

    socket.on('player:split', () => {
      if (!checkThrottle()) return;
      const arenaId = this.socketArena.get(socket.id);
      if (!arenaId) return;
      this.arenas.get(arenaId)?.handleSplit(socket.id);
    });

    socket.on('player:eject', () => {
      if (!checkThrottle()) return;
      const arenaId = this.socketArena.get(socket.id);
      if (!arenaId) return;
      this.arenas.get(arenaId)?.handleEject(socket.id);
    });

    socket.on('cashout:start', () => {
      if (!checkThrottle()) return;
      const arenaId = this.socketArena.get(socket.id);
      if (!arenaId) return;
      this.arenas.get(arenaId)?.handleCashOutStart(socket.id);
    });

    socket.on('cashout:cancel', () => {
      if (!checkThrottle()) return;
      const arenaId = this.socketArena.get(socket.id);
      if (!arenaId) return;
      this.arenas.get(arenaId)?.handleCashOutCancel(socket.id);
    });

    socket.on('disconnect', () => {
      const arenaId = this.socketArena.get(socket.id);
      if (arenaId) {
        this.arenas.get(arenaId)?.handleDisconnect(socket.id);
        this.socketArena.delete(socket.id);
      }
    });
  }
}
