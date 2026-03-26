import { type GameOverData, type Difficulty } from '@/game/engine';

interface GameOverlayProps {
  data: GameOverData | null;
  onReplay: () => void;
  onNewRun: () => void;
  onManualSeed: () => void;
  onDailyChallenge: () => void;
  onDifficulty: (d: Difficulty) => void;
  currentDifficulty: string;
}

export default function GameOverlay({
  data, onReplay, onNewRun, onManualSeed, onDailyChallenge,
  onDifficulty, currentDifficulty
}: GameOverlayProps) {
  if (!data) return null;

  const diffButtons: { label: string; value: Difficulty; color: string }[] = [
    { label: 'Standard', value: 'standard', color: 'hsl(210, 40%, 30%)' },
    { label: 'Hard', value: 'hard', color: 'hsl(35, 70%, 35%)' },
    { label: 'Hardcore', value: 'hardcore', color: 'hsl(0, 60%, 30%)' },
  ];

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="flex flex-col items-center gap-4 px-6 py-8 max-w-xs w-full">
        <h2 className="text-2xl font-bold tracking-wider" style={{ color: 'hsl(0, 70%, 60%)' }}>
          GAME OVER
        </h2>
        <p className="text-sm font-mono" style={{ color: 'hsl(0, 0%, 60%)' }}>{data.cause}</p>
        <div className="text-center space-y-1">
          <p className="text-lg font-bold" style={{ color: 'hsl(210, 60%, 70%)' }}>
            Turns Survived: {data.turns}
          </p>
          <p className="text-xs font-mono" style={{ color: 'hsl(0, 0%, 45%)' }}>
            Seed: {data.seed} · {data.seedMode}
          </p>
        </div>

        <div className="flex gap-2 w-full mt-2">
          {diffButtons.map(b => (
            <button
              key={b.value}
              onClick={() => onDifficulty(b.value)}
              className="flex-1 py-2 rounded text-xs font-bold transition-all"
              style={{
                background: currentDifficulty === b.value.toUpperCase() ? b.color : 'transparent',
                border: `1px solid ${b.color}`,
                color: 'white',
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 w-full mt-2">
          <button
            onClick={onNewRun}
            className="w-full py-3 rounded-lg font-bold text-sm transition-all"
            style={{ background: 'hsl(210, 50%, 40%)', color: 'white' }}
          >
            New Run
          </button>
          <button
            onClick={onReplay}
            className="w-full py-3 rounded-lg font-bold text-sm transition-all"
            style={{ background: 'hsl(0, 0%, 20%)', border: '1px solid hsl(0, 0%, 30%)', color: 'hsl(0, 0%, 70%)' }}
          >
            Replay Seed
          </button>
          <div className="flex gap-2">
            <button
              onClick={onDailyChallenge}
              className="flex-1 py-2.5 rounded-lg text-xs font-bold"
              style={{ background: 'hsl(50, 60%, 25%)', color: 'hsl(50, 80%, 70%)' }}
            >
              Daily Challenge
            </button>
            <button
              onClick={onManualSeed}
              className="flex-1 py-2.5 rounded-lg text-xs font-bold"
              style={{ background: 'hsl(0, 0%, 15%)', border: '1px solid hsl(0, 0%, 25%)', color: 'hsl(0, 0%, 55%)' }}
            >
              Enter Seed
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
