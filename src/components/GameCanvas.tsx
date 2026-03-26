import { useRef, useEffect, useCallback } from 'react';
import { GameEngine, type HudData, type GameOverData } from '@/game/engine';

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
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!touchStart.current || !engineRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    const dt = Date.now() - touchStart.current.time;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < SWIPE_THRESHOLD && dt < SWIPE_MAX_TIME) {
      // Tap — convert to grid coordinates
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const cx = touch.clientX - rect.left;
      const cy = touch.clientY - rect.top;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const grid = engineRef.current.screenToGrid(cx * scaleX, cy * scaleY);
      engineRef.current.tapTile(grid.x, grid.y);
    } else if (dt < SWIPE_MAX_TIME) {
      // Swipe
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx > absDy) {
        engineRef.current.move(dx > 0 ? 1 : -1, 0);
      } else {
        engineRef.current.move(0, dy > 0 ? 1 : -1);
      }
    }

    touchStart.current = null;
  }, [engineRef]);

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
        onTouchMove={(e) => e.preventDefault()}
      />
    </div>
  );
}
