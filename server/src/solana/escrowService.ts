import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from '../config';
import { prisma } from '../db/prisma';
import { CashOutResult, LOBBY_TIERS, LobbyTierId } from '@shared/types';

function parseKeypair(raw: string): Keypair | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  try {
    if (trimmed.startsWith('[')) {
      const arr = JSON.parse(trimmed) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    const decoded = bs58.decode(trimmed);
    return Keypair.fromSecretKey(decoded);
  } catch (err) {
    console.error('[Escrow] Failed to parse ESCROW_PRIVATE_KEY:', err);
    return null;
  }
}

function parsePublicKey(raw: string): PublicKey | null {
  if (!raw || !raw.trim()) return null;
  try {
    return new PublicKey(raw.trim());
  } catch {
    return null;
  }
}

export class EscrowService {
  private connection: Connection;
  private escrowKeypair: Keypair | null;
  private treasuryPubkey: PublicKey | null;

  constructor() {
    this.connection = new Connection(config.solanaRpcUrl, 'confirmed');
    this.escrowKeypair = parseKeypair(config.escrowPrivateKey);
    this.treasuryPubkey = parsePublicKey(config.devTreasuryWallet);

    if (!this.escrowKeypair) {
      console.warn(
        '[Escrow] WARNING: ESCROW_PRIVATE_KEY is not configured. Deposit verification and payouts will reject requests until configured.'
      );
    } else {
      console.log(`[Escrow] Vault PublicKey: ${this.escrowKeypair.publicKey.toBase58()}`);
    }

    if (!this.treasuryPubkey) {
      console.warn(
        '[Escrow] WARNING: DEV_TREASURY_WALLET is not configured. Rake will remain in Escrow Vault unless configured.'
      );
    } else {
      console.log(`[Escrow] Treasury PublicKey: ${this.treasuryPubkey.toBase58()}`);
    }
  }

  public getPublicInfo() {
    return {
      network: config.solanaNetwork,
      rpcUrl: config.solanaRpcUrl,
      escrowPublicKey: this.escrowKeypair?.publicKey.toBase58() ?? null,
      treasuryPublicKey: this.treasuryPubkey?.toBase58() ?? null,
      rakeBps: config.rakeBps,
      rakeMode: config.rakeMode,
      configured: Boolean(this.escrowKeypair),
    };
  }

  public getExplorerUrl(txSignature: string): string {
    const cluster = config.solanaNetwork === 'mainnet-beta' ? '' : `?cluster=${config.solanaNetwork}`;
    return `https://explorer.solana.com/tx/${txSignature}${cluster}`;
  }

  /**
   * Verifies a player's deposit transaction on-chain:
   * 1. Replay protection via unique txSignature in DB
   * 2. Confirms finality & zero errors on-chain
   * 3. Confirms sender wallet signed the transaction
   * 4. Confirms exact lamports transferred via parsed SystemProgram.transfer instructions
   *    AND postBalances - preBalances delta on the Escrow Vault.
   */
  public async verifyAndRecordDeposit(params: {
    walletAddress: string;
    lobbyId: LobbyTierId;
    txSignature: string;
  }): Promise<{ netLamports: number; rakeLamports: number }> {
    const { walletAddress, lobbyId, txSignature } = params;

    if (!this.escrowKeypair) {
      throw new Error('Server escrow wallet is not configured.');
    }

    const tier = LOBBY_TIERS[lobbyId];
    if (!tier) {
      throw new Error(`Invalid lobby tier: ${lobbyId}`);
    }

    let senderPubkey: PublicKey;
    try {
      senderPubkey = new PublicKey(walletAddress);
    } catch {
      throw new Error('Invalid Solana wallet address.');
    }

    // 1. Replay protection check
    const existing = await prisma.deposit.findUnique({ where: { txSignature } });
    if (existing) {
      throw new Error('Transaction signature has already been used.');
    }

    // 2. Fetch confirmed transaction from Solana RPC (retry briefly for propagation)
    let parsedTx = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      parsedTx = await this.connection.getParsedTransaction(txSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (parsedTx) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!parsedTx || !parsedTx.meta) {
      throw new Error('Transaction not found or not yet confirmed on Solana.');
    }

    if (parsedTx.meta.err !== null) {
      throw new Error('Solana transaction failed on-chain.');
    }

    // 3. Verify sender signed the transaction
    const accountKeys = parsedTx.transaction.message.accountKeys;
    const senderSigned = accountKeys.some(
      (k) => k.pubkey.equals(senderPubkey) && k.signer
    );
    if (!senderSigned) {
      throw new Error('Transaction was not signed by the claimed wallet address.');
    }

    // 4. Verify lamport balances credited to Escrow Vault & Treasury
    const grossLamports = tier.buyInLamports;
    const rakeLamports =
      config.rakeMode === 'entry' ? Math.floor((grossLamports * config.rakeBps) / 10000) : 0;
    const expectedNetLamports = grossLamports - rakeLamports;

    const escrowPubkey = this.escrowKeypair.publicKey;
    const escrowIdx = accountKeys.findIndex((k) => k.pubkey.equals(escrowPubkey));
    if (escrowIdx === -1) {
      throw new Error('Escrow Vault was not a recipient in this transaction.');
    }

    const escrowDelta =
      parsedTx.meta.postBalances[escrowIdx] - parsedTx.meta.preBalances[escrowIdx];

    // Also sum explicit SystemProgram transfer instructions for accuracy when sender === treasury
    let transferredToEscrow = 0;
    let transferredToTreasury = 0;

    for (const ix of parsedTx.transaction.message.instructions) {
      if ('parsed' in ix && ix.program === 'system' && ix.parsed?.type === 'transfer') {
        const info = ix.parsed.info as {
          source?: string;
          destination?: string;
          lamports?: number;
        };
        if (info.source === senderPubkey.toBase58() && typeof info.lamports === 'number') {
          if (info.destination === escrowPubkey.toBase58()) {
            transferredToEscrow += info.lamports;
          }
          if (this.treasuryPubkey && info.destination === this.treasuryPubkey.toBase58()) {
            transferredToTreasury += info.lamports;
          }
        }
      }
    }

    const isSenderTreasury = this.treasuryPubkey
      ? senderPubkey.equals(this.treasuryPubkey)
      : false;
    const isTreasuryEscrow = this.treasuryPubkey
      ? this.treasuryPubkey.equals(escrowPubkey)
      : false;

    const effectiveEscrowReceived = Math.max(escrowDelta, transferredToEscrow);

    if (this.treasuryPubkey && rakeLamports > 0 && !isTreasuryEscrow && !isSenderTreasury) {
      const treasuryIdx = accountKeys.findIndex((k) => k.pubkey.equals(this.treasuryPubkey!));
      const treasuryDelta =
        treasuryIdx !== -1
          ? parsedTx.meta.postBalances[treasuryIdx] - parsedTx.meta.preBalances[treasuryIdx]
          : 0;
      const effectiveTreasuryReceived = Math.max(treasuryDelta, transferredToTreasury);

      if (effectiveEscrowReceived < expectedNetLamports || effectiveTreasuryReceived < rakeLamports) {
        throw new Error(
          `Insufficient deposit amount. Expected ${expectedNetLamports} lamports to Escrow and ${rakeLamports} to Treasury.`
        );
      }
    } else {
      // Either no separate treasury, or sender IS the treasury wallet (so rake stays in their wallet)
      const requiredToEscrow = isTreasuryEscrow ? grossLamports : expectedNetLamports;
      if (effectiveEscrowReceived < requiredToEscrow) {
        throw new Error(
          `Insufficient deposit amount. Expected ${requiredToEscrow} lamports to Escrow Vault (received ${effectiveEscrowReceived}).`
        );
      }
    }

    // 5. Persist deposit & rake atomically
    await prisma.$transaction(async (tx) => {
      await tx.deposit.create({
        data: {
          wallet: walletAddress,
          lobbyTier: lobbyId,
          grossLamports: BigInt(grossLamports),
          netLamports: BigInt(expectedNetLamports),
          rakeLamports: BigInt(rakeLamports),
          txSignature,
          status: 'CONFIRMED',
        },
      });

      if (rakeLamports > 0) {
        await tx.rakeLedger.create({
          data: {
            source: 'ENTRY_RAKE',
            lobbyTier: lobbyId,
            amountLamports: BigInt(rakeLamports),
            txSignature,
          },
        });
      }
    });

    return { netLamports: expectedNetLamports, rakeLamports };
  }

  /**
   * Executes an automated SOL payout from the Escrow Vault to the player's wallet
   * after surviving the 5-second Cash-Out channeling countdown.
   */
  public async executeCashOut(params: {
    walletAddress: string;
    lobbyId: LobbyTierId;
    grossLamports: number;
  }): Promise<CashOutResult> {
    const { walletAddress, lobbyId, grossLamports } = params;

    if (!this.escrowKeypair) {
      throw new Error('Server escrow wallet is not configured.');
    }

    const recipient = new PublicKey(walletAddress);
    const rakeLamports =
      config.rakeMode === 'cashout' ? Math.floor((grossLamports * config.rakeBps) / 10000) : 0;
    const netLamports = Math.max(0, grossLamports - rakeLamports);

    if (netLamports <= 0) {
      throw new Error('Nothing to cash out (0 lamports).');
    }

    const cashOutRecord = await prisma.cashOut.create({
      data: {
        wallet: walletAddress,
        lobbyTier: lobbyId,
        grossLamports: BigInt(grossLamports),
        rakeLamports: BigInt(rakeLamports),
        netLamports: BigInt(netLamports),
        status: 'PENDING',
      },
    });

    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.escrowKeypair.publicKey,
          toPubkey: recipient,
          lamports: netLamports,
        })
      );

      if (
        rakeLamports > 0 &&
        this.treasuryPubkey &&
        !this.treasuryPubkey.equals(this.escrowKeypair.publicKey)
      ) {
        tx.add(
          SystemProgram.transfer({
            fromPubkey: this.escrowKeypair.publicKey,
            toPubkey: this.treasuryPubkey,
            lamports: rakeLamports,
          })
        );
      }

      const txSignature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.escrowKeypair],
        { commitment: 'confirmed' }
      );

      await prisma.$transaction(async (db) => {
        await db.cashOut.update({
          where: { id: cashOutRecord.id },
          data: { status: 'CONFIRMED', txSignature },
        });
        if (rakeLamports > 0) {
          await db.rakeLedger.create({
            data: {
              source: 'CASHOUT_RAKE',
              lobbyTier: lobbyId,
              amountLamports: BigInt(rakeLamports),
              txSignature,
            },
          });
        }
      });

      return {
        txSignature,
        grossSol: grossLamports / LAMPORTS_PER_SOL,
        rakeSol: rakeLamports / LAMPORTS_PER_SOL,
        netSol: netLamports / LAMPORTS_PER_SOL,
        explorerUrl: this.getExplorerUrl(txSignature),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Solana payout error';
      await prisma.cashOut.update({
        where: { id: cashOutRecord.id },
        data: { status: 'FAILED', errorMessage: message },
      });
      throw new Error(`Cash-out payout failed: ${message}`);
    }
  }
}

export const escrowService = new EscrowService();
