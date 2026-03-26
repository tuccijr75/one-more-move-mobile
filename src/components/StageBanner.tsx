import { useEffect, useState } from 'react';

interface StageBannerProps {
  stage: number | null;
}

export default function StageBanner({ stage }: StageBannerProps) {
  const [visible, setVisible] = useState(false);
  const [displayStage, setDisplayStage] = useState(1);

  useEffect(() => {
    if (stage === null) return;
    setDisplayStage(stage);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 900);
    return () => clearTimeout(t);
  }, [stage]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div
        className="text-3xl font-black tracking-[0.3em] animate-pulse"
        style={{ color: 'hsl(0, 0%, 90%)', textShadow: '0 0 30px rgba(255,255,255,0.4)' }}
      >
        STAGE {displayStage}
      </div>
    </div>
  );
}
