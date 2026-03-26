import { type HudData } from '@/game/engine';

interface AbilityBarProps {
  hud: HudData | null;
  armedAbility: string | null;
  onAbility: (ability: string) => void;
}

const abilities = [
  { key: 'diag', label: 'D', name: 'Diagonal', color: 'hsl(200, 70%, 50%)' },
  { key: 'wall', label: 'W', name: 'Wall Ignore', color: 'hsl(35, 80%, 50%)' },
  { key: 'phase', label: 'F', name: 'Phase Step', color: 'hsl(270, 60%, 55%)' },
  { key: 'freeze', label: 'B', name: 'Freeze', color: 'hsl(180, 60%, 45%)' },
  { key: 'timeFreeze', label: 'TF', name: 'Time Freeze', color: 'hsl(50, 80%, 50%)' },
];

export default function AbilityBar({ hud, armedAbility, onAbility }: AbilityBarProps) {
  if (!hud) return null;

  const now = performance.now();
  const onCooldown = now < hud.rewardCooldownUntil;
  const cooldownSecs = onCooldown ? Math.ceil((hud.rewardCooldownUntil - now) / 1000) : 0;

  const getCount = (key: string) => {
    if (key === 'diag') return hud.tokens.diag;
    if (key === 'wall') return hud.tokens.wall;
    if (key === 'phase') return hud.phaseUsed ? 0 : 1;
    if (key === 'freeze') return hud.tokens.freeze;
    if (key === 'timeFreeze') {
      if (hud.holdSpace) return hud.holdMovesLeft;
      return hud.tokens.timeFreeze;
    }
    return 0;
  };

  const isArmed = (key: string) => {
    if (key === 'wall' && hud.wallIgnoreArmed) return true;
    if (key === 'phase' && hud.phaseArmed) return true;
    if (key === 'timeFreeze' && hud.holdSpace) return true;
    return armedAbility === key;
  };

  return (
    <div className="flex items-center justify-center gap-2 px-3 py-2">
      {abilities.map((ab) => {
        const count = getCount(ab.key);
        const armed = isArmed(ab.key);
        const available = count > 0 && !hud.gameOver;
        const disabled = !available || (onCooldown && !armed);

        return (
          <button
            key={ab.key}
            onClick={() => onAbility(ab.key)}
            disabled={disabled && !armed}
            className="relative flex flex-col items-center justify-center rounded-lg transition-all duration-200 select-none"
            style={{
              width: 56,
              height: 56,
              background: armed
                ? ab.color
                : disabled
                  ? 'hsl(0, 0%, 18%)'
                  : `${ab.color}33`,
              border: `2px solid ${armed ? 'white' : disabled ? 'hsl(0, 0%, 25%)' : ab.color}`,
              opacity: disabled && !armed ? 0.4 : 1,
              boxShadow: armed ? `0 0 16px ${ab.color}88` : 'none',
            }}
          >
            <span
              className="text-sm font-bold"
              style={{ color: armed ? 'white' : disabled ? 'hsl(0, 0%, 45%)' : ab.color }}
            >
              {ab.label}
            </span>
            <span
              className="text-[10px] font-mono"
              style={{ color: armed ? 'rgba(255,255,255,0.8)' : disabled ? 'hsl(0, 0%, 35%)' : 'rgba(255,255,255,0.6)' }}
            >
              {count}
            </span>
            {onCooldown && !armed && count > 0 && (
              <span className="absolute -top-1 -right-1 text-[9px] bg-black/80 text-yellow-400 rounded-full w-4 h-4 flex items-center justify-center font-mono">
                {cooldownSecs}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
