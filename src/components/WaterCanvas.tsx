import React, { useEffect, useRef, useCallback } from 'react';
import { WaterSimulation, SimStats } from '../water/WaterSimulation';
import { WaterConfig } from '../water/presets';
import { waterAudio } from '../water/audio';

interface WaterCanvasProps {
  config: WaterConfig;
  interactionMode: 'orbit' | 'ripple' | 'both';
  onStatsUpdate: (stats: SimStats) => void;
  simRef: React.MutableRefObject<WaterSimulation | null>;
}

export const WaterCanvas: React.FC<WaterCanvasProps> = ({
  config,
  interactionMode,
  onStatsUpdate,
  simRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let sim: WaterSimulation | null = null;
    try {
      sim = new WaterSimulation(canvas, config);
      sim.onStats = onStatsUpdate;
      simRef.current = sim;
    } catch (err) {
      console.error('Failed to initialize WaterSimulation:', err);
    }

    const handleResize = () => {
      sim?.handleResize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      sim?.dispose();
      simRef.current = null;
    };
  }, []);

  // Sync config updates into simulation
  useEffect(() => {
    if (simRef.current) {
      const prevWaveScale = simRef.current.config.waveScale;
      const prevWindSpeed = simRef.current.config.windSpeed ?? 6.0;
      const prevSeed = simRef.current.config.vegetationSeed;
      const prevDensity = simRef.current.config.vegetationDensity;
      const prevBloom = simRef.current.config.lotusFlowerBloomRate;
      simRef.current.config = { ...config };

      // If waveScale or windSpeed changed, regenerate wave spectrum
      if (
        Math.abs(prevWaveScale - config.waveScale) > 0.001 ||
        Math.abs(prevWindSpeed - (config.windSpeed ?? 6.0)) > 0.05
      ) {
        simRef.current.updateWaveSpectrum(config.waveScale, config.windSpeed ?? 6.0);
      }

      // If procedural vegetation seed, density, or bloom changed, regenerate ecosystem
      if (
        prevSeed !== config.vegetationSeed ||
        prevDensity !== config.vegetationDensity ||
        prevBloom !== config.lotusFlowerBloomRate
      ) {
        simRef.current.regenerateVegetation(
          config.vegetationSeed,
          config.vegetationDensity,
          config.lotusFlowerBloomRate
        );
      }
    }

    // Sync procedural audio engine
    waterAudio.setWindSpeed(config.windSpeed ?? 6.0);
    waterAudio.setRainActive(config.rainMode ?? false);
    if (config.ambientMode) {
      waterAudio.setAmbientMode(config.ambientMode);
    }
    if (typeof config.ambientVolume === 'number') {
      waterAudio.setAmbientVolume(config.ambientVolume);
    }
    if (typeof config.masterVolume === 'number') {
      waterAudio.setMasterVolume(config.masterVolume);
    }
    if (typeof config.soundEnabled === 'boolean') {
      waterAudio.setMuted(!config.soundEnabled);
    }
  }, [config]);

  // Keyboard navigation loop for smooth 3D garden & pond strolling
  useEffect(() => {
    const keysDown = new Set<string>();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      keysDown.add(e.code);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.code);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let rafId: number;
    let lastTick = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - lastTick) / 1000);
      lastTick = now;

      if (simRef.current && keysDown.size > 0) {
        const isShift = keysDown.has('ShiftLeft') || keysDown.has('ShiftRight');
        const speed = (isShift ? 3.5 : 1.8) * dt;

        let fwd = 0;
        let strafe = 0;
        let elev = 0;

        if (keysDown.has('KeyW') || keysDown.has('ArrowUp')) fwd += 1;
        if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) fwd -= 1;
        if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) strafe += 1;
        if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) strafe -= 1;
        if (keysDown.has('KeyQ') || keysDown.has('PageDown')) elev -= 1;
        if (keysDown.has('KeyE') || keysDown.has('Space') || keysDown.has('PageUp')) elev += 1;

        if (fwd !== 0 || strafe !== 0 || elev !== 0) {
          simRef.current.moveCameraLocal(fwd * speed, strafe * speed, elev * speed * 0.7);
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(rafId);
    };
  }, [simRef]);

  // Pointer event handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !simRef.current) return;
      canvas.setPointerCapture(e.pointerId);
      simRef.current.onPointerDown(e.nativeEvent);
    },
    [simRef]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!simRef.current) return;
      simRef.current.onPointerMove(e.nativeEvent, interactionMode);
    },
    [simRef, interactionMode]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (canvas && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      if (!simRef.current) return;
      simRef.current.onPointerUp(e.nativeEvent, interactionMode);
    },
    [simRef, interactionMode]
  );

  // Wheel to zoom / FOV or camera height
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (!simRef.current) return;
      const delta = e.deltaY * 0.0015;
      simRef.current.cam.pitch = Math.max(-1.45, Math.min(0.35, simRef.current.cam.pitch - delta * 0.4));
    },
    [simRef]
  );

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-black">
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-crosshair touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      />
    </div>
  );
};
