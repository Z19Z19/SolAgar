'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  CashOutResult,
  FreeTicketStatus,
  GameStateSnapshot,
  KillFeedEvent,
  LOBBY_TIERS,
  LobbyStats,
  LobbyTierId,
  PLAYER_SKINS,
} from '@shared/types';
import { getSocket } from '@/lib/socket';
import { getServerUrl } from '@/lib/serverUrl';
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
  const [freeTicketStatus, setFreeTicketStatus] = useState<FreeTicketStatus | null>(null);
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

  const refreshFreeTicketStatus = useCallback(() => {
    const query = publicKey ? `?wallet=${encodeURIComponent(publicKey.toBase58())}` : '';
    fetch(`${getServerUrl()}/api/free-ticket-status${query}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: FreeTicketStatus | null) => {
        if (data) setFreeTicketStatus(data);
      })
      .catch(() => {});
  }, [publicKey]);

  useEffect(() => {
    fetchEscrowInfo()
      .then(setEscrowInfo)
      .catch((err) => console.error('Failed to load escrow info:', err));
  }, []);

  useEffect(() => {
    refreshFreeTicketStatus();
  }, [refreshFreeTicketStatus, inArena]);

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

    let lastHudUpdate = 0;
    let lastCashoutFlag = false;

    const onState = (snap: GameStateSnapshot) => {
      stateRef.current = snap;
      const now = performance.now();
      // Update React HUD at 10Hz (every 100ms) or immediately on cash-out toggle
      // Saves ~80% React DOM/GC overhead while Canvas renders smoothly at 60-144Hz
      if (snap.isCashingOut !== lastCashoutFlag || now - lastHudUpdate >= 100) {
        lastCashoutFlag = snap.isCashingOut;
        lastHudUpdate = now;
        setHudSnapshot(snap);
      }
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
    const tier = LOBBY_TIERS[selectedLobby];
    setErrorMsg(null);
    setIsJoining(true);

    // Free Practice Sandbox: instant join without wallet or Solana deposit
    if (tier.isPractice) {
      socket.emit('arena:join', {
        lobbyId: selectedLobby,
        username,
        walletAddress: publicKey?.toBase58(),
        skinId,
      });
      return;
    }

    if (!publicKey || !escrowInfo) {
      setIsJoining(false);
      return;
    }

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

  const handleClaimFreeMicro = useCallback(async () => {
    if (!publicKey) return;
    setErrorMsg(null);
    setIsJoining(true);

    socket.emit('arena:join', {
      lobbyId: 'micro',
      username,
      walletAddress: publicKey.toBase58(),
      skinId,
      isFreeEntry: true,
    });
  }, [publicKey, skinId, socket, username]);

  const handleReturnToLobby = () => {
    setCashOutResult(null);
    setEliminatedInfo(null);
    stateRef.current = null;
    setHudSnapshot(null);
    refreshFreeTicketStatus();
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
          freeTicketStatus={freeTicketStatus}
          selectedLobby={selectedLobby}
          onSelectLobby={setSelectedLobby}
          username={username}
          onChangeUsername={setUsername}
          skinId={skinId}
          onSelectSkin={setSkinId}
          onJoinArena={handleJoinArena}
          onClaimFreeMicro={handleClaimFreeMicro}
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
