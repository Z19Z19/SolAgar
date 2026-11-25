import { Server, Socket } from 'socket.io';
import {
  JoinArenaPayload,
  LOBBY_TIERS,
  LobbyStats,
  LobbyTierId,
} from '@shared/types';
import { escrowService } from '../solana/escrowService';
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

  public getLobbyStats(): LobbyStats[] {
    return Object.values(LOBBY_TIERS).map((tier) => {
      const arena = this.arenas.get(tier.id)!;
      return {
        id: tier.id,
        name: tier.name,
        buyInSol: tier.buyInSol,
        playerCount: arena.getPlayerCount(),
        totalPotSol: arena.getTotalPotLamports() / 1_000_000_000,
        leaderboard: arena.getLeaderboard(),
      };
    });
  }

  public registerSocket(socket: Socket): void {
    socket.on('arena:join', async (payload: JoinArenaPayload) => {
      try {
        if (this.socketArena.has(socket.id)) {
          socket.emit('arena:error', { message: 'Already in an active arena.' });
          return;
        }

        const { lobbyId, username, walletAddress, txSignature, skinId } = payload;
        const arena = this.arenas.get(lobbyId);
        if (!arena) {
          socket.emit('arena:error', { message: 'Invalid lobby tier.' });
          return;
        }

        const cleanName = (username || 'Anon').trim().slice(0, 16) || 'Anon';
        if (!txSignature || !walletAddress) {
          socket.emit('arena:error', { message: 'Wallet address and deposit tx signature required.' });
          return;
        }

        // Verify deposit on Solana & record in DB (with replay protection)
        const { netLamports } = await escrowService.verifyAndRecordDeposit({
          walletAddress,
          lobbyId,
          txSignature,
        });

        const session = arena.spawnPlayer({
          socketId: socket.id,
          walletAddress,
          username: cleanName,
          skinId,
          netLamports,
        });

        this.socketArena.set(socket.id, lobbyId);
        socket.join(`arena:${lobbyId}`);

        socket.emit('arena:joined', {
          playerId: session.id,
          lobbyId,
          arenaSize: arena.tier.arenaSize,
          netSol: netLamports / 1_000_000_000,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to join arena';
        socket.emit('arena:error', { message });
      }
    });

    socket.on('player:move', (data: { dx: number; dy: number }) => {
      const arenaId = this.socketArena.get(socket.id);
      if (!arenaId) return;
      this.arenas.get(arenaId)?.handleMove(socket.id, data.dx, data.dy);
    });

    socket.on('player:split', () => {
      const arenaId = this.socketArena.get(socket.id);
      if (!arenaId) return;
      this.arenas.get(arenaId)?.handleSplit(socket.id);
    });

    socket.on('player:eject', () => {
      const arenaId = this.socketArena.get(socket.id);
      if (!arenaId) return;
      this.arenas.get(arenaId)?.handleEject(socket.id);
    });

    socket.on('cashout:start', () => {
      const arenaId = this.socketArena.get(socket.id);
      if (!arenaId) return;
      this.arenas.get(arenaId)?.handleCashOutStart(socket.id);
    });

    socket.on('cashout:cancel', () => {
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
