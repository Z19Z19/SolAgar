'use client';

import React, { useEffect, useRef } from 'react';
import { GameStateSnapshot, NetCell } from '@shared/types';
import { Socket } from 'socket.io-client';

interface GameCanvasProps {
  socket: Socket;
  stateRef: React.MutableRefObject<GameStateSnapshot | null>;
  myPlayerId: string | null;
}

interface InterpolatedCell extends NetCell {
  renderX: number;
  renderY: number;
  renderRadius: number;
  lastSeenTick: number;
}

export function GameCanvas({ socket, stateRef, myPlayerId }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef({ x: 2000, y: 2000, zoom: 0.9, initialized: false });
  const mouseRef = useRef({ x: 0, y: 0, initialized: false });
  const cHeldRef = useRef(false);
  const interpCellsRef = useRef<Map<string, InterpolatedCell>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (!mouseRef.current.initialized) {
        mouseRef.current.x = canvas.width / 2;
        mouseRef.current.y = canvas.height / 2;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const sendCurrentMouseVector = () => {
      const cam = cameraRef.current;
      // Convert screen offset from center into zoom-adjusted world offset vector (dx, dy)
      // Because this is relative to screen center, the cell never "catches up" and stalls
      // even if you hold your mouse completely still!
      const dx = (mouseRef.current.x - canvas.width / 2) / cam.zoom;
      const dy = (mouseRef.current.y - canvas.height / 2) / cam.zoom;
      socket.emit('player:move', { dx, dy });
    };

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY, initialized: true };
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        sendCurrentMouseVector();
        socket.emit('player:split');
      } else if (e.key === 'w' || e.key === 'W') {
        sendCurrentMouseVector();
        socket.emit('player:eject');
      } else if (e.key === 'c' || e.key === 'C') {
        if (!cHeldRef.current) {
          cHeldRef.current = true;
          socket.emit('cashout:start');
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') {
        if (cHeldRef.current) {
          cHeldRef.current = false;
          socket.emit('cashout:cancel');
        }
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Send relative steering vector at 60Hz
    const moveInterval = setInterval(sendCurrentMouseVector, 16);

    let animId = 0;
    let lastFrameTime = performance.now();

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      const snap = stateRef.current;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#07090e';
      ctx.fillRect(0, 0, w, h);

      if (!snap) return;

      // Interpolate cell positions smoothly at monitor refresh rate (60-144Hz+)
      const interpMap = interpCellsRef.current;
      const lerpFactor = 1 - Math.exp(-28 * dt); // Frame-rate independent exponential smoothing

      for (const netCell of snap.cells) {
        const existing = interpMap.get(netCell.id);
        if (!existing || Math.hypot(netCell.x - existing.renderX, netCell.y - existing.renderY) > 400) {
          interpMap.set(netCell.id, {
            ...netCell,
            renderX: netCell.x,
            renderY: netCell.y,
            renderRadius: netCell.radius,
            lastSeenTick: snap.tick,
          });
        } else {
          existing.x = netCell.x;
          existing.y = netCell.y;
          existing.radius = netCell.radius;
          existing.mass = netCell.mass;
          existing.lamports = netCell.lamports;
          existing.isCashingOut = netCell.isCashingOut;
          existing.cashoutProgress = netCell.cashoutProgress;
          existing.isDisconnected = netCell.isDisconnected;
          existing.isFreeEntry = netCell.isFreeEntry;
          existing.hasSpeedBoost = netCell.hasSpeedBoost;
          existing.renderX += (netCell.x - existing.renderX) * lerpFactor;
          existing.renderY += (netCell.y - existing.renderY) * lerpFactor;
          existing.renderRadius += (netCell.radius - existing.renderRadius) * lerpFactor;
          existing.lastSeenTick = snap.tick;
        }
      }

      // Prune cells not in current snapshot
      for (const [id, c] of interpMap.entries()) {
        if (c.lastSeenTick !== snap.tick) {
          interpMap.delete(id);
        }
      }

      // Compute interpolated center of player's own cells for locked-on smooth camera
      let mySumX = 0;
      let mySumY = 0;
      let myMassSum = 0;
      for (const c of interpMap.values()) {
        if (c.ownerId === myPlayerId) {
          mySumX += c.renderX * c.mass;
          mySumY += c.renderY * c.mass;
          myMassSum += c.mass;
        }
      }

      const targetCamX = myMassSum > 0 ? mySumX / myMassSum : snap.myCenterX;
      const targetCamY = myMassSum > 0 ? mySumY / myMassSum : snap.myCenterY;

      const targetZoom = Math.max(
        0.35,
        Math.min(1.0, 28 / Math.pow(Math.max(20, snap.myTotalMass), 0.35))
      );

      const cam = cameraRef.current;
      if (!cam.initialized) {
        cam.x = targetCamX;
        cam.y = targetCamY;
        cam.zoom = targetZoom;
        cam.initialized = true;
      } else {
        const camLerp = 1 - Math.exp(-24 * dt);
        const zoomLerp = 1 - Math.exp(-8 * dt);
        cam.x += (targetCamX - cam.x) * camLerp;
        cam.y += (targetCamY - cam.y) * camLerp;
        cam.zoom += (targetZoom - cam.zoom) * zoomLerp;
      }

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // 1. Spatial Grid Lines
      const gridSize = 100;
      const viewHalfW = w / 2 / cam.zoom + 100;
      const viewHalfH = h / 2 / cam.zoom + 100;
      const startX = Math.max(0, Math.floor((cam.x - viewHalfW) / gridSize) * gridSize);
      const endX = Math.min(snap.arenaSize, Math.ceil((cam.x + viewHalfW) / gridSize) * gridSize);
      const startY = Math.max(0, Math.floor((cam.y - viewHalfH) / gridSize) * gridSize);
      const endY = Math.min(snap.arenaSize, Math.ceil((cam.y + viewHalfH) / gridSize) * gridSize);

      ctx.strokeStyle = 'rgba(30, 41, 59, 0.55)';
      ctx.lineWidth = 1 / cam.zoom;
      ctx.beginPath();
      for (let x = startX; x <= endX; x += gridSize) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
      }
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
      }
      ctx.stroke();

      // 2. Arena Boundary
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, snap.arenaSize, snap.arenaSize);

      // 3. Pellets
      for (const p of snap.pellets) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        if (p.isEjected) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // 4. Viruses (spiky green cells)
      for (const v of snap.viruses) {
        drawVirus(ctx, v.x, v.y, v.radius);
      }

      // 5. Player Cells (sorted smallest to largest so big cells render on top)
      const sortedCells = Array.from(interpMap.values()).sort(
        (a, b) => a.renderRadius - b.renderRadius
      );
      const timeSec = now / 1000;

      for (const cell of sortedCells) {
        const cx = cell.renderX;
        const cy = cell.renderY;
        const cr = cell.renderRadius;

        // Cash-out beacon ring
        if (cell.isCashingOut) {
          const pulse = 1 + Math.sin(timeSec * 8) * 0.08;
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, (cr + 14) * pulse, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
          ctx.lineWidth = 4;
          ctx.setLineDash([10, 6]);
          ctx.stroke();

          // Progress arc
          ctx.beginPath();
          ctx.arc(
            cx,
            cy,
            cr + 22,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * cell.cashoutProgress
          );
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 5;
          ctx.setLineDash([]);
          ctx.stroke();
          ctx.restore();
        }

        // Active Speed Boost electric aura
        if (cell.hasSpeedBoost) {
          const boostPulse = 1 + Math.sin(timeSec * 14) * 0.06;
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, (cr + 8) * boostPulse, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
          ctx.lineWidth = 4;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 16;
          ctx.stroke();
          ctx.restore();
        }

        // Cell body
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fillStyle = cell.fill;
        ctx.fill();
        ctx.lineWidth = Math.max(3, cr * 0.08);
        if (cell.isFreeEntry) {
          ctx.setLineDash([8, 6]);
          ctx.strokeStyle = '#cbd5e1';
        } else {
          ctx.strokeStyle = cell.ownerId === myPlayerId ? '#ffffff' : cell.border;
        }
        ctx.stroke();
        ctx.restore();

        // Disconnected badge
        if (cell.isDisconnected) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fill();
        }

        // Floating text: Username + live SOL value (or FREE +BOOST badge)
        const fontSize = Math.max(12, Math.min(28, cr * 0.34));
        ctx.font = `800 ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';

        const nameY = cy - fontSize * 0.55;
        ctx.strokeText(cell.username, cx, nameY);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(cell.username, cx, nameY);

        const solText = cell.isFreeEntry
          ? 'FREE (+BOOST)'
          : `${(cell.lamports / 1_000_000_000).toFixed(3)} ${snap.isPractice ? 'vSOL' : 'SOL'}`;
        const solFontSize = Math.max(10, fontSize * 0.78);
        ctx.font = `700 ${solFontSize}px "JetBrains Mono", monospace`;
        const solY = cy + fontSize * 0.6;
        ctx.strokeText(solText, cx, solY);
        ctx.fillStyle = cell.isFreeEntry ? '#38bdf8' : '#6ee7b7';
        ctx.fillText(solText, cx, solY);
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(moveInterval);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [socket, stateRef, myPlayerId]);

  return <canvas ref={canvasRef} className="block w-screen h-screen cursor-crosshair" />;
}

function drawVirus(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const spikes = 20;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes;
    const r = i % 2 === 0 ? radius + 6 : radius - 4;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(34, 197, 94, 0.75)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#4ade80';
  ctx.stroke();
  ctx.restore();
}
