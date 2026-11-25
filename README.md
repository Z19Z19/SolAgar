# SolAgar — High-Stakes Solana Multiplayer Arena

A production-ready, full-stack Web3 multiplayer Agar.io clone built with **Next.js 15**, **Tailwind CSS**, **HTML5 Canvas**, **Node.js + Socket.io**, **Prisma (SQLite/PostgreSQL)**, and **Solana Web3.js**.

---

## 1. Architecture Plan

SolAgar uses a **Session Escrow Architecture** to deliver 30Hz–60FPS real-time gameplay without requiring on-chain transactions for every kill:

1. **Deposit & Verification (Entry):**
   - Player connects a Solana wallet (Phantom, Solflare, Backpack) via Solana Wallet Adapter.
   - Player signs a single `SystemProgram.transfer` transaction depositing the lobby buy-in (`0.05`, `0.25`, or `1.0` SOL). When `RAKE_MODE=entry`, the transaction atomically splits `95%` to the **Escrow Vault** and `5%` (`RAKE_BPS=500`) to `DEV_TREASURY_WALLET`.
   - The server verifies the transaction signature on-chain (`confirmed` finality, signer match, exact lamport deltas, and SQLite/PostgreSQL `Deposit.txSignature` replay protection) before spawning the player.

2. **Authoritative Game Server (30Hz):**
   - All movement, velocity caps, Quadtree spatial partitioning, pellet/virus/cell collisions, cell splitting, merging cooldowns, mass decay, and SOL bounty transfers run strictly on the server.
   - **Interest Management:** Each client only receives entities within its dynamic viewport bounds.
   - **15s Disconnect Protection:** Disconnected players' cells remain vulnerable in the arena for 15 seconds rather than vanishing instantly.

3. **5-Second Cash-Out Channel & Automated Payout:**
   - Holding `C` (or the Cash Out button) starts a 5-second channeling countdown.
   - Splitting and ejecting are disabled, and a pulsing beacon/progress ring is broadcast to nearby players.
   - Surviving all 5 seconds despawns the player's cells and triggers an automated `SystemProgram.transfer` payout from the Escrow Vault to the player's wallet, returning the Solana Explorer link.

---

## 2. Folder Structure

```text
solagar/
├── package.json                  # Root monorepo scripts (`npm run dev`, `build`, `typecheck`)
├── README.md
├── shared/
│   └── types.ts                  # Shared lobby tiers, skins, and Socket.io payload types
├── server/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   └── schema.prisma         # Deposit, KillEvent, CashOut, RakeLedger, AntiCheatFlag
│   └── src/
│       ├── index.ts              # Express REST API + Socket.io server
│       ├── config.ts             # Environment & physics constants
│       ├── db/prisma.ts          # Prisma client singleton
│       ├── solana/
│       │   └── escrowService.ts  # On-chain deposit verification & automated SOL payouts
│       └── game/
│           ├── Quadtree.ts       # Spatial partitioning Quadtree
│           ├── Arena.ts          # 30Hz authoritative physics, economy ledger & anti-cheat
│           └── LobbyManager.ts   # Multi-tier lobby coordinator (Micro, Standard, Whale)
└── client/
    ├── .env.example
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── tailwind.config.ts
    └── src/
        ├── app/
        │   ├── layout.tsx        # Root layout with Solana WalletProvider
        │   ├── page.tsx          # Main lobby/game state orchestrator
        │   └── globals.css
        ├── components/
        │   ├── WalletProvider.tsx
        │   ├── LobbyScreen.tsx   # Tier selection, skin picker, Devnet faucet, leaderboard
        │   ├── GameCanvas.tsx    # 60 FPS HTML5 Canvas renderer
        │   ├── GameHUD.tsx       # Live SOL HUD, kill feed, radial Cash-Out button
        │   └── CashOutModal.tsx  # Settlement receipt & elimination modal
        └── lib/
            ├── socket.ts
            └── solanaDeposit.ts  # Atomic buy-in transaction builder
```

---

## 3. Exact Math: Mass-to-SOL Proportional Splitting

All in-game SOL balances are tracked in **integer lamports** ($1\text{ SOL} = 10^9\text{ lamports}$) to eliminate floating-point rounding drift.

1. **Spawn:**
   - Player enters with net staked lamports $L_{\text{entry}}$ and initial mass $M_0 = 20$.
2. **Splitting (`Space`):**
   - A cell with mass $M \ge 36$ and lamports $L$ splits into two cells with masses:
     $$M_1 = \lfloor M / 2 \rfloor, \quad M_2 = M - M_1$$
   - Lamports are distributed proportionally by mass, with integer remainder conservation:
     $$L_2 = \left\lfloor \frac{L \cdot M_2}{M} \right\rfloor, \quad L_1 = L - L_2$$
   - Invariant: $L_1 + L_2 = L$ is always conserved to the exact lamport.
3. **Merging:**
   - After the merge cooldown ($15\text{s} + 20\text{ms} \times M$), two own cells merge into one:
     $$M_{\text{merged}} = M_1 + M_2, \quad L_{\text{merged}} = L_1 + L_2$$
4. **Bounty Absorption:**
   - When Cell A eats enemy Cell B ($M_A > 1.15 M_B$ and $\text{dist}(A,B) < R_A - 0.4 R_B$), Cell B's exact $L_B$ transfers to Cell A:
     $$L_A' = L_A + L_B$$
   - Eating neutral map pellets increases mass $M$ without creating new lamports, ensuring total SOL in the arena never inflates beyond actual deposits.

---

## 4. Local Setup & Running

1. **Install dependencies:**
   ```bash
   npm run install:all
   ```
2. **Configure environment variables:**
   - Copy `server/.env.example` to `server/.env` and set `ESCROW_PRIVATE_KEY` and `DEV_TREASURY_WALLET`.
   - Copy `client/.env.example` to `client/.env.local`.
3. **Initialize the SQLite database:**
   ```bash
   npm run prisma:generate && npm run prisma:push
   ```
4. **Start both client and server with a single command:**
   ```bash
   npm run dev
   ```
   - Frontend: `http://localhost:3000`
   - Game Server: `http://localhost:4000`
