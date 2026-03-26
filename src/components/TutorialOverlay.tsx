import { useState, useEffect } from 'react';
import { X, MoveRight, Hand, Route, Zap, Shield, Ghost, Snowflake, Timer } from 'lucide-react';

const TUTORIAL_KEY = 'omm_tutorial_seen';

interface TutorialOverlayProps {
  onDismiss: () => void;
}

const steps = [
  {
    icon: MoveRight,
    title: 'Swipe to Move',
    desc: 'Swipe up, down, left, or right to move one tile in that direction.',
    color: 'hsl(210, 70%, 55%)',
  },
  {
    icon: Hand,
    title: 'Tap Adjacent Tile',
    desc: 'Tap any tile next to your player to move there — including diagonals when tokens are available.',
    color: 'hsl(150, 60%, 45%)',
  },
  {
    icon: Route,
    title: 'Trace a Path',
    desc: 'Drag your finger across multiple tiles to plan a multi-step route. All moves execute in sequence.',
    color: 'hsl(280, 60%, 55%)',
  },
  {
    icon: Zap,
    title: 'Diagonal Move (D)',
    desc: 'Earned every 12 turns. Tap a diagonal tile next to your player to move there. Consumes the token on use.',
    color: 'hsl(45, 90%, 55%)',
  },
  {
    icon: Shield,
    title: 'Wall Ignore (W)',
    desc: 'Tap the W icon to arm it, then move into a wall tile — you\'ll pass right through it. One-time use.',
    color: 'hsl(30, 80%, 50%)',
  },
  {
    icon: Ghost,
    title: 'Phase Step (F)',
    desc: 'Tap the F icon to arm it, then swipe in a direction. You\'ll leap 2 tiles, phasing through and stunning any enemy in between.',
    color: 'hsl(190, 70%, 50%)',
  },
  {
    icon: Snowflake,
    title: 'Freeze (B)',
    desc: 'Tap the B icon to freeze all enemies for one turn. They won\'t move, giving you a free step.',
    color: 'hsl(200, 80%, 65%)',
  },
  {
    icon: Timer,
    title: 'Time Freeze (TF)',
    desc: 'Tap TF to stop time — take 2 free moves while enemies stay frozen. Tap TF again to release and resume normal play.',
    color: 'hsl(320, 65%, 55%)',
  },
];

export default function TutorialOverlay({ onDismiss }: TutorialOverlayProps) {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      localStorage.setItem(TUTORIAL_KEY, 'true');
      onDismiss();
    }
  };

  const handleSkip = () => {
    localStorage.setItem(TUTORIAL_KEY, 'true');
    onDismiss();
  };

  const current = steps[step];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-sm rounded-2xl border border-white/10 bg-[hsl(0,0%,8%)] p-6 text-center shadow-2xl">
        <button
          onClick={handleSkip}
          className="absolute right-3 top-3 rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white/80 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div
          className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl"
          style={{ background: `${current.color}20`, border: `2px solid ${current.color}40` }}
        >
          <Icon className="h-10 w-10" style={{ color: current.color }} />
        </div>

        <h2 className="mb-2 text-xl font-bold text-white">{current.title}</h2>
        <p className="mb-6 text-sm leading-relaxed text-white/60">{current.desc}</p>

        {/* Step dots */}
        <div className="mb-5 flex justify-center gap-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: i === step ? 24 : 8,
                background: i === step ? current.color : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all active:scale-95"
          style={{ background: current.color }}
        >
          {step < steps.length - 1 ? 'Next' : 'Got it — Play!'}
        </button>
      </div>
    </div>
  );
}

export function useTutorial() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(TUTORIAL_KEY)) {
      setShow(true);
    }
  }, []);

  return {
    showTutorial: show,
    dismissTutorial: () => setShow(false),
    openTutorial: () => setShow(true),
  };
}
