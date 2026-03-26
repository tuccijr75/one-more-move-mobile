/**
 * One More Move — Game Engine Module
 * Adapted from tuccijr75/One-More-Move (game.js)
 * Refactored as a self-contained module with no DOM dependencies.
 */

// ========================= TYPES =========================
export interface Position { x: number; y: number; }

export interface Enemy extends Position {
  phase: number;
  intent: { dx: number; dy: number } | null;
  intentLock: number;
  stunned: number;
}

export interface GameTokens {
  diag: number;
  wall: number;
  freeze: number;
  timeFreeze: number;
}

export interface GameEffects {
  intentTiles: Set<string> | null;
  freezeUntil: number;
  killer: Position | null;
  lastEnemyTurn: number;
  stageFx: { startMs: number; durationMs: number; x: number; y: number } | null;
  stageBannerUntil: number;
  statusUntil: number;
  statusText: string;
}

export interface GameState {
  player: Position;
  walls: Set<string>;
  enemies: Enemy[];
  turns: number;
  best: number;
  nextSpawnTurn: number;
  gameOver: boolean;
  inputLocked: boolean;
  holdSpace: boolean;
  holdMovesLeft: number;
  holdStepsUsed: number;
  playerTrail: string[];
  stage: number;
  portal: Position | null;
  nextPortalAtTurn: number;
  hasExtraLife: boolean;
  rewardCooldownUntil: number;
  phaseUsed: boolean;
  phaseArmed: boolean;
  tokens: GameTokens;
  freezeNext: boolean;
  wallIgnoreArmed: boolean;
  payingDebt: boolean;
  turnDebt: number;
  seed: number;
  seedMode: string;
  effects: GameEffects;
}

export type Difficulty = 'standard' | 'hard' | 'hardcore';

export interface HudData {
  turns: number;
  best: number;
  stage: number;
  difficulty: string;
  seed: number;
  seedMode: string;
  tokens: GameTokens;
  phaseUsed: boolean;
  phaseArmed: boolean;
  wallIgnoreArmed: boolean;
  holdSpace: boolean;
  holdMovesLeft: number;
  gameOver: boolean;
  rewardCooldownUntil: number;
}

export interface GameOverData {
  turns: number;
  cause: string;
  seed: number;
  seedMode: string;
}

export interface EngineCallbacks {
  onHudUpdate: (data: HudData) => void;
  onGameOver: (data: GameOverData) => void;
  onStageBanner: (stage: number) => void;
}

// ========================= SETTINGS =========================
const SETTINGS_VERSION = 1;

const memoryStore: {
  settings: Record<string, any>;
  difficulty: string;
  bestScores: Record<string, number>;
  muted: boolean;
} = {
  settings: {},
  difficulty: 'standard',
  bestScores: {},
  muted: false,
};

const DEFAULT_TUNING = {
  version: SETTINGS_VERSION,
  walls: 10,
  initialEnemies: 2,
  initialSpawn: 10,
  rampSpeed: 15,
  escapePenalty: 1.5,
  gapFillBonus: 3.0,
};

function tuningKey() { return `one-more-move-tuning-v${SETTINGS_VERSION}`; }

function loadTuning() {
  const raw = memoryStore.settings[tuningKey()];
  if (!raw || typeof raw !== 'object') {
    saveTuning(DEFAULT_TUNING);
    return { ...DEFAULT_TUNING };
  }
  return { ...DEFAULT_TUNING, ...raw };
}

function saveTuning(tuning: any) {
  memoryStore.settings[tuningKey()] = { ...tuning };
}

// ========================= CONSTANTS =========================
const GRID_SIZE = 10;
const CELL_SIZE = 60;
const INTENT_FLASH_MS = 100;
const DEATH_FREEZE_MS = 280;
const WALL_ADD_EVERY_STAGES = 5;
const WALL_MAX = 30;

const BASE_DIFFICULTY_CONFIG: Record<string, any> = {
  standard: { turnDelay: 150, showIntentFlash: true, escapePenalty: 1.5, gapFillBonus: 3.0, spawnFloor: 3, dangerFeedback: true },
  hard: { turnDelay: 120, showIntentFlash: true, escapePenalty: 2.0, gapFillBonus: 3.5, spawnFloor: 3, dangerFeedback: true },
  hardcore: { turnDelay: 80, showIntentFlash: false, escapePenalty: 2.5, gapFillBonus: 4.0, spawnFloor: 2, dangerFeedback: false },
};

// ========================= ENGINE CLASS =========================
export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: EngineCallbacks;

  private WALL_COUNT = 10;
  private INITIAL_ENEMIES = 2;
  private stateSpawnInitial = DEFAULT_TUNING.initialSpawn;
  private stateRampSpeed = DEFAULT_TUNING.rampSpeed;

  private rng: (() => number) | null = null;
  state: GameState | null = null;
  difficulty: Difficulty = 'standard';
  muted = false;
  private audioContext: AudioContext | null = null;
  private tuning = { ...DEFAULT_TUNING };
  private effectiveCfg: any = null;
  private animationRunning = false;
  private animFrameId = 0;
  private cellSize = CELL_SIZE;

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.callbacks = callbacks;
  }

  // ========================= PUBLIC API =========================

  boot() {
    this.initPreferences();
    this.applySettings();
    this.initState({ seed: this.randomSeed(), seedMode: 'RUN' });
  }

  destroy() {
    this.animationRunning = false;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
  }

  resize(width: number, height: number) {
    const size = Math.min(width, height);
    this.cellSize = size / GRID_SIZE;
    this.canvas.width = size;
    this.canvas.height = size;
    if (this.state && !this.state.gameOver) this.render();
  }

  move(dx: number, dy: number) {
    this.attemptMove(dx, dy);
  }

  tapTile(gridX: number, gridY: number) {
    if (!this.state || this.state.gameOver || this.state.inputLocked) return;
    const dx = gridX - this.state.player.x;
    const dy = gridY - this.state.player.y;
    // Only adjacent tiles (including diag if token available)
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return;
    if (dx === 0 && dy === 0) return;
    // Diagonal requires token
    if (dx !== 0 && dy !== 0) {
      if (this.state.tokens.diag <= 0) return;
      const now = performance.now();
      if (now < this.state.rewardCooldownUntil) return;
      this.state.tokens.diag = 0;
      this.state.rewardCooldownUntil = now + 30000;
      this.updateHud();
    }
    this.attemptMove(dx, dy);
  }

  screenToGrid(screenX: number, screenY: number): Position {
    return {
      x: Math.floor(screenX / this.cellSize),
      y: Math.floor(screenY / this.cellSize),
    };
  }

  armDiagonal() {
    if (!this.state || this.state.gameOver) return false;
    // Diagonal is used via tap on diagonal tile, not armed separately
    return false;
  }

  armWallIgnore() {
    if (!this.state || this.state.gameOver || this.state.inputLocked) return false;
    const now = performance.now();
    if (this.state.tokens.wall <= 0 || this.state.wallIgnoreArmed || now < this.state.rewardCooldownUntil) return false;
    this.state.tokens.wall = 0;
    this.state.wallIgnoreArmed = true;
    this.state.rewardCooldownUntil = now + 30000;
    this.updateHud();
    return true;
  }

  armPhaseStep() {
    if (!this.state || this.state.gameOver || this.state.inputLocked) return false;
    const now = performance.now();
    if (this.state.phaseUsed || this.state.phaseArmed || now < this.state.rewardCooldownUntil) return false;
    this.state.phaseArmed = true;
    this.state.rewardCooldownUntil = now + 30000;
    this.updateHud();
    return true;
  }

  useFreeze() {
    if (!this.state || this.state.gameOver || this.state.inputLocked) return false;
    const now = performance.now();
    if (this.state.tokens.freeze <= 0 || this.state.holdSpace || now < this.state.rewardCooldownUntil) return false;
    if (this.state.effects.lastEnemyTurn === this.state.turns) return false;
    this.state.tokens.freeze = 0;
    this.state.freezeNext = true;
    this.state.rewardCooldownUntil = now + 30000;
    this.updateHud();
    return true;
  }

  useTimeFreeze() {
    if (!this.state || this.state.gameOver || this.state.inputLocked) return false;
    const now = performance.now();
    if (this.state.holdSpace) return false;
    if ((this.state.tokens.timeFreeze ?? 0) <= 0) return false;
    this.state.tokens.timeFreeze = 0;
    this.state.rewardCooldownUntil = now + 30000;
    this.state.holdSpace = true;
    this.state.holdMovesLeft = 2;
    this.state.holdStepsUsed = 0;
    this.updateHud();
    return true;
  }

  releaseTimeFreeze() {
    if (!this.state || !this.state.holdSpace) return;
    this.state.holdSpace = false;
    if (this.state.holdStepsUsed > 0) {
      this.state.turnDebt += 1;
      if (!this.state.inputLocked) {
        this.payTurnDebtAsync();
      } else {
        this.state.inputLocked = false;
        this.payTurnDebtAsync();
      }
    }
    this.state.holdMovesLeft = 2;
    this.state.holdStepsUsed = 0;
    this.updateHud();
  }

  setDifficultyLevel(d: Difficulty) {
    if (!BASE_DIFFICULTY_CONFIG[d]) return;
    this.difficulty = d;
    this.recomputeEffectiveConfig();
    memoryStore.difficulty = d;
    this.updateHud();
  }

  replaySeed() {
    if (!this.state) return;
    this.applySettings();
    this.initState({ seed: this.state.seed, seedMode: 'REPLAY' });
  }

  newRun() {
    this.applySettings();
    this.initState({ seed: this.randomSeed(), seedMode: 'NEW' });
  }

  manualSeedRunWith(seed: number) {
    this.applySettings();
    this.initState({ seed, seedMode: 'MANUAL' });
  }

  dailySeed() {
    this.applySettings();
    this.initState({ seed: Math.floor(Date.now() / 86400000), seedMode: 'DAILY' });
  }

  toggleMute() {
    this.muted = !this.muted;
    memoryStore.muted = this.muted;
    return this.muted;
  }

  getHudData(): HudData | null {
    if (!this.state) return null;
    return {
      turns: this.state.turns,
      best: this.state.best,
      stage: this.state.stage,
      difficulty: this.difficulty.toUpperCase(),
      seed: this.state.seed,
      seedMode: String(this.state.seedMode || 'RUN').toUpperCase(),
      tokens: { ...this.state.tokens },
      phaseUsed: this.state.phaseUsed,
      phaseArmed: this.state.phaseArmed,
      wallIgnoreArmed: this.state.wallIgnoreArmed,
      holdSpace: this.state.holdSpace,
      holdMovesLeft: this.state.holdMovesLeft,
      gameOver: this.state.gameOver,
      rewardCooldownUntil: this.state.rewardCooldownUntil,
    };
  }

  // ========================= INTERNALS =========================

  private posKey(p: Position) { return `${p.x},${p.y}`; }
  private inBounds(x: number, y: number) { return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE; }
  private manhattan(a: Position, b: Position) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  private mulberry32(seed: number) {
    return function() {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private randomSeed() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0];
  }

  private randInt(max: number) { return Math.floor(this.rng!() * max); }

  private getNeighbors(pos: Position): Position[] {
    return [
      { x: pos.x, y: pos.y - 1 },
      { x: pos.x, y: pos.y + 1 },
      { x: pos.x - 1, y: pos.y },
      { x: pos.x + 1, y: pos.y },
    ];
  }

  private countPlayerEscapeOptions(enemyKeys: Set<string>): number {
    const s = this.state!;
    let count = 0;
    for (const n of this.getNeighbors(s.player)) {
      if (!this.inBounds(n.x, n.y)) continue;
      if (s.walls.has(this.posKey(n))) continue;
      if (enemyKeys.has(this.posKey(n))) continue;
      count++;
    }
    if (s.tokens?.diag > 0) {
      const px = s.player.x, py = s.player.y;
      const diags = [
        { x: px - 1, y: py - 1 }, { x: px + 1, y: py - 1 },
        { x: px - 1, y: py + 1 }, { x: px + 1, y: py + 1 },
      ];
      for (const d of diags) {
        if (!this.inBounds(d.x, d.y)) continue;
        if (s.walls.has(this.posKey(d))) continue;
        if (enemyKeys.has(this.posKey(d))) continue;
        const a = this.posKey({ x: d.x, y: py });
        const b = this.posKey({ x: px, y: d.y });
        if (s.walls.has(a) || s.walls.has(b)) continue;
        count++;
      }
    }
    return count;
  }

  private isEnemyNear(enemy: Position) { return this.manhattan(enemy, this.state!.player) <= 2; }

  private getPlayerInterceptTargets() {
    return this.getNeighbors(this.state!.player)
      .filter(p => this.inBounds(p.x, p.y))
      .filter(p => !this.state!.walls.has(this.posKey(p)));
  }

  private buildBlockedSet(excludeIdx: number | null = null, hypothetical: Position | null = null) {
    const blocked = new Set(this.state!.walls);
    this.state!.enemies.forEach((e, i) => {
      if (i === excludeIdx) {
        if (hypothetical) blocked.add(this.posKey(hypothetical));
      } else {
        blocked.add(this.posKey(e));
      }
    });
    return blocked;
  }

  private reachableTilesFrom(start: Position, blockedSet: Set<string>) {
    const visited = new Set<string>();
    const queue: Position[] = [start];
    visited.add(this.posKey(start));
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of this.getNeighbors(cur)) {
        if (!this.inBounds(n.x, n.y)) continue;
        const k = this.posKey(n);
        if (blockedSet.has(k) || visited.has(k)) continue;
        visited.add(k);
        queue.push(n);
      }
    }
    return visited;
  }

  private shortestPathDist(from: Position, to: Position, blockedSet: Set<string>) {
    if (this.posKey(from) === this.posKey(to)) return 0;
    const visited = new Set<string>();
    const queue = [{ pos: from, dist: 0 }];
    visited.add(this.posKey(from));
    while (queue.length) {
      const { pos, dist } = queue.shift()!;
      for (const n of this.getNeighbors(pos)) {
        if (!this.inBounds(n.x, n.y)) continue;
        const k = this.posKey(n);
        if (blockedSet.has(k) || visited.has(k)) continue;
        if (k === this.posKey(to)) return dist + 1;
        visited.add(k);
        queue.push({ pos: n, dist: dist + 1 });
      }
    }
    return Infinity;
  }

  private shortestPathDistToAny(from: Position, targets: Position[], blockedSet: Set<string>) {
    const targetKeys = new Set(targets.map(t => this.posKey(t)));
    const visited = new Set<string>();
    const queue = [{ pos: from, dist: 0 }];
    visited.add(this.posKey(from));
    while (queue.length) {
      const { pos, dist } = queue.shift()!;
      if (targetKeys.has(this.posKey(pos))) return dist;
      for (const n of this.getNeighbors(pos)) {
        if (!this.inBounds(n.x, n.y)) continue;
        const nk = this.posKey(n);
        if (blockedSet.has(nk) || visited.has(nk)) continue;
        visited.add(nk);
        queue.push({ pos: n, dist: dist + 1 });
      }
    }
    return Infinity;
  }

  private buildWallsCount(count: number) {
    const s = this.state!;
    const avoid = new Set<string>();
    avoid.add(this.posKey(s.player));
    for (const e of s.enemies) avoid.add(this.posKey(e));
    if (s.portal) avoid.add(this.posKey(s.portal));

    for (let attempt = 0; attempt < 200; attempt++) {
      const walls = new Set<string>();
      while (walls.size < count) {
        const x = this.randInt(GRID_SIZE);
        const y = this.randInt(GRID_SIZE);
        const k = `${x},${y}`;
        if (avoid.has(k)) continue;
        walls.add(k);
      }
      const blocked = new Set(walls);
      const reachable = this.reachableTilesFrom(s.player, blocked);
      if (reachable.size > 1) return walls;
    }
    return s.walls;
  }

  private scoreEnemyMove(idx: number, enemy: Enemy, tile: Position, cfg: any) {
    const s = this.state!;
    if (tile.x === s.player.x && tile.y === s.player.y) return 100000;
    const blocked = this.buildBlockedSet(idx, tile);
    const dist = this.shortestPathDist(tile, s.player, blocked);
    let score = -dist * 20;

    if (dist === 1) {
      score += this.difficulty === 'standard' ? 6 : this.difficulty === 'hard' ? 10 : 16;
    }

    const intercepts = this.getPlayerInterceptTargets();
    if (intercepts.length) {
      const interceptDist = this.shortestPathDistToAny(tile, intercepts, blocked);
      const iw = this.difficulty === 'standard' ? 6 : this.difficulty === 'hard' ? 10 : 16;
      if (interceptDist <= dist) score -= interceptDist * iw;
    }

    for (const other of s.enemies) {
      if (other === enemy) continue;
      if (other.intent && enemy.intent && this.posKey({ x: enemy.x + enemy.intent.dx, y: enemy.y + enemy.intent.dy }) === this.posKey(tile)) {
        score -= this.difficulty === 'standard' ? 2 : this.difficulty === 'hard' ? 6 : 12;
      }
    }

    const hypothetical = new Set(s.enemies.map((e, i) => i === idx ? this.posKey(tile) : this.posKey(e)));
    const escapeCount = this.countPlayerEscapeOptions(hypothetical);
    const ew = this.difficulty === 'standard' ? 1.0 : this.difficulty === 'hard' ? 1.4 : 1.9;
    if (dist <= 3) score -= escapeCount * cfg.escapePenalty * ew;
    if (escapeCount <= 1) score -= 6 * ew;

    for (const other of s.enemies) {
      if (other === enemy) continue;
      if (this.manhattan(tile, other) <= 2) score += cfg.gapFillBonus;
    }
    return score;
  }

  private planEnemyMoves(cfg: any) {
    const s = this.state!;
    const current = s.enemies.map(e => ({ ...e }));
    const desired: Enemy[] = [];

    current.forEach((enemy, idx) => {
      if (enemy.stunned > 0) {
        desired.push({ ...enemy, stunned: enemy.stunned - 1 });
        return;
      }

      let candidates = this.getNeighbors(enemy)
        .filter(t => this.inBounds(t.x, t.y))
        .filter(t => !s.walls.has(this.posKey(t)));

      if (enemy.intentLock > 0 && enemy.intent &&
        this.manhattan(enemy, s.player) > this.manhattan({ x: enemy.x - enemy.intent.dx, y: enemy.y - enemy.intent.dy }, s.player)) {
        enemy.intentLock = 0;
        enemy.intent = null;
      }

      if (enemy.intentLock > 0 && enemy.intent) {
        const locked = { x: enemy.x + enemy.intent.dx, y: enemy.y + enemy.intent.dy };
        const occupied = current.some((e, j) => j !== idx && e.x === locked.x && e.y === locked.y);
        if (this.inBounds(locked.x, locked.y) && !s.walls.has(this.posKey(locked)) && !occupied) {
          candidates = [locked];
        }
      }

      if (!candidates.length) { desired.push({ ...enemy }); return; }

      let best: Enemy = { ...enemy };
      let bestScore = -Infinity;
      let bestDist = Infinity;
      const currentEscapes = this.countPlayerEscapeOptions(new Set(current.map(e => this.posKey(e))));

      for (const tile of candidates) {
        let score = this.scoreEnemyMove(idx, enemy, tile, cfg);
        const dist = this.manhattan(tile, s.player);
        const hyp = new Set(current.map((e, i) => i === idx ? this.posKey(tile) : this.posKey(e)));
        const nextEscapes = this.countPlayerEscapeOptions(hyp);
        if (nextEscapes < currentEscapes) {
          score += this.difficulty === 'standard' ? 2 : this.difficulty === 'hard' ? 6 : 12;
        }
        if (score > bestScore || (score === bestScore && dist < bestDist)) {
          best = {
            ...enemy, x: tile.x, y: tile.y,
            intent: { dx: tile.x - enemy.x, dy: tile.y - enemy.y },
            intentLock: this.difficulty === 'standard' ? 1 : this.difficulty === 'hard' ? 2 : 3
          };
          bestScore = score;
          bestDist = dist;
        }
      }

      if (best.x === enemy.x && best.y === enemy.y) { best.intent = null; best.intentLock = 0; }
      desired.push(best);
    });

    const origins = current.map(p => ({ ...p }));
    desired.forEach((target, i) => {
      origins.forEach((origin, j) => {
        if (i === j) return;
        if (this.posKey(target) === this.posKey(origin) && this.posKey(desired[j]) === this.posKey(origin)) {
          desired[i] = { ...origins[i] };
        }
      });
    });

    const destMap = new Map<string, number[]>();
    desired.forEach((tile, idx) => {
      const k = this.posKey(tile);
      if (!destMap.has(k)) destMap.set(k, []);
      destMap.get(k)!.push(idx);
    });

    const resolved = current.map(e => ({ ...e }));
    const resolvedIdx = new Set<number>();

    for (let i = 0; i < desired.length; i++) {
      if (resolvedIdx.has(i)) continue;
      for (let j = i + 1; j < desired.length; j++) {
        if (resolvedIdx.has(j)) continue;
        const swapA = this.posKey(desired[i]) === this.posKey(current[j]);
        const swapB = this.posKey(desired[j]) === this.posKey(current[i]);
        if (!swapA || !swapB) continue;
        if ((desired[i].x === s.player.x && desired[i].y === s.player.y) ||
            (desired[j].x === s.player.x && desired[j].y === s.player.y)) continue;
        const a = destMap.get(this.posKey(desired[i])) || [];
        const b = destMap.get(this.posKey(desired[j])) || [];
        if (a.length === 1 && b.length === 1) {
          resolved[i] = { ...desired[i] };
          resolved[j] = { ...desired[j] };
          resolvedIdx.add(i);
          resolvedIdx.add(j);
        }
      }
    }

    for (const [, indices] of destMap.entries()) {
      const contenders = indices.filter(idx => !resolvedIdx.has(idx));
      if (!contenders.length) continue;
      if (contenders.length === 1) { resolved[contenders[0]] = { ...desired[contenders[0]] }; continue; }
      let winner = contenders[0];
      let bd = this.manhattan(current[winner], s.player);
      for (const idx of contenders.slice(1)) {
        const dist = this.manhattan(current[idx], s.player);
        if (dist < bd || (dist === bd && idx < winner)) { winner = idx; bd = dist; }
      }
      resolved[winner] = { ...desired[winner] };
    }

    resolved.forEach((e, i) => {
      if (e.x === current[i].x && e.y === current[i].y) { e.intent = null; e.intentLock = 0; }
    });

    const killer = resolved.find(e => e.x === s.player.x && e.y === s.player.y);
    if (killer) {
      return { resolvedMoves: resolved, intentTiles: new Set([this.posKey(killer)]) };
    }
    return {
      resolvedMoves: resolved,
      intentTiles: new Set(desired.filter((e, i) => e.x !== current[i].x || e.y !== current[i].y).map(e => this.posKey(e)))
    };
  }

  private delay(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

  private handleDeath(cause: string, killer: Enemy | null) {
    const s = this.state!;
    if (s.hasExtraLife) {
      s.hasExtraLife = false;
      const blocked = new Set(s.walls);
      const reachable = this.reachableTilesFrom(s.player, blocked);
      let best: Position | null = null;
      let bestScore = -Infinity;
      for (const k of reachable) {
        const [x, y] = k.split(',').map(Number);
        if (s.enemies.some(e => e.x === x && e.y === y)) continue;
        const escapes = this.countPlayerEscapeOptions(new Set(s.enemies.map(e => this.posKey(e))));
        const minDist = Math.min(...s.enemies.map(e => this.manhattan(e, { x, y })));
        const score = escapes * 10 + minDist;
        if (score > bestScore) { bestScore = score; best = { x, y }; }
      }
      if (best) { s.player = best; this.updateHud(); return; }
    }

    s.gameOver = true;
    s.inputLocked = true;
    s.effects.freezeUntil = performance.now() + DEATH_FREEZE_MS;
    s.effects.killer = killer ? { x: killer.x, y: killer.y } : null;
    this.playDeathSound();

    setTimeout(() => {
      s.inputLocked = false;
      this.callbacks.onGameOver({ turns: s.turns, cause, seed: s.seed, seedMode: s.seedMode });
    }, DEATH_FREEZE_MS);
  }

  private async resolveTurnAsync() {
    const s = this.state!;
    if (s.freezeNext) {
      s.freezeNext = false;
      s.turns++;
      this.onTurnAdvanced();
      s.inputLocked = false;
      return;
    }

    s.inputLocked = true;
    const cfg = this.effectiveCfg;
    await this.delay(cfg.turnDelay);

    const plan = this.planEnemyMoves(cfg);
    if (cfg.showIntentFlash) {
      s.effects.intentTiles = plan.intentTiles;
      await this.delay(INTENT_FLASH_MS);
      s.effects.intentTiles = null;
    }

    s.enemies = plan.resolvedMoves;
    if (!s.gameOver && s.enemies.length) this.playEnemySound();

    const hit = s.enemies.find(e => e.stunned === 0 && e.x === s.player.x && e.y === s.player.y);
    if (hit) return this.handleDeath('Intercepted.', hit);

    const enemyKeys = new Set(s.enemies.map(e => this.posKey(e)));
    if (!this.countPlayerEscapeOptions(enemyKeys)) return this.handleDeath('No escape.', null);

    s.turns++;
    this.onTurnAdvanced();

    if (s.turns % 12 === 0) {
      const phase = Math.floor(s.turns / 12) % 3;
      if (phase === 0 && s.tokens.diag === 0) s.tokens.diag = 1;
      if (phase === 1 && s.tokens.wall === 0) s.tokens.wall = 1;
      if (phase === 2 && s.tokens.freeze === 0) s.tokens.freeze = 1;
    }
    if (s.turns % 50 === 0 && (s.tokens.timeFreeze ?? 0) === 0) s.tokens.timeFreeze = 1;

    if (s.turns > s.best) {
      s.best = s.turns;
      memoryStore.bestScores[this.bestKey(s.seedMode)] = s.best;
    }

    if (s.turns >= s.nextSpawnTurn) {
      const cap = this.enemyCountForStage(s.stage);
      if (s.enemies.length < cap) this.spawnEnemy();
      const interval = Math.max(cfg.spawnFloor, Math.floor(this.stateRampSpeed - s.turns / this.stateRampSpeed));
      s.nextSpawnTurn += interval;
    }

    this.updateHud();
    s.inputLocked = false;
    s.effects.lastEnemyTurn = s.turns;
  }

  private payTurnDebtAsync() {
    const s = this.state!;
    if (!s || s.gameOver || s.inputLocked) return;
    if (s.turnDebt <= 0) return;
    const debt = s.turnDebt;
    s.turnDebt = 0;
    if (s.payingDebt) return;
    s.payingDebt = true;
    (async () => {
      try {
        for (let i = 0; i < debt; i++) {
          if (!s || s.gameOver) return;
          await this.resolveTurnAsync();
        }
      } finally { s.payingDebt = false; }
    })();
  }

  private attemptMove(dx: number, dy: number) {
    const s = this.state!;
    if (s.gameOver || s.inputLocked) return;
    if (s.holdSpace && s.holdMovesLeft <= 0) return;

    if (s.phaseArmed) {
      if (dx !== 0 && dy !== 0) return;
      const first = { x: s.player.x + dx, y: s.player.y + dy };
      const second = { x: first.x + dx, y: first.y + dy };
      if (!this.inBounds(first.x, first.y) || !this.inBounds(second.x, second.y)) return;
      if (s.walls.has(this.posKey(first)) || s.walls.has(this.posKey(second))) return;
      if (s.enemies.some(e => e.x === second.x && e.y === second.y)) return;
      const phasedEnemy = s.enemies.find(e => e.x === first.x && e.y === first.y);
      if (phasedEnemy) phasedEnemy.stunned = 1;
      s.player = { x: second.x, y: second.y };
      s.playerTrail.unshift(this.posKey(s.player));
      s.playerTrail = s.playerTrail.slice(0, 2);
      s.phaseUsed = true;
      s.phaseArmed = false;
      this.ensureAudio();
      this.playMoveSound();
      if (s.holdSpace) {
        s.holdMovesLeft--;
        s.holdStepsUsed++;
        this.updateHud();
        s.inputLocked = false;
        return;
      }
      this.resolveTurnAsync();
      return;
    }

    const nx = s.player.x + dx;
    const ny = s.player.y + dy;
    if (!this.inBounds(nx, ny)) return;
    const k = `${nx},${ny}`;

    if (s.walls.has(k)) {
      if (s.wallIgnoreArmed) { s.wallIgnoreArmed = false; }
      else return;
    }

    if (dx !== 0 && dy !== 0) {
      const a = this.posKey({ x: s.player.x + dx, y: s.player.y });
      const b = this.posKey({ x: s.player.x, y: s.player.y + dy });
      if (s.walls.has(a) || s.walls.has(b)) return;
    }

    s.player = { x: nx, y: ny };
    s.playerTrail.unshift(k);
    s.playerTrail = s.playerTrail.slice(0, 2);

    if (s.portal && nx === s.portal.x && ny === s.portal.y) {
      this.advanceStage();
      return;
    }

    const stepped = s.enemies.find(e => e.x === nx && e.y === ny);
    if (stepped) return this.handleDeath('Intercepted.', stepped);

    this.ensureAudio();
    this.playMoveSound();

    if (s.holdSpace) {
      s.holdMovesLeft--;
      s.holdStepsUsed++;
      this.updateHud();
      s.inputLocked = false;
      return;
    }
    this.resolveTurnAsync();
  }

  private onTurnAdvanced() {
    this.spawnPortalIfNeeded();
    this.updateHud();
  }

  private computeNextPortalTurn(_stage: number, currentTurn: number) { return currentTurn + 15; }

  private spawnPortalIfNeeded() {
    const s = this.state!;
    if (s.portal || s.turns < s.nextPortalAtTurn) return;
    const blocked = new Set(s.walls);
    const reachable = this.reachableTilesFrom(s.player, blocked);
    const candidates = [...reachable]
      .map(k => { const [x, y] = k.split(',').map(Number); return { x, y }; })
      .filter(p => !(p.x === s.player.x && p.y === s.player.y))
      .filter(p => !s.enemies.some(e => e.x === p.x && e.y === p.y));
    if (!candidates.length) { s.nextPortalAtTurn++; return; }
    s.portal = candidates[this.randInt(candidates.length)];
  }

  private enemyCountForStage(stage: number) {
    if (stage <= 5) return 2;
    if (stage <= 10) return 3;
    if (stage <= 15) return 4;
    if (stage <= 20) return 5;
    return 6;
  }

  private advanceStage() {
    const s = this.state!;
    this.startStageTransitionFx();
    s.stage++;
    this.callbacks.onStageBanner(s.stage);
    s.portal = null;
    s.nextPortalAtTurn = this.computeNextPortalTurn(s.stage, s.turns);
    this.relocateWallsOnStageAdvance();
    if (s.stage % 15 === 0 && !s.hasExtraLife) s.hasExtraLife = true;
    s.enemies = [];
    const target = this.enemyCountForStage(s.stage);
    for (let i = 0; i < target; i++) this.spawnEnemy();
    s.nextSpawnTurn = Math.max(1, this.stateSpawnInitial);
    this.recomputeEffectiveConfig();
    this.updateHud();
  }

  private startStageTransitionFx() {
    const now = performance.now();
    this.state!.effects.stageFx = {
      startMs: now, durationMs: 520,
      x: this.state!.player.x, y: this.state!.player.y
    };
  }

  private relocateWallsOnStageAdvance() {
    const s = this.state!;
    if (s.stage % WALL_ADD_EVERY_STAGES === 0) {
      this.WALL_COUNT = Math.min(WALL_MAX, this.WALL_COUNT + 1);
    }
    s.walls = this.buildWallsCount(this.WALL_COUNT);
  }

  private isEdgeTile(pos: Position) {
    return pos.x === 0 || pos.x === GRID_SIZE - 1 || pos.y === 0 || pos.y === GRID_SIZE - 1;
  }

  private getSafeSpawnTiles() {
    const s = this.state!;
    const tiles: Position[] = [];
    const enemyKeys = new Set(s.enemies.map(e => this.posKey(e)));
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const key = `${x},${y}`;
        if (!this.isEdgeTile({ x, y })) continue;
        if (s.walls.has(key) || enemyKeys.has(key)) continue;
        if (this.manhattan({ x, y }, s.player) <= 1) continue;
        const hyp = new Set(enemyKeys);
        hyp.add(key);
        if (this.countPlayerEscapeOptions(hyp) < 2) continue;
        tiles.push({ x, y });
      }
    }
    return tiles;
  }

  private pickSpawnTile() {
    const safe = this.getSafeSpawnTiles();
    if (!safe.length) return null;
    const trail = this.state!.playerTrail || [];
    const weights = safe.map(t => {
      let w = 1;
      for (const pk of trail) {
        const [px, py] = pk.split(',').map(Number);
        w *= (1 + Math.abs(t.x - px) + Math.abs(t.y - py));
      }
      return w;
    });
    let total = weights.reduce((a, b) => a + b, 0);
    let r = this.rng!() * total;
    for (let i = 0; i < safe.length; i++) {
      r -= weights[i];
      if (r <= 0) return safe[i];
    }
    return safe[safe.length - 1];
  }

  private spawnEnemy() {
    const tile = this.pickSpawnTile();
    if (!tile) return false;
    this.state!.enemies.push({
      x: tile.x, y: tile.y,
      phase: this.rng!() * Math.PI * 2,
      intent: null, intentLock: 0, stunned: 0,
    });
    return true;
  }

  private bestKey(seedMode: string) { return `one-more-move-best-v${SETTINGS_VERSION}-${seedMode}`; }

  private applySettings() {
    this.tuning = loadTuning();
    this.WALL_COUNT = this.tuning.walls;
    this.INITIAL_ENEMIES = this.tuning.initialEnemies;
    this.stateSpawnInitial = this.tuning.initialSpawn;
    this.stateRampSpeed = this.tuning.rampSpeed;
    this.recomputeEffectiveConfig();
  }

  private recomputeEffectiveConfig() {
    const base = BASE_DIFFICULTY_CONFIG[this.difficulty];
    const s = Math.max(1, this.state?.stage || 1);
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const pressureMult = clamp(1 + 0.02 * (s - 1), 1, 1.30);
    const gapMult = clamp(1 + 0.015 * (s - 1), 1, 1.25);
    const speedMult = clamp(1 - 0.008 * (s - 1), 0.80, 1.00);
    const escapePenaltyTuned = base.escapePenalty * (this.tuning.escapePenalty / BASE_DIFFICULTY_CONFIG.standard.escapePenalty);
    const gapFillBonusTuned = base.gapFillBonus * (this.tuning.gapFillBonus / BASE_DIFFICULTY_CONFIG.standard.gapFillBonus);
    this.effectiveCfg = {
      ...base,
      turnDelay: Math.round(base.turnDelay * speedMult),
      escapePenalty: escapePenaltyTuned * pressureMult,
      gapFillBonus: gapFillBonusTuned * gapMult,
    };
  }

  private initPreferences() {
    const saved = memoryStore.difficulty;
    if (saved && BASE_DIFFICULTY_CONFIG[saved]) this.difficulty = saved as Difficulty;
    this.muted = memoryStore.muted;
  }

  private updateHud() {
    const data = this.getHudData();
    if (data) this.callbacks.onHudUpdate(data);
  }

  private initState({ seed, seedMode }: { seed: number; seedMode: string }) {
    this.rng = this.mulberry32(seed);
    this.state = {
      player: { x: 5, y: 5 },
      walls: new Set(),
      enemies: [],
      turns: 0,
      best: Number(memoryStore.bestScores[this.bestKey(seedMode)] || 0),
      nextSpawnTurn: Math.max(1, this.stateSpawnInitial),
      gameOver: false,
      inputLocked: false,
      holdSpace: false,
      holdMovesLeft: 2,
      holdStepsUsed: 0,
      playerTrail: [],
      stage: 1,
      portal: null,
      nextPortalAtTurn: this.computeNextPortalTurn(1, 0),
      hasExtraLife: false,
      rewardCooldownUntil: 0,
      phaseUsed: false,
      phaseArmed: false,
      tokens: { diag: 0, wall: 0, freeze: 0, timeFreeze: 0 },
      freezeNext: false,
      wallIgnoreArmed: false,
      payingDebt: false,
      turnDebt: 0,
      seed,
      seedMode,
      effects: {
        intentTiles: null,
        freezeUntil: 0,
        killer: null,
        lastEnemyTurn: -1,
        stageFx: null,
        stageBannerUntil: 0,
        statusUntil: 0,
        statusText: seedMode === 'NEW' ? 'NEW SEED' : seedMode === 'REPLAY' ? 'REPLAYING SEED' : '',
      },
    };

    this.state.walls = this.buildWallsCount(this.WALL_COUNT);
    const spawnCount = Math.max(0, Math.min(this.INITIAL_ENEMIES, GRID_SIZE * 2));
    for (let i = 0; i < spawnCount; i++) this.spawnEnemy();
    this.updateHud();
    this.render();

    if (!this.animationRunning) {
      this.animationRunning = true;
      this.animationLoop();
    }
  }

  // ========================= AUDIO =========================
  private ensureAudio() {
    if (this.audioContext || this.muted) return;
    try { this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { this.audioContext = null; }
  }

  private playTone(opts: { frequency: number; duration: number; type: OscillatorType; gain: number }) {
    if (!this.audioContext || this.muted) return;
    const o = this.audioContext.createOscillator();
    const g = this.audioContext.createGain();
    o.type = opts.type;
    o.frequency.value = opts.frequency;
    g.gain.value = opts.gain;
    o.connect(g);
    g.connect(this.audioContext.destination);
    o.start();
    o.stop(this.audioContext.currentTime + opts.duration);
  }

  private playMoveSound() { this.playTone({ frequency: 480, duration: 0.05, type: 'triangle', gain: 0.06 }); }
  private playEnemySound() { this.playTone({ frequency: 140, duration: 0.08, type: 'sine', gain: 0.08 }); }
  private playDeathSound() { this.playTone({ frequency: 80, duration: 0.18, type: 'sawtooth', gain: 0.1 }); }

  // ========================= RENDERING =========================
  private enemyPulseStrength(enemy: Position) {
    const d = this.manhattan(enemy, this.state!.player);
    if (d === 1) return 1.0;
    if (d === 2) return 0.45;
    return 0.0;
  }

  private playerHaloPhase() { return (performance.now() * 0.0004) % 1; }
  private pulsePhaseOffset(offset: number) { return (Math.sin(performance.now() * 0.012 + offset) + 1) / 2; }

  private drawTile(px: number, py: number, size: number, baseColor: string, shadow = true) {
    const ctx = this.ctx;
    ctx.save();
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4; }
    ctx.fillStyle = baseColor;
    ctx.fillRect(px, py, size, size);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
    ctx.restore();
  }

  private drawWalls() {
    const cs = this.cellSize;
    const pad = cs * 0.067;
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = '#5a5a5a';
    for (const k of this.state!.walls) {
      const [x, y] = k.split(',').map(Number);
      this.ctx.fillRect(x * cs + pad, y * cs + pad, cs - pad * 2, cs - pad * 2);
    }
  }

  private drawPortal() {
    const s = this.state!;
    if (!s.portal) return;
    const cs = this.cellSize;
    const pad = cs * 0.067;
    const ctx = this.ctx;
    const px = s.portal.x * cs + pad;
    const py = s.portal.y * cs + pad;
    const size = cs - pad * 2;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(px, py, size, size);
    ctx.globalAlpha = 0.8;
    ctx.shadowColor = 'rgba(255,255,255,0.8)';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, size - 2, size - 2);
    ctx.restore();
  }

  private drawIntentTiles() {
    const s = this.state!;
    if (!s.effects.intentTiles || !this.effectiveCfg.showIntentFlash) return;
    const cs = this.cellSize;
    const pad = cs * 0.067;
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = 'rgba(200,50,50,0.25)';
    for (const k of s.effects.intentTiles) {
      const [x, y] = k.split(',').map(Number);
      this.ctx.fillRect(x * cs + pad, y * cs + pad, cs - pad * 2, cs - pad * 2);
    }
  }

  private drawEnemies() {
    const cs = this.cellSize;
    const pad = cs * 0.067;
    const ctx = this.ctx;
    for (const e of this.state!.enemies) {
      ctx.save();
      ctx.globalAlpha = e.stunned > 0 ? 0.6 : 1;
      const px = e.x * cs + pad;
      const py = e.y * cs + pad;
      const size = cs - pad * 2;
      this.drawTile(px, py, size, e.stunned > 0 ? '#6aaeff' : '#c43636');

      const strength = this.enemyPulseStrength(e);
      if (strength > 0) {
        const phase = this.pulsePhaseOffset(e.phase || 0);
        ctx.save();
        ctx.globalAlpha = 0.55 * strength;
        ctx.shadowColor = `rgba(255, 107, 107, ${0.55 * strength})`;
        ctx.shadowBlur = 10 + 26 * phase * strength;
        ctx.fillStyle = '#ff4d4d';
        ctx.fillRect(e.x * cs + pad * 0.75, e.y * cs + pad * 0.75, cs - pad * 1.5, cs - pad * 1.5);
        ctx.globalAlpha = (0.35 + 0.65 * phase) * strength;
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffb3b3';
        const inset = (9 - 4 * phase) * (cs / 60);
        ctx.fillRect(e.x * cs + inset, e.y * cs + inset, cs - inset * 2, cs - inset * 2);
        ctx.globalAlpha = (0.35 + 0.65 * phase) * strength;
        ctx.strokeStyle = '#ffd1d1';
        ctx.lineWidth = (2 + 3 * phase * strength) * (cs / 60);
        const so = 5 * (cs / 60);
        ctx.strokeRect(e.x * cs + so, e.y * cs + so, cs - so * 2, cs - so * 2);
        ctx.restore();
      }
      ctx.restore();
    }
  }

  private drawPlayer() {
    const cs = this.cellSize;
    const pad = cs * 0.067;
    const s = this.state!;
    const ctx = this.ctx;
    const now = performance.now();
    const fx = s.effects.stageFx;

    if (fx) {
      const p = Math.min(1, (now - fx.startMs) / fx.durationMs);
      const size = cs - pad * 2;
      const px = fx.x * cs + pad;
      const py = fx.y * cs + pad;
      const cx = px + size / 2;
      const cy = py + size / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(p * Math.PI * 8);
      ctx.translate(-cx, -cy);
      const grid = 8;
      const cell = size / grid;
      const keepRatio = 1 - p;
      let idx = 0;
      for (let y = 0; y < grid; y++) {
        for (let x = 0; x < grid; x++, idx++) {
          const n = (idx * 2654435761) >>> 0;
          if (((n ^ (n >>> 16)) >>> 0) / 4294967296 > keepRatio) continue;
          ctx.fillStyle = '#3a7bd5';
          ctx.fillRect(px + x * cell, py + y * cell, cell, cell);
        }
      }
      ctx.restore();
      if (p >= 1) s.effects.stageFx = null;
      return;
    }

    const size = cs - pad * 2;
    const px = s.player.x * cs + pad;
    const py = s.player.y * cs + pad;
    this.drawTile(px, py, size, '#3a7bd5');
    this.drawMovingSquareHalo(px, py, size);
  }

  private drawMovingSquareHalo(px: number, py: number, size: number) {
    const t = this.playerHaloPhase() * 4;
    const perimeter = size * 4;
    const segmentLength = size * 0.6;
    let offset = (t * perimeter) % perimeter;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = `rgba(120,180,255,${0.75 + 0.25 * pulse})`;
    ctx.lineWidth = 3 + pulse * 1.5;
    ctx.shadowColor = 'rgba(120,180,255,0.6)';
    ctx.shadowBlur = 8 + pulse * 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    let remaining = segmentLength;
    let d = offset;
    while (remaining > 0) {
      if (d < size) {
        const len = Math.min(size - d, remaining);
        ctx.moveTo(px + d, py);
        ctx.lineTo(px + d + len, py);
        remaining -= len; d += len;
      } else if (d < size * 2) {
        const dd = d - size;
        const len = Math.min(size - dd, remaining);
        ctx.moveTo(px + size, py + dd);
        ctx.lineTo(px + size, py + dd + len);
        remaining -= len; d += len;
      } else if (d < size * 3) {
        const dd = d - size * 2;
        const len = Math.min(size - dd, remaining);
        ctx.moveTo(px + size - dd, py + size);
        ctx.lineTo(px + size - dd - len, py + size);
        remaining -= len; d += len;
      } else {
        const dd = d - size * 3;
        const len = Math.min(size - dd, remaining);
        ctx.moveTo(px, py + size - dd);
        ctx.lineTo(px, py + size - dd - len);
        remaining -= len; d += len;
      }
      if (d >= perimeter) d -= perimeter;
    }
    ctx.stroke();
    ctx.restore();
  }

  render() {
    const s = this.state!;
    const ctx = this.ctx;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
      const p = i * this.cellSize;
      ctx.beginPath();
      ctx.moveTo(p, 0); ctx.lineTo(p, this.canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p); ctx.lineTo(this.canvas.width, p);
      ctx.stroke();
    }

    this.drawWalls();
    this.drawPortal();
    this.drawIntentTiles();
    this.drawEnemies();
    this.drawPlayer();

    if (s.effects.freezeUntil && performance.now() < s.effects.freezeUntil && s.effects.killer) {
      const cs = this.cellSize;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(s.effects.killer.x * cs + 2, s.effects.killer.y * cs + 2, cs - 4, cs - 4);
    }
  }

  private animationLoop() {
    if (!this.state || this.state.gameOver) {
      this.animationRunning = false;
      return;
    }
    this.render();
    this.animFrameId = requestAnimationFrame(() => this.animationLoop());
  }
}
