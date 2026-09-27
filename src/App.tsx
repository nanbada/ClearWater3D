/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback } from 'react';
import { WaterCanvas } from './components/WaterCanvas';
import { ControlOverlay } from './components/ControlOverlay';
import { WaterConfig, DEFAULT_CONFIG } from './water/presets';
import { WaterSimulation, SimStats } from './water/WaterSimulation';

export default function App() {
  const [config, setConfig] = useState<WaterConfig>(DEFAULT_CONFIG);
  const [interactionMode, setInteractionMode] = useState<'orbit' | 'ripple' | 'both'>('both');
  const [stats, setStats] = useState<SimStats | null>(null);
  const simRef = useRef<WaterSimulation | null>(null);

  const handleStatsUpdate = useCallback((newStats: SimStats) => {
    setStats(newStats);
  }, []);

  const handleSnapshot = useCallback(() => {
    if (!simRef.current) return;
    try {
      const dataUrl = simRef.current.captureSnapshot();
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `clearwater-3d-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to capture snapshot:', err);
    }
  }, []);

  const handleResetCamera = useCallback(() => {
    if (!simRef.current) return;
    simRef.current.cam.yaw = 0;
    simRef.current.cam.pitch = -0.72;
    simRef.current.cam.vy = 0;
    simRef.current.cam.vp = 0;
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black select-none">
      {/* 3D WebGL2 Water Canvas */}
      <WaterCanvas
        config={config}
        interactionMode={interactionMode}
        onStatsUpdate={handleStatsUpdate}
        simRef={simRef}
      />

      {/* Modern Anti-Slop UI Overlay */}
      <ControlOverlay
        config={config}
        onChangeConfig={setConfig}
        interactionMode={interactionMode}
        onChangeInteractionMode={setInteractionMode}
        stats={stats}
        onSnapshot={handleSnapshot}
        onResetCamera={handleResetCamera}
      />
    </main>
  );
}
