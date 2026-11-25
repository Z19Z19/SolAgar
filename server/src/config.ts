import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  solanaNetwork: (process.env.SOLANA_NETWORK === 'mainnet-beta' ? 'mainnet-beta' : 'devnet') as 'devnet' | 'mainnet-beta',
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  escrowPrivateKey: process.env.ESCROW_PRIVATE_KEY || '',
  devTreasuryWallet: process.env.DEV_TREASURY_WALLET || '',
  rakeBps: Number(process.env.RAKE_BPS ?? 500), // 500 bps = 5%
  rakeMode: (process.env.RAKE_MODE === 'cashout' ? 'cashout' : 'entry') as 'entry' | 'cashout',

  // Physics & Gameplay Constants
  tickRateHz: 60,
  initialMass: 20,
  minSplitMass: 36,
  minEjectMass: 32,
  ejectMassCost: 14,
  ejectPelletMass: 12,
  maxCellsPerPlayer: 16,
  baseSpeed: 280, // pixels/sec at mass=1, scaled by mass^-0.439
  massDecayRatePerSec: 0.002, // 0.2% per sec for cells > 100 mass
  massDecayThreshold: 100,
  cashoutChannelMs: 5000,
  disconnectGraceMs: 15000,
};
