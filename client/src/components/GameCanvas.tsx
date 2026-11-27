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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

interface FloatingPopup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

const MAX_PARTICLES = 72;
const MAX_SHOCKWAVES = 16;
const MAX_POPUPS = 12;

export function GameCanvas({ socket, stateRef, myPlayerId }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef({ x: 2000, y: 2000, zoom: 0.9, initialized: false });
  const pointerRef = useRef({ x: 0, y: 0, initialized: false });
  const cHeldRef = useRef(false);
  const interpCellsRef = useRef<Map<string, InterpolatedCell>>(new Map());
  const prevPelletsRef = useRef<Map<string, { x: number; y: number; color: string }>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // alpha: false lets the browser skip compositing transparency behind the full-screen canvas
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const particles: Particle[] = [];
    const shockwaves: Shockwave[] = [];
    const popups: FloatingPopup[] = [];
    let lastProcessedTick = -1;
    let lastMyLamports = -1;
    let lastMyBoost = false;

    const spawnBurst = (x: number, y: number, color: string, count: number, speed: number, radius = 4) => {
      for (let i = 0; i < count; i++) {
        if (particles.length >= MAX_PARTICLES) particles.shift();
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
        const spd = speed * (0.55 + Math.random() * 0.7);
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          radius: radius * (0.7 + Math.random() * 0.5),
          color,
          life: 0,
          maxLife: 0.35 + Math.random() * 0.25,
        });
      }
    };

    const spawnShockwave = (x: number, y: number, startR: number, maxR: number, color: string) => {
      if (shockwaves.length >= MAX_SHOCKWAVES) shockwaves.shift();
      shockwaves.push({
        x,
        y,
        radius: startR,
        maxRadius: maxR,
        color,
        life: 0,
        maxLife: 0.42,
      });
    };

    const spawnPopup = (x: number, y: number, text: string, color: string) => {
      if (popups.length >= MAX_POPUPS) popups.shift();
      popups.push({
        x,
        y,
        text,
        color,
        life: 0,
        maxLife: 1.15,
      });
    };

    let cssWidth = window.innerWidth;
    let cssHeight = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      cssWidth = window.innerWidth;
      cssHeight = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      if (!pointerRef.current.initialized) {
        pointerRef.current.x = cssWidth / 2;
        pointerRef.current.y = cssHeight / 2;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const sendCurrentVector = () => {
      const cam = cameraRef.current;
      const dx = (pointerRef.current.x - cssWidth / 2) / cam.zoom;
      const dy = (pointerRef.current.y - cssHeight / 2) / cam.zoom;
      socket.emit('player:move', { dx, dy });
    };

    const onMouseMove = (e: MouseEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY, initialized: true };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const t = e.touches[0];
        pointerRef.current = { x: t.clientX, y: t.clientY, initialized: true };
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        sendCurrentVector();
        socket.emit('player:split');
      } else if (e.key === 'w' || e.key === 'W') {
        sendCurrentVector();
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

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    canvas.addEventListener('touchstart', onTouchMove, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Send relative steering vector at 30Hz (matches 30Hz snapshot cadence cleanly without flooding mobile)
    const moveInterval = setInterval(sendCurrentVector, 28);

    let animId = 0;
    let lastFrameTime = performance.now();

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
      lastFrameTime = now;

      const snap = stateRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#07090e';
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      if (!snap) return;

      const interpMap = interpCellsRef.current;
      const isNewTick = snap.tick !== lastProcessedTick;

      // Detect lightweight visual events once per incoming server snapshot
      if (isNewTick) {
        lastProcessedTick = snap.tick;

        // 1. Detect bounty gain or speed boost activation for floating popups
        if (lastMyLamports >= 0 && snap.myTotalLamports > lastMyLamports) {
          const gainSol = (snap.myTotalLamports - lastMyLamports) / 1_000_000_000;
          spawnPopup(
            snap.myCenterX,
            snap.myCenterY - 36,
            `+${gainSol.toFixed(3)} ${snap.isPractice ? 'vSOL' : 'SOL'}`,
            '#34d399'
          );
          spawnShockwave(snap.myCenterX, snap.myCenterY, 24, 130, '#34d399');
        }
        lastMyLamports = snap.myTotalLamports;

        const hasBoostNow = snap.speedBoostRemainingMs > 0;
        if (hasBoostNow && !lastMyBoost) {
          spawnPopup(snap.myCenterX, snap.myCenterY - 58, '⚡ SPEED BOOST +25%', '#38bdf8');
          spawnShockwave(snap.myCenterX, snap.myCenterY, 20, 140, '#38bdf8');
        }
        lastMyBoost = hasBoostNow;

        // 2. Detect eaten pellets near camera for tiny sparkle bursts (max 3 bursts per tick)
        const prevPellets = prevPelletsRef.current;
        if (prevPellets.size > 0) {
          const currentPelletIds = new Set<string>();
          for (let i = 0; i < snap.pellets.length; i++) {
            currentPelletIds.add(snap.pellets[i].id);
          }
          let burstCount = 0;
          for (const [id, p] of prevPellets.entries()) {
            if (!currentPelletIds.has(id) && burstCount < 3) {
              // Only pop sparkle if near any visible cell (i.e. actually eaten, not culled)
              for (const c of interpMap.values()) {
                const dx = p.x - c.renderX;
                const dy = p.y - c.renderY;
                const rLimit = c.renderRadius + 24;
                if (dx * dx + dy * dy < rLimit * rLimit) {
                  spawnBurst(p.x, p.y, p.color, 3, 95, 3.2);
                  burstCount++;
                  break;
                }
              }
            }
          }
        }
        prevPellets.clear();
        for (let i = 0; i < snap.pellets.length; i++) {
          const p = snap.pellets[i];
          prevPellets.set(p.id, { x: p.x, y: p.y, color: p.color });
        }
      }

      // Interpolate cell positions smoothly at monitor refresh rate (60-144Hz+)
      const lerpFactor = 1 - Math.exp(-24 * dt);

      for (let i = 0; i < snap.cells.length; i++) {
        const netCell = snap.cells[i];
        const existing = interpMap.get(netCell.id);
        if (!existing || Math.hypot(netCell.x - existing.renderX, netCell.y - existing.renderY) > 400) {
          // Newly spawned or split cell -> light pop ring
          if (isNewTick && interpMap.size > 0 && netCell.ownerId === myPlayerId) {
            spawnShockwave(netCell.x, netCell.y, netCell.radius * 0.6, netCell.radius * 1.9, netCell.border);
          }
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

      // Prune cells not in current snapshot (trigger crisp absorption burst if eaten inside viewport)
      for (const [id, c] of interpMap.entries()) {
        if (c.lastSeenTick !== snap.tick) {
          if (isNewTick) {
            spawnBurst(c.renderX, c.renderY, c.fill, 8, 170, Math.min(7, c.renderRadius * 0.16));
            spawnShockwave(c.renderX, c.renderY, c.renderRadius * 0.5, c.renderRadius * 2.1, c.border);
          }
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
        const camLerp = 1 - Math.exp(-20 * dt);
        const zoomLerp = 1 - Math.exp(-7 * dt);
        cam.x += (targetCamX - cam.x) * camLerp;
        cam.y += (targetCamY - cam.y) * camLerp;
        cam.zoom += (targetZoom - cam.zoom) * zoomLerp;
      }

      // Visible world viewport bounds for fast frustum culling
      const viewHalfW = cssWidth / 2 / cam.zoom + 80;
      const viewHalfH = cssHeight / 2 / cam.zoom + 80;
      const minVisX = cam.x - viewHalfW;
      const maxVisX = cam.x + viewHalfW;
      const minVisY = cam.y - viewHalfH;
      const maxVisY = cam.y + viewHalfH;

      ctx.save();
      ctx.translate(cssWidth / 2, cssHeight / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // 1. Spatial Grid Lines
      const gridSize = 100;
      const startX = Math.max(0, Math.floor(minVisX / gridSize) * gridSize);
      const endX = Math.min(snap.arenaSize, Math.ceil(maxVisX / gridSize) * gridSize);
      const startY = Math.max(0, Math.floor(minVisY / gridSize) * gridSize);
      const endY = Math.min(snap.arenaSize, Math.ceil(maxVisY / gridSize) * gridSize);

      ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
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

      // 3. Pellets (frustum culled)
      for (let i = 0; i < snap.pellets.length; i++) {
        const p = snap.pellets[i];
        if (p.x < minVisX || p.x > maxVisX || p.y < minVisY || p.y > maxVisY) continue;
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

      // 4. Lightweight Shockwaves (behind cells)
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.life += dt;
        if (sw.life >= sw.maxLife) {
          shockwaves.splice(i, 1);
          continue;
        }
        const t = sw.life / sw.maxLife;
        const easeOut = 1 - (1 - t) * (1 - t);
        const r = sw.radius + (sw.maxRadius - sw.radius) * easeOut;
        ctx.globalAlpha = (1 - t) * 0.75;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = Math.max(1.5, 4 * (1 - t));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 5. Lightweight Burst Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.life += dt;
        if (pt.life >= pt.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        const damp = Math.pow(0.06, dt);
        pt.vx *= damp;
        pt.vy *= damp;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        const t = pt.life / pt.maxLife;
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius * (1 - t * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = pt.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const timeSec = now / 1000;

      // 6. Viruses (spiky green cells with gentle rotation, frustum culled)
      for (let i = 0; i < snap.viruses.length; i++) {
        const v = snap.viruses[i];
        if (
          v.x + v.radius < minVisX ||
          v.x - v.radius > maxVisX ||
          v.y + v.radius < minVisY ||
          v.y - v.radius > maxVisY
        ) {
          continue;
        }
        drawVirus(ctx, v.x, v.y, v.radius, timeSec * 0.25 + (i % 5));
      }

      // 7. Player Cells (sorted smallest to largest so big cells render on top)
      const sortedCells = Array.from(interpMap.values()).sort(
        (a, b) => a.renderRadius - b.renderRadius
      );

      for (let i = 0; i < sortedCells.length; i++) {
        const cell = sortedCells[i];
        const cx = cell.renderX;
        const cy = cell.renderY;
        const cr = cell.renderRadius;

        if (cx + cr + 30 < minVisX || cx - cr - 30 > maxVisX || cy + cr + 30 < minVisY || cy - cr - 30 > maxVisY) {
          continue;
        }

        // Cash-out beacon ring
        if (cell.isCashingOut) {
          const pulse = 1 + Math.sin(timeSec * 8) * 0.06;
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, (cr + 13) * pulse, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
          ctx.lineWidth = 4;
          ctx.setLineDash([10, 6]);
          ctx.stroke();

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

        // Active Speed Boost electric aura (lightweight concentric rings, zero shadowBlur lag)
        if (cell.hasSpeedBoost) {
          const boostPulse = 1 + Math.sin(timeSec * 14) * 0.05;
          ctx.beginPath();
          ctx.arc(cx, cy, (cr + 11) * boostPulse, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
          ctx.lineWidth = 7;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(cx, cy, (cr + 7) * boostPulse, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
          ctx.lineWidth = 3;
          ctx.stroke();
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

        // Subtle top-left specular highlight for crisp glossy depth (super cheap 1 arc)
        ctx.beginPath();
        ctx.arc(cx - cr * 0.28, cy - cr * 0.28, cr * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.fill();

        // Disconnected overlay
        if (cell.isDisconnected) {
          ctx.beginPath();
          ctx.arc(cx, cy, cr, 0, Math.PI * 2);
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

      // 8. Floating Gain Popups (+SOL / ⚡ SPEED BOOST)
      for (let i = popups.length - 1; i >= 0; i--) {
        const pop = popups[i];
        pop.life += dt;
        if (pop.life >= pop.maxLife) {
          popups.splice(i, 1);
          continue;
        }
        const t = pop.life / pop.maxLife;
        const yOffset = -42 * (1 - (1 - t) * (1 - t));
        ctx.globalAlpha = t < 0.7 ? 1 : (1 - t) / 0.3;
        ctx.font = '800 18px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
        ctx.strokeText(pop.text, pop.x, pop.y + yOffset);
        ctx.fillStyle = pop.color;
        ctx.fillText(pop.text, pop.x, pop.y + yOffset);
      }
      ctx.globalAlpha = 1;

      ctx.restore();
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(moveInterval);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('touchstart', onTouchMove);
      canvas.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [socket, stateRef, myPlayerId]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-screen h-screen cursor-crosshair touch-none"
    />
  );
}

function drawVirus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number
) {
  const spikes = 18;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = rotation + (i * Math.PI) / spikes;
    const r = i % 2 === 0 ? radius + 6 : radius - 4;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(34, 197, 94, 0.72)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#4ade80';
  ctx.stroke();
}
