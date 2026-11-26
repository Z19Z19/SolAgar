import crypto from 'crypto';
import { PublicKey } from '@solana/web3.js';
import { FreeTicketStatus } from '@shared/types';
import { prisma } from '../db/prisma';

export const MAX_CONCURRENT_FREE_PLAYERS = 4;

export function getUtcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(`solagar-free:${ip}`).digest('hex');
}

export async function checkFreeTicketStatus(params: {
  wallet?: string;
  ip: string;
  activeFreePlayers: number;
}): Promise<FreeTicketStatus> {
  const { wallet, ip, activeFreePlayers } = params;
  const dayKey = getUtcDayKey();
  const ipHash = hashIp(ip);

  if (activeFreePlayers >= MAX_CONCURRENT_FREE_PLAYERS) {
    return {
      eligible: false,
      reason: `Free Ticket slots full (${activeFreePlayers}/${MAX_CONCURRENT_FREE_PLAYERS}). Try again shortly or buy in!`,
      activeFreePlayers,
      maxFreePlayers: MAX_CONCURRENT_FREE_PLAYERS,
      dayKey,
    };
  }

  const orClauses: Array<{ ipHash: string; dayKey: string } | { wallet: string; dayKey: string }> = [
    { ipHash, dayKey },
  ];
  if (wallet && wallet.trim().length >= 32) {
    orClauses.push({ wallet: wallet.trim(), dayKey });
  }

  const existing = await prisma.dailyFreeEntry.findFirst({
    where: { OR: orClauses },
  });

  if (existing) {
    return {
      eligible: false,
      reason: 'Daily Free Ticket already used today. Resets at 00:00 UTC.',
      activeFreePlayers,
      maxFreePlayers: MAX_CONCURRENT_FREE_PLAYERS,
      dayKey,
    };
  }

  return {
    eligible: true,
    activeFreePlayers,
    maxFreePlayers: MAX_CONCURRENT_FREE_PLAYERS,
    dayKey,
  };
}

export async function claimDailyFreeTicket(params: {
  wallet: string;
  ip: string;
  activeFreePlayers: number;
}): Promise<void> {
  const { wallet, ip, activeFreePlayers } = params;

  try {
    new PublicKey(wallet);
  } catch {
    throw new Error('Connect a valid Solana wallet to claim your Daily Free Ticket.');
  }

  const status = await checkFreeTicketStatus({ wallet, ip, activeFreePlayers });
  if (!status.eligible) {
    throw new Error(status.reason || 'Not eligible for Daily Free Ticket today.');
  }

  const dayKey = getUtcDayKey();
  const ipHash = hashIp(ip);

  try {
    await prisma.dailyFreeEntry.create({
      data: {
        wallet,
        ipHash,
        dayKey,
      },
    });
  } catch {
    throw new Error('Daily Free Ticket has already been claimed for this wallet or IP today.');
  }
}
