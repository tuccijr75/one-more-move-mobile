import { type HudData } from '@/game/engine';
import { Volume2, VolumeX, Settings } from 'lucide-react';

interface GameHUDProps {
  hud: HudData | null;
  muted: boolean;
  onMute: () => void;
  onSettings: () => void;
}

export default function GameHUD({ hud, muted, onMute, onSettings }: GameHUDProps) {
  if (!hud) return null;

  return (
    <div className="flex items-center justify-between px-3 py-2 text-xs font-mono" style={{ color: 'hsl(0, 0%, 70%)' }}>
      <div className="flex items-center gap-3">
        <div>
          <span style={{ color: 'hsl(0, 0%, 45%)' }}>TURNS </span>
          <span className="text-sm font-bold" style={{ color: 'hsl(210, 60%, 70%)' }}>{hud.turns}</span>
        </div>
        <div>
          <span style={{ color: 'hsl(0, 0%, 45%)' }}>BEST </span>
          <span className="text-sm font-bold" style={{ color: 'hsl(50, 70%, 60%)' }}>{hud.best}</span>
        </div>
        <div>
          <span style={{ color: 'hsl(0, 0%, 45%)' }}>STG </span>
          <span className="text-sm font-bold" style={{ color: 'hsl(130, 50%, 55%)' }}>{hud.stage}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-bold"
          style={{
            background: hud.difficulty === 'HARDCORE' ? 'hsl(0, 70%, 35%)' : hud.difficulty === 'HARD' ? 'hsl(35, 70%, 40%)' : 'hsl(210, 40%, 30%)',
            color: 'white',
          }}
        >
          {hud.difficulty}
        </span>
        <button onClick={onMute} className="p-1 opacity-60 hover:opacity-100 transition-opacity">
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button onClick={onSettings} className="p-1 opacity-60 hover:opacity-100 transition-opacity">
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
}
