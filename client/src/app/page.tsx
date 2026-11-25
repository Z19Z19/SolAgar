'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  CashOutResult,
  GameStateSnapshot,
  KillFeedEvent,
  LobbyStats,
  LobbyTierId,
  PLAYER_SKINS,
} from '@shared/types';
import { getSocket } from '@/lib/socket';
import {
  EscrowPublicInfo,
  fetchEscrowInfo,
  sendBuyInTransaction,
} from '@/lib/solanaDeposit';
import { LobbyScreen } from '@/components/LobbyScreen';
import { GameCanvas } from '@/components/GameCanvas';
import { GameHUD } from '@/components/GameHUD';
import { CashOutModal } from '@/components/CashOutModal';

export default function HomePage() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [lobbies, setLobbies] = useState<LobbyStats[]>([]);
  const [escrowInfo, setEscrowInfo] = useState<EscrowPublicInfo | null>(null);
  const [selectedLobby, setSelectedLobby] = useState<LobbyTierId>('micro');
  const [username, setUsername] = useState('SolShark');
  const [skinId, setSkinId] = useState(PLAYER_SKINS[0].id);

  const [isJoining, setIsJoining] = useState(false);
  const [inArena, setInArena] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [hudSnapshot, setHudSnapshot] = useState<GameStateSnapshot | null>(null);
  const stateRef = useRef<GameStateSnapshot | null>(null);
  const [killFeed, setKillFeed] = useState<KillFeedEvent[]>([]);

  const [cashOutResult, setCashOutResult] = useState<CashOutResult | null>(null);
  const [eliminatedInfo, setEliminatedInfo] = useState<{
    killerName: string;
    bountySol: number;
  } | null>(null);

  const socket = getSocket();

  useEffect(() => {
    fetchEscrowInfo()
      .then(setEscrowInfo)
      .catch((err) => console.error('Failed to load escrow info:', err));
  }, []);

  useEffect(() => {
    const onLobbies = (stats: LobbyStats[]) => setLobbies(stats);

    const onJoined = (data: { playerId: string }) => {
      setMyPlayerId(data.playerId);
      setInArena(true);
      setIsJoining(false);
      setErrorMsg(null);
      setCashOutResult(null);
      setEliminatedInfo(null);
    };

    const onError = (data: { message: string }) => {
      setErrorMsg(data.message);
      setIsJoining(false);
    };

    const onState = (snap: GameStateSnapshot) => {
      stateRef.current = snap;
      setHudSnapshot(snap);
    };

    const onKill = (ev: KillFeedEvent) => {
      setKillFeed((prev) => [ev, ...prev].slice(0, 6));
    };

    const onCashOutSuccess = (res: CashOutResult) => {
      setInArena(false);
      setMyPlayerId(null);
      setCashOutResult(res);
    };

    const onCashOutError = (data: { message: string }) => {
      setInArena(false);
      setMyPlayerId(null);
      setErrorMsg(`Cash-Out error: ${data.message}`);
    };

    const onEliminated = (data: { killerName: string; bountySol: number }) => {
      setInArena(false);
      setMyPlayerId(null);
      setEliminatedInfo(data);
    };

    socket.on('lobbies:stats', onLobbies);
    socket.on('arena:joined', onJoined);
    socket.on('arena:error', onError);
    socket.on('arena:state', onState);
    socket.on('arena:kill', onKill);
    socket.on('cashout:success', onCashOutSuccess);
    socket.on('cashout:error', onCashOutError);
    socket.on('player:eliminated', onEliminated);

    return () => {
      socket.off('lobbies:stats', onLobbies);
      socket.off('arena:joined', onJoined);
      socket.off('arena:error', onError);
      socket.off('arena:state', onState);
      socket.off('arena:kill', onKill);
      socket.off('cashout:success', onCashOutSuccess);
      socket.off('cashout:error', onCashOutError);
      socket.off('player:eliminated', onEliminated);
    };
  }, [socket]);

  const handleJoinArena = useCallback(async () => {
    if (!publicKey || !escrowInfo) return;
    setErrorMsg(null);
    setIsJoining(true);

    try {
      const txSignature = await sendBuyInTransaction({
        connection,
        payer: publicKey,
        sendTransaction,
        lobbyId: selectedLobby,
        escrowInfo,
      });

      socket.emit('arena:join', {
        lobbyId: selectedLobby,
        username,
        walletAddress: publicKey.toBase58(),
        txSignature,
        skinId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deposit transaction failed.';
      setErrorMsg(message);
      setIsJoining(false);
    }
  }, [connection, escrowInfo, publicKey, selectedLobby, sendTransaction, skinId, socket, username]);

  const handleReturnToLobby = () => {
    setCashOutResult(null);
    setEliminatedInfo(null);
    stateRef.current = null;
    setHudSnapshot(null);
  };

  return (
    <>
      {inArena ? (
        <div className="relative w-screen h-screen overflow-hidden bg-[#07090e]">
          <GameCanvas socket={socket} stateRef={stateRef} myPlayerId={myPlayerId} />
          <GameHUD snapshot={hudSnapshot} killFeed={killFeed} socket={socket} />
        </div>
      ) : (
        <LobbyScreen
          lobbies={lobbies}
          escrowInfo={escrowInfo}
          selectedLobby={selectedLobby}
          onSelectLobby={setSelectedLobby}
          username={username}
          onChangeUsername={setUsername}
          skinId={skinId}
          onSelectSkin={setSkinId}
          onJoinArena={handleJoinArena}
          isJoining={isJoining}
          errorMsg={errorMsg}
        />
      )}

      <CashOutModal
        cashOutResult={cashOutResult}
        eliminatedInfo={eliminatedInfo}
        onReturnToLobby={handleReturnToLobby}
      />
    </>
  );
}
