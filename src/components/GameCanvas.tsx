import { useRef, useEffect, useCallback } from 'react';
import { GameEngine, type HudData, type GameOverData, type Position } from '@/game/engine';

interface GameCanvasProps {
  onHudUpdate: (data: HudData) => void;
  onGameOver: (data: GameOverData) => void;
  onStageBanner: (stage: number) => void;
  engineRef: React.MutableRefObject<GameEngine | null>;
}

const SWIPE_THRESHOLD = 30;
const SWIPE_MAX_TIME = 500;

export default function GameCanvas({ onHudUpdate, onGameOver, onStageBanner, engineRef }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const tracedPath = useRef<Position[]>([]);
  const isTracing = useRef(false);

  const screenToGrid = useCallback((clientX: number, clientY: number): Position | null => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return null;
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return engine.screenToGrid(cx * scaleX, cy * scaleY);
  }, [engineRef]);

  const isValidPathStep = useCallback((from: Position, to: Position): boolean => {
    const engine = engineRef.current;
    if (!engine) return false;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false;
    if (dx === 0 && dy === 0) return false;
    if (!engine.isInBounds(to.x, to.y)) return false;
    if (engine.isWall(to.x, to.y)) return false;
    // No diagonal in path trace (would require tokens)
    if (dx !== 0 && dy !== 0) return false;
    return true;
  }, [engineRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new GameEngine(canvas, {
      onHudUpdate,
      onGameOver,
      onStageBanner,
    });
    engineRef.current = engine;

    const resize = () => {
      const container = containerRef.current;
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      engine.resize(w, h);
    };

    resize();
    engine.boot();

    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    tracedPath.current = [];
    isTracing.current = false;
    if (engineRef.current) {
      engineRef.current.pathOverlay = [];
    }
  }, [engineRef]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!touchStart.current || !engineRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Start tracing once finger moves enough
    if (!isTracing.current && dist > SWIPE_THRESHOLD) {
      isTracing.current = true;
    }

    if (!isTracing.current) return;

    const grid = screenToGrid(touch.clientX, touch.clientY);
    if (!grid) return;

    const path = tracedPath.current;
    const playerPos = engineRef.current.getPlayerPos();
    if (!playerPos) return;

    // Get the last position in the path (or player position if path is empty)
    const lastPos = path.length > 0 ? path[path.length - 1] : playerPos;

    // Same tile as last — skip
    if (grid.x === lastPos.x && grid.y === lastPos.y) return;

    // Check if we're backtracking (going back to a previous tile)
    if (path.length >= 2) {
      const prev = path[path.length - 2];
      if (grid.x === prev.x && grid.y === prev.y) {
        path.pop();
        engineRef.current.pathOverlay = [...path];
        return;
      }
    }
    // Backtrack to player position
    if (path.length === 1 && grid.x === playerPos.x && grid.y === playerPos.y) {
      path.length = 0;
      engineRef.current.pathOverlay = [];
      return;
    }

    // Check if this tile is already in the path (loop) — ignore
    if (path.some(p => p.x === grid.x && p.y === grid.y)) return;

    // Validate adjacency
    if (isValidPathStep(lastPos, grid)) {
      path.push({ x: grid.x, y: grid.y });
      engineRef.current.pathOverlay = [...path];
    }
  }, [engineRef, screenToGrid, isValidPathStep]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!touchStart.current || !engineRef.current) return;

    const path = tracedPath.current;

    // If we traced a path with 1+ tiles, queue those moves
    if (isTracing.current && path.length > 0) {
      const playerPos = engineRef.current.getPlayerPos();
      if (playerPos) {
        const moves: { dx: number; dy: number }[] = [];
        let cur = playerPos;
        for (const p of path) {
          moves.push({ dx: p.x - cur.x, dy: p.y - cur.y });
          cur = p;
        }
        engineRef.current.queueMoves(moves);
      }
    } else {
      // Fall back to tap/swipe
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;
      const dt = Date.now() - touchStart.current.time;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < SWIPE_THRESHOLD && dt < SWIPE_MAX_TIME) {
        const grid = screenToGrid(touch.clientX, touch.clientY);
        if (grid) engineRef.current.tapTile(grid.x, grid.y);
      } else if (dt < SWIPE_MAX_TIME) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx > absDy) {
          engineRef.current.move(dx > 0 ? 1 : -1, 0);
        } else {
          engineRef.current.move(0, dy > 0 ? 1 : -1);
        }
      }
    }

    touchStart.current = null;
    tracedPath.current = [];
    isTracing.current = false;
    if (engineRef.current) {
      engineRef.current.pathOverlay = [];
    }
  }, [engineRef, screenToGrid]);

  return (
    <div
      ref={containerRef}
      className="aspect-square max-w-full max-h-[calc(100vh-12rem)] mx-auto"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      />
    </div>
  );
}
