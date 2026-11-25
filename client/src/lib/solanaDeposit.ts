import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { LOBBY_TIERS, LobbyTierId } from '@shared/types';

export interface EscrowPublicInfo {
  network: 'devnet' | 'mainnet-beta';
  rpcUrl: string;
  escrowPublicKey: string | null;
  treasuryPublicKey: string | null;
  rakeBps: number;
  rakeMode: 'entry' | 'cashout';
  configured: boolean;
}

export async function fetchEscrowInfo(): Promise<EscrowPublicInfo> {
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';
  const res = await fetch(`${serverUrl}/api/escrow-info`);
  if (!res.ok) {
    throw new Error('Failed to fetch escrow configuration from game server.');
  }
  return res.json();
}

export async function sendBuyInTransaction(params: {
  connection: Connection;
  payer: PublicKey;
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
  lobbyId: LobbyTierId;
  escrowInfo: EscrowPublicInfo;
}): Promise<string> {
  const { connection, payer, sendTransaction, lobbyId, escrowInfo } = params;

  if (!escrowInfo.configured || !escrowInfo.escrowPublicKey) {
    throw new Error('Server escrow vault is not configured yet.');
  }

  const tier = LOBBY_TIERS[lobbyId];
  const escrowPubkey = new PublicKey(escrowInfo.escrowPublicKey);
  const treasuryPubkey = escrowInfo.treasuryPublicKey
    ? new PublicKey(escrowInfo.treasuryPublicKey)
    : null;

  const grossLamports = tier.buyInLamports;
  const rakeLamports =
    escrowInfo.rakeMode === 'entry'
      ? Math.floor((grossLamports * escrowInfo.rakeBps) / 10000)
      : 0;
  const netLamports = grossLamports - rakeLamports;

  // Check if payer IS the treasury wallet or if treasury is the escrow vault
  const isPayerTreasury = treasuryPubkey ? payer.equals(treasuryPubkey) : false;
  const isTreasuryEscrow = treasuryPubkey ? treasuryPubkey.equals(escrowPubkey) : false;

  const tx = new Transaction();

  if (treasuryPubkey && rakeLamports > 0 && !isTreasuryEscrow && !isPayerTreasury) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: escrowPubkey,
        lamports: netLamports,
      }),
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: treasuryPubkey,
        lamports: rakeLamports,
      })
    );
  } else if (isPayerTreasury && rakeLamports > 0 && !isTreasuryEscrow) {
    // Payer IS the Developer Treasury wallet: only transfer netLamports to Escrow
    // (no need to self-transfer rakeLamports to oneself, which causes negative balance delta)
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: escrowPubkey,
        lamports: netLamports,
      })
    );
  } else {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: escrowPubkey,
        lamports: grossLamports,
      })
    );
  }

  const latestBlockhash = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = payer;

  let signature: string;
  try {
    signature = await sendTransaction(tx, connection);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('cancelled')) {
      throw new Error('Transaction was cancelled in your wallet.');
    }
    throw new Error(msg);
  }

  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    'confirmed'
  );
  return signature;
}
