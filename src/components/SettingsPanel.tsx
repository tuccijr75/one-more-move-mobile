import { type Difficulty } from '@/game/engine';
import { X, HelpCircle } from 'lucide-react';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  difficulty: string;
  onDifficulty: (d: Difficulty) => void;
  onShowTutorial: () => void;
}

export default function SettingsPanel({ open, onClose, difficulty, onDifficulty, onShowTutorial }: SettingsPanelProps) {
  if (!open) return null;

  const diffs: { label: string; value: Difficulty; desc: string }[] = [
    { label: 'Standard', value: 'standard', desc: 'Balanced gameplay with intent flashes' },
    { label: 'Hard', value: 'hard', desc: 'Faster enemies, smarter AI' },
    { label: 'Hardcore', value: 'hardcore', desc: 'No intent flashes, brutal AI' },
  ];

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div
        className="w-full max-w-md rounded-t-2xl p-6 space-y-4"
        style={{ background: 'hsl(0, 0%, 10%)', borderTop: '1px solid hsl(0, 0%, 20%)' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: 'hsl(0, 0%, 85%)' }}>Settings</h3>
          <button onClick={onClose} className="p-1" style={{ color: 'hsl(0, 0%, 50%)' }}>
            <X size={20} />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-mono" style={{ color: 'hsl(0, 0%, 50%)' }}>DIFFICULTY</p>
          {diffs.map(d => (
            <button
              key={d.value}
              onClick={() => onDifficulty(d.value)}
              className="w-full text-left p-3 rounded-lg transition-all"
              style={{
                background: difficulty === d.value.toUpperCase() ? 'hsl(210, 40%, 20%)' : 'hsl(0, 0%, 13%)',
                border: `1px solid ${difficulty === d.value.toUpperCase() ? 'hsl(210, 50%, 40%)' : 'hsl(0, 0%, 20%)'}`,
              }}
            >
              <span className="text-sm font-bold" style={{ color: 'hsl(0, 0%, 85%)' }}>{d.label}</span>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(0, 0%, 50%)' }}>{d.desc}</p>
            </button>
          ))}
        </div>

        <button
          onClick={() => { onShowTutorial(); onClose(); }}
          className="w-full flex items-center gap-2 p-3 rounded-lg transition-all active:scale-95"
          style={{ background: 'hsl(0, 0%, 13%)', border: '1px solid hsl(0, 0%, 20%)' }}
        >
          <HelpCircle size={18} style={{ color: 'hsl(210, 70%, 55%)' }} />
          <span className="text-sm font-semibold" style={{ color: 'hsl(0, 0%, 85%)' }}>Show Tutorial</span>
        </button>
      </div>
    </div>
  );
}
