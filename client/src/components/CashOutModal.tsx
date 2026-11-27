'use client';

import React from 'react';
import { CashOutResult } from '@shared/types';
import { CheckCircle2, ExternalLink, Skull } from 'lucide-react';

interface CashOutModalProps {
  cashOutResult: CashOutResult | null;
  eliminatedInfo: { killerName: string; bountySol: number } | null;
  onReturnToLobby: () => void;
}

export function CashOutModal({
  cashOutResult,
  eliminatedInfo,
  onReturnToLobby,
}: CashOutModalProps) {
  if (!cashOutResult && !eliminatedInfo) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="animate-modal-pop max-w-md w-full rounded-2xl border border-slate-800 bg-[#0e131f] p-6 shadow-2xl text-center">
        {cashOutResult ? (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-black text-white">
              {cashOutResult.isPractice ? 'Practice Run Complete!' : 'Cash-Out Complete!'}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {cashOutResult.isPractice
                ? 'You survived the 5-second Cash-Out channel in Sandbox Mode. Ready to play for real SOL?'
                : 'Your SOL has been settled on-chain to your connected wallet.'}
            </p>

            <div className="my-5 p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">
                  {cashOutResult.isPractice ? 'Virtual Score' : 'Gross Value'}
                </span>
                <span className="font-mono font-bold text-white">
                  {cashOutResult.grossSol.toFixed(4)} {cashOutResult.isPractice ? 'vSOL' : 'SOL'}
                </span>
              </div>
              {cashOutResult.rakeSol > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Platform Rake</span>
                  <span className="font-mono text-amber-400">
                    -{cashOutResult.rakeSol.toFixed(4)} SOL
                  </span>
                </div>
              )}
              <div className="border-t border-slate-800 pt-2 flex justify-between text-base">
                <span className="font-bold text-emerald-400">
                  {cashOutResult.isPractice ? 'Simulated Payout' : 'Net Payout'}
                </span>
                <span className="font-mono font-black text-emerald-400">
                  {cashOutResult.netSol.toFixed(4)} {cashOutResult.isPractice ? 'vSOL' : 'SOL'}
                </span>
              </div>
            </div>

            {!cashOutResult.isPractice && cashOutResult.explorerUrl && (
              <a
                href={cashOutResult.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 mb-5"
              >
                View Transaction on Solana Explorer <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </>
        ) : (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
              <Skull className="w-8 h-8 text-rose-400" />
            </div>
            <h2 className="text-2xl font-black text-white">Eliminated!</h2>
            <p className="text-sm text-slate-400 mt-2">
              You were absorbed by{' '}
              <span className="font-bold text-rose-400">{eliminatedInfo?.killerName}</span>.
            </p>
            <div className="my-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-mono text-rose-300">
              Bounty Lost: {eliminatedInfo?.bountySol.toFixed(4)} SOL
            </div>
          </>
        )}

        <button
          onClick={onReturnToLobby}
          className="w-full py-3.5 rounded-xl font-black text-sm bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 hover:opacity-95 transition"
        >
          RETURN TO LOBBY
        </button>
      </div>
    </div>
  );
}
