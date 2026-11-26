import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { HallOfFameData } from '@shared/types';
import { config } from './config';
import { prisma } from './db/prisma';
import { escrowService } from './solana/escrowService';
import { LobbyManager } from './game/LobbyManager';
import {
  createHttpRateLimiter,
  getClientIp,
  securityHeaders,
  SocketConnectionGuard,
} from './security/rateLimiter';
import { checkFreeTicketStatus } from './security/freeTicketService';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const allowedOrigins = config.clientOrigin
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const corsOrigin =
  allowedOrigins.length === 0 || allowedOrigins.includes('*')
    ? '*'
    : (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin) return callback(null, true);
        const clean = origin.replace(/\/$/, '');
        if (
          allowedOrigins.includes(clean) ||
          clean.endsWith('.vercel.app') ||
          clean.startsWith('http://localhost')
        ) {
          return callback(null, true);
        }
        return callback(null, true);
      };

app.use(securityHeaders);
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '64kb' }));
app.use('/api', createHttpRateLimiter({ windowMs: 60_000, maxRequests: 120 }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 16 * 1024, // 16KB cap per WebSocket frame
  pingTimeout: 20_000,
  pingInterval: 10_000,
});

const lobbyManager = new LobbyManager(io);
const connectionGuard = new SocketConnectionGuard(10);

function shortenWallet(wallet: string): string {
  if (!wallet || wallet.length < 10) return wallet || 'Unknown';
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, network: config.solanaNetwork, tickRateHz: config.tickRateHz });
});

app.get('/api/escrow-info', (_req, res) => {
  res.json(escrowService.getPublicInfo());
});

app.get('/api/lobbies', (_req, res) => {
  res.json({ lobbies: lobbyManager.getLobbyStats() });
});

app.get('/api/free-ticket-status', async (req, res) => {
  try {
    const wallet = typeof req.query.wallet === 'string' ? req.query.wallet : undefined;
    const status = await checkFreeTicketStatus({
      wallet,
      ip: getClientIp(req),
      activeFreePlayers: lobbyManager.getActiveFreePlayerCount('micro'),
    });
    res.json(status);
  } catch (err) {
    console.error('[FreeTicket] Status check failed:', err);
    res.status(500).json({ error: 'Failed to check free ticket eligibility.' });
  }
});

app.get('/api/hall-of-fame', async (_req, res) => {
  try {
    const [
      topCashOutRows,
      recentPayoutRows,
      allKillRows,
      depositAgg,
      payoutAgg,
      killCount,
      cashOutCount,
    ] = await Promise.all([
      prisma.cashOut.findMany({
        where: { status: 'CONFIRMED' },
        orderBy: { netLamports: 'desc' },
        take: 10,
      }),
      prisma.cashOut.findMany({
        where: { status: 'CONFIRMED' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.killEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      prisma.deposit.aggregate({ _sum: { grossLamports: true } }),
      prisma.cashOut.aggregate({
        where: { status: 'CONFIRMED' },
        _sum: { netLamports: true },
      }),
      prisma.killEvent.count(),
      prisma.cashOut.count({ where: { status: 'CONFIRMED' } }),
    ]);

    // Aggregate top hunters by wallet
    const hunterMap = new Map<
      string,
      { wallet: string; username: string; kills: number; bountyLamports: bigint }
    >();
    for (const k of allKillRows) {
      const existing = hunterMap.get(k.killerWallet);
      if (existing) {
        existing.kills += 1;
        existing.bountyLamports += k.bountyLamports;
        existing.username = k.killerName;
      } else {
        hunterMap.set(k.killerWallet, {
          wallet: k.killerWallet,
          username: k.killerName,
          kills: 1,
          bountyLamports: k.bountyLamports,
        });
      }
    }

    const topHunters = Array.from(hunterMap.values())
      .sort((a, b) =>
        b.bountyLamports > a.bountyLamports
          ? 1
          : b.bountyLamports < a.bountyLamports
          ? -1
          : b.kills - a.kills
      )
      .slice(0, 10)
      .map((h) => ({
        walletShort: shortenWallet(h.wallet),
        username: h.username,
        kills: h.kills,
        totalBountySol: Number(h.bountyLamports) / 1_000_000_000,
      }));

    const payload: HallOfFameData = {
      stats: {
        totalDepositsSol: Number(depositAgg._sum.grossLamports ?? BigInt(0)) / 1_000_000_000,
        totalPayoutsSol: Number(payoutAgg._sum.netLamports ?? BigInt(0)) / 1_000_000_000,
        totalKills: killCount,
        totalCashOuts: cashOutCount,
      },
      topCashOuts: topCashOutRows.map((c) => ({
        id: c.id,
        walletShort: shortenWallet(c.wallet),
        lobbyTier: c.lobbyTier,
        netSol: Number(c.netLamports) / 1_000_000_000,
        txSignature: c.txSignature,
        explorerUrl: c.txSignature ? escrowService.getExplorerUrl(c.txSignature) : null,
        createdAt: c.createdAt.toISOString(),
      })),
      topHunters,
      recentPayouts: recentPayoutRows.map((c) => ({
        id: c.id,
        walletShort: shortenWallet(c.wallet),
        lobbyTier: c.lobbyTier,
        netSol: Number(c.netLamports) / 1_000_000_000,
        txSignature: c.txSignature,
        explorerUrl: c.txSignature ? escrowService.getExplorerUrl(c.txSignature) : null,
        createdAt: c.createdAt.toISOString(),
      })),
    };

    res.json(payload);
  } catch (err) {
    console.error('[HallOfFame] Query failed:', err);
    res.status(500).json({ error: 'Failed to load Hall of Fame data.' });
  }
});

io.on('connection', (socket) => {
  if (!connectionGuard.tryAcquire(socket)) {
    socket.emit('arena:error', { message: 'Too many concurrent connections from your IP.' });
    socket.disconnect(true);
    return;
  }
  lobbyManager.registerSocket(socket);
  socket.emit('lobbies:stats', lobbyManager.getLobbyStats());
});

// Broadcast lobby stats every 2 seconds to connected lobby browsers
const statsInterval = setInterval(() => {
  io.emit('lobbies:stats', lobbyManager.getLobbyStats());
}, 2000);

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[SolAgar Server] Listening on http://0.0.0.0:${config.port}`);
  console.log(`[SolAgar Server] Solana Network: ${config.solanaNetwork} (${config.solanaRpcUrl})`);
});

// Graceful shutdown for zero-corruption Railway redeploys
function shutdown(signal: string) {
  console.log(`[SolAgar Server] Received ${signal}, shutting down cleanly...`);
  clearInterval(statsInterval);
  lobbyManager.stopAll();
  io.close(() => {
    server.close(async () => {
      await prisma.$disconnect().catch(() => {});
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
