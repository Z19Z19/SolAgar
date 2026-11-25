import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config';
import { escrowService } from './solana/escrowService';
import { LobbyManager } from './game/LobbyManager';

const app = express();
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
        if (allowedOrigins.includes(clean) || clean.endsWith('.vercel.app') || clean.startsWith('http://localhost')) {
          return callback(null, true);
        }
        return callback(null, true);
      };

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
});

const lobbyManager = new LobbyManager(io);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, network: config.solanaNetwork, tickRateHz: config.tickRateHz });
});

app.get('/api/escrow-info', (_req, res) => {
  res.json(escrowService.getPublicInfo());
});

app.get('/api/lobbies', (_req, res) => {
  res.json({ lobbies: lobbyManager.getLobbyStats() });
});

io.on('connection', (socket) => {
  lobbyManager.registerSocket(socket);
  socket.emit('lobbies:stats', lobbyManager.getLobbyStats());
});

// Broadcast lobby stats every 2 seconds to connected lobby browsers
setInterval(() => {
  io.emit('lobbies:stats', lobbyManager.getLobbyStats());
}, 2000);

server.listen(config.port, () => {
  console.log(`[SolAgar Server] Listening on http://localhost:${config.port}`);
  console.log(`[SolAgar Server] Solana Network: ${config.solanaNetwork} (${config.solanaRpcUrl})`);
});
