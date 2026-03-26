import { useState, useRef, useCallback } from 'react';
import GameCanvas from '@/components/GameCanvas';
import GameHUD from '@/components/GameHUD';
import AbilityBar from '@/components/AbilityBar';
import GameOverlay from '@/components/GameOverlay';
import StageBanner from '@/components/StageBanner';
import SettingsPanel from '@/components/SettingsPanel';
import TutorialOverlay, { useTutorial } from '@/components/TutorialOverlay';
import { type GameEngine, type HudData, type GameOverData, type Difficulty } from '@/game/engine';

export default function Index() {
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudData | null>(null);
  const [gameOver, setGameOver] = useState<GameOverData | null>(null);
  const [stageBanner, setStageBanner] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [armedAbility, setArmedAbility] = useState<string | null>(null);
  const { showTutorial, dismissTutorial, openTutorial } = useTutorial();

  const onHudUpdate = useCallback((data: HudData) => {
    setHud(data);
    if (!data.phaseArmed && !data.wallIgnoreArmed && !data.holdSpace) {
      setArmedAbility(null);
    }
  }, []);

  const onGameOver = useCallback((data: GameOverData) => {
    setGameOver(data);
  }, []);

  const onStageBanner = useCallback((stage: number) => {
    setStageBanner(stage);
  }, []);

  const handleAbility = useCallback((key: string) => {
    const engine = engineRef.current;
    if (!engine) return;

    switch (key) {
      case 'diag':
        // Diagonal is used by tapping a diagonal tile directly
        break;
      case 'wall':
        if (engine.armWallIgnore()) setArmedAbility('wall');
        break;
      case 'phase':
        if (engine.armPhaseStep()) setArmedAbility('phase');
        break;
      case 'freeze':
        engine.useFreeze();
        break;
      case 'timeFreeze':
        if (hud?.holdSpace) {
          engine.releaseTimeFreeze();
          setArmedAbility(null);
        } else {
          if (engine.useTimeFreeze()) setArmedAbility('timeFreeze');
        }
        break;
    }
  }, [hud?.holdSpace]);

  const handleDifficulty = useCallback((d: Difficulty) => {
    engineRef.current?.setDifficultyLevel(d);
  }, []);

  const dismissOverlay = useCallback(() => setGameOver(null), []);

  const handleNewRun = useCallback(() => {
    setGameOver(null);
    engineRef.current?.newRun();
  }, []);

  const handleReplay = useCallback(() => {
    setGameOver(null);
    engineRef.current?.replaySeed();
  }, []);

  const handleManualSeed = useCallback(() => {
    const input = prompt('Enter seed (number):');
    if (!input) return;
    const seed = Number(input);
    if (!Number.isInteger(seed)) { alert('Invalid seed.'); return; }
    setGameOver(null);
    engineRef.current?.manualSeedRunWith(seed);
  }, []);

  const handleDaily = useCallback(() => {
    setGameOver(null);
    engineRef.current?.dailySeed();
  }, []);

  const handleMute = useCallback(() => {
    const m = engineRef.current?.toggleMute();
    setMuted(!!m);
  }, []);

  return (
    <div
      className="fixed inset-0 flex flex-col select-none overflow-hidden"
      style={{ background: 'hsl(0, 0%, 4%)' }}
    >
      <GameHUD
        hud={hud}
        muted={muted}
        onMute={handleMute}
        onSettings={() => setSettingsOpen(true)}
      />

      <div className="flex-1 flex items-center justify-center relative px-2">
        <GameCanvas
          onHudUpdate={onHudUpdate}
          onGameOver={onGameOver}
          onStageBanner={onStageBanner}
          engineRef={engineRef}
        />
        <StageBanner stage={stageBanner} />
        <GameOverlay
          data={gameOver}
          onReplay={handleReplay}
          onNewRun={handleNewRun}
          onManualSeed={handleManualSeed}
          onDailyChallenge={handleDaily}
          onDifficulty={handleDifficulty}
          currentDifficulty={hud?.difficulty || 'STANDARD'}
        />
      </div>

      <AbilityBar
        hud={hud}
        armedAbility={armedAbility}
        onAbility={handleAbility}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        difficulty={hud?.difficulty || 'STANDARD'}
        onDifficulty={(d) => {
          handleDifficulty(d);
          setSettingsOpen(false);
        }}
        onShowTutorial={openTutorial}
      />

      {showTutorial && <TutorialOverlay onDismiss={dismissTutorial} />}
    </div>
  );
}
