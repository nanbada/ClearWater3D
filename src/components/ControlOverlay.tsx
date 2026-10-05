import React, { useState, useEffect } from 'react';
import {
  Sun,
  Sunrise,
  Sunset,
  Clock,
  Thermometer,
  Play,
  Pause,
  Waves,
  Sparkles,
  Camera,
  Volume2,
  Volume1,
  VolumeX,
  Maximize2,
  Minimize2,
  Download,
  Sliders,
  X,
  Droplets,
  CloudRain,
  Eye,
  EyeOff,
  ChevronUp,
  Compass,
  Info,
  RotateCcw,
  Palette,
  Aperture,
  Wind,
  Film,
  CloudSun,
  CloudLightning,
  ChevronDown,
  Fish,
  Globe,
  Anchor,
} from 'lucide-react';
import {
  WaterConfig,
  WATER_PRESETS,
  DEFAULT_CONFIG,
  getTimeOfDayLighting,
  formatTimeOfDay,
  TIME_OF_DAY_PRESETS,
  kelvinToRGB,
  getBeaufortInfo,
  WeatherPreset,
  WEATHER_PRESETS,
  CRYSTAL_BEACH_PRESETS,
  BeachPreset,
  WATER_ENVIRONMENTS,
  WaterEnvironmentType,
  EnvironmentPreset,
  UNDERWATER_PRESETS,
  UnderwaterPreset,
} from '../water/presets';
import { SimStats } from '../water/WaterSimulation';
import { waterAudio } from '../water/audio';

interface ControlOverlayProps {
  config: WaterConfig;
  onChangeConfig: (newConfig: WaterConfig) => void;
  interactionMode: 'orbit' | 'ripple' | 'both';
  onChangeInteractionMode: (mode: 'orbit' | 'ripple' | 'both') => void;
  stats: SimStats | null;
  onSnapshot: () => void;
  onResetCamera: () => void;
  onSetGardenViewpoint?: (preset: 'deck' | 'pond' | 'stepping' | 'pine' | 'lantern' | 'bamboo') => void;
  onMoveCamera?: (fwd: number, strafe: number, elev: number) => void;
}

export const ControlOverlay: React.FC<ControlOverlayProps> = ({
  config,
  onChangeConfig,
  interactionMode,
  onChangeInteractionMode,
  stats,
  onSnapshot,
  onResetCamera,
  onSetGardenViewpoint,
  onMoveCamera,
}) => {
  const [activeTab, setActiveTab] = useState<'light' | 'wave' | 'optics' | 'water' | 'cam' | 'audio'>('light');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [volumeMenuOpen, setVolumeMenuOpen] = useState(false);
  const [weatherDropdownOpen, setWeatherDropdownOpen] = useState(false);
  const [beachModalOpen, setBeachModalOpen] = useState(false);
  const [underwaterModalOpen, setUnderwaterModalOpen] = useState(false);
  const [isCenterUIHidden, setIsCenterUIHidden] = useState(false);
  const [isFullZenMode, setIsFullZenMode] = useState(false);
  const [weatherToast, setWeatherToast] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(waterAudio.getMuted());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [activeGardenViewpoint, setActiveGardenViewpoint] = useState<'deck' | 'pond' | 'stepping' | 'pine' | 'lantern' | 'bamboo'>('deck');
  const [showStrollDpad, setShowStrollDpad] = useState(false);

  // Global Keyboard shortcuts: 'H' for Center UI toggle, 'Z' for Full Zen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'h' || e.key === 'H') {
        setIsCenterUIHidden((prev) => {
          const next = !prev;
          setWeatherToast(
            next
              ? "👁️ 화면 가운데 설정 UI가 숨겨졌습니다. ('H' 키로 언제든 다시 표시)"
              : "👁️ 화면 가운데 설정 UI가 표시되었습니다."
          );
          return next;
        });
      } else if (e.key === 'z' || e.key === 'Z') {
        setIsFullZenMode((prev) => {
          const next = !prev;
          setWeatherToast(
            next
              ? "🧘 몰입 감상 모드 활성화 (화면 우상단 버튼 또는 'Z' 키로 복원)"
              : "🧘 일반 뷰 모드로 복원되었습니다."
          );
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Audio parameters from config
  const isAudioActive = config.soundEnabled ?? false;
  const masterVolume = config.masterVolume ?? 0.6;
  const ambientVolume = config.ambientVolume ?? 0.5;
  const ambientMode = config.ambientMode ?? 'waves';

  const currentWeather =
    WEATHER_PRESETS.find((w) => w.id === config.weather) || WEATHER_PRESETS[0];

  const selectedBeach =
    CRYSTAL_BEACH_PRESETS.find((b) => b.id === config.selectedBeachId) || CRYSTAL_BEACH_PRESETS[0];

  const applyWeatherPreset = (weatherId: string) => {
    const preset = WEATHER_PRESETS.find((w) => w.id === weatherId);
    if (!preset) return;

    onChangeConfig({
      ...config,
      ...preset.config,
      weather: preset.id,
    });

    setWeatherDropdownOpen(false);
    setWeatherToast(`${preset.icon} ${preset.name} (${preset.englishName}) 적용: 풍속 ${preset.windSpeed}m/s · 파고 ${preset.waveScale} · 조도 ${preset.sunIntensity}`);
  };

  const applyBeachPreset = (beachId: string) => {
    const beach = CRYSTAL_BEACH_PRESETS.find((b) => b.id === beachId);
    if (!beach) return;

    onChangeConfig({
      ...config,
      ...beach.config,
      waterEnvironment: 'ocean',
      selectedBeachId: beach.id,
    });

    setWeatherToast(`${beach.flag} ${beach.nameKo} (${beach.nameEn}): ${beach.tagline}`);
  };

  const applyEnvironment = (envId: WaterEnvironmentType) => {
    const envPreset = WATER_ENVIRONMENTS.find((e) => e.id === envId);
    if (!envPreset) return;

    onChangeConfig({
      ...config,
      ...envPreset.config,
      waterEnvironment: envId,
    });
    waterAudio.playDrop(0.7);
    setWeatherToast(`${envPreset.icon} ${envPreset.nameKo} (${envPreset.badge}) 환경 전환 완료`);
  };

  const applyUnderwaterPreset = (presetId: string) => {
    const preset = UNDERWATER_PRESETS.find((u) => u.id === presetId);
    if (!preset) return;

    onChangeConfig({
      ...config,
      ...preset.config,
      selectedUnderwaterPresetId: preset.id,
    });
    waterAudio.playDrop(0.75);
    setWeatherToast(`${preset.icon} ${preset.nameKo} (${preset.badge}): ${preset.tagline}`);
  };

  useEffect(() => {
    if (!weatherToast) return;
    const timer = setTimeout(() => {
      setWeatherToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [weatherToast]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!weatherDropdownOpen && !volumeMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.relative')) {
        setWeatherDropdownOpen(false);
        setVolumeMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [weatherDropdownOpen, volumeMenuOpen]);

  // Auto-hide hint after 7 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowHint(false);
    }, 7000);
    return () => clearTimeout(timer);
  }, []);

  const handleAudioToggle = () => {
    const nextActive = !isAudioActive;
    updateParam('soundEnabled', nextActive);
    waterAudio.setMuted(!nextActive);
    setIsMuted(!nextActive);
    if (nextActive) {
      waterAudio.playDrop(0.7);
    }
  };

  const handleMasterVolumeChange = (vol: number) => {
    const v = Math.max(0, Math.min(1, vol));
    const active = v > 0.001;
    onChangeConfig({
      ...config,
      masterVolume: v,
      soundEnabled: active,
    });
    waterAudio.setMasterVolume(v);
    setIsMuted(!active);
  };

  const handleAmbientVolumeChange = (vol: number) => {
    const v = Math.max(0, Math.min(1, vol));
    updateParam('ambientVolume', v);
    waterAudio.setAmbientVolume(v);
  };

  const handleAmbientModeChange = (mode: 'waves' | 'rain' | 'both' | 'calm') => {
    updateParam('ambientMode', mode);
    waterAudio.setAmbientMode(mode);
  };

  const handleFullscreenToggle = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const updateParam = <K extends keyof WaterConfig>(key: K, value: WaterConfig[K]) => {
    onChangeConfig({
      ...config,
      [key]: value,
    });
  };

  const [isDayCycling, setIsDayCycling] = useState(false);
  const currentTimeOfDay = config.timeOfDay ?? 12.5;
  const timeInfo = formatTimeOfDay(currentTimeOfDay);

  const handleTimeOfDayChange = (hours: number) => {
    const lighting = getTimeOfDayLighting(hours);
    onChangeConfig({
      ...config,
      timeOfDay: lighting.timeOfDay,
      sunElevation: lighting.sunElevation,
      sunAzimuth: lighting.sunAzimuth,
      sunIntensity: lighting.sunIntensity,
      colorTemperature: lighting.colorTemperature,
      sunColor: lighting.sunColor,
    });
  };

  const handleColorTemperatureChange = (kelvin: number) => {
    const rgb = kelvinToRGB(kelvin);
    onChangeConfig({
      ...config,
      colorTemperature: kelvin,
      sunColor: rgb,
    });
  };

  // Lens Diffraction & Bloom Glow control
  const currentDiffraction = config.diffractionIntensity ?? 1.0;
  const currentBloom = config.bloomIntensity ?? 1.0;
  const currentGlow = Number(((currentDiffraction + currentBloom) / 2).toFixed(2));

  const handleGlowChange = (glowValue: number) => {
    onChangeConfig({
      ...config,
      diffractionIntensity: glowValue,
      bloomIntensity: glowValue,
      glareEnabled: glowValue > 0.001,
    });
  };

  const handleDiffractionChange = (val: number) => {
    onChangeConfig({
      ...config,
      diffractionIntensity: val,
      glareEnabled: val > 0.001,
    });
  };

  const handleBloomChange = (val: number) => {
    onChangeConfig({
      ...config,
      bloomIntensity: val,
    });
  };

  const toggleGlowMute = () => {
    if (currentGlow > 0.05) {
      handleGlowChange(0.0);
    } else {
      handleGlowChange(1.0);
    }
  };

  // Wind Speed control & Beaufort Scale
  const currentWindSpeed = config.windSpeed ?? 6.0;
  const beaufortInfo = getBeaufortInfo(currentWindSpeed);

  const handleWindSpeedChange = (speed: number) => {
    onChangeConfig({
      ...config,
      windSpeed: Math.max(0.5, Math.min(25.0, Number(speed.toFixed(1)))),
    });
  };

  // Smooth daylight auto-progression loop
  useEffect(() => {
    if (!isDayCycling) return;
    let last = performance.now();
    let frameId: number;

    const cycleLoop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // 1 full cycle (6:00 -> 19:30, 13.5h) takes approx 38 seconds (~0.35h per sec)
      const cur = config.timeOfDay ?? 12.5;
      let next = cur + dt * 0.35;
      if (next > 19.3) next = 6.0;
      handleTimeOfDayChange(next);
      frameId = requestAnimationFrame(cycleLoop);
    };

    frameId = requestAnimationFrame(cycleLoop);
    return () => cancelAnimationFrame(frameId);
  }, [isDayCycling, config.timeOfDay]);

  const applyPreset = (presetId: string) => {
    const found = WATER_PRESETS.find((p) => p.id === presetId);
    if (found) {
      onChangeConfig({
        ...config,
        ...found.config,
      });
      waterAudio.playDrop(0.6);
    }
  };

  if (isFullZenMode) {
    return (
      <div className="absolute inset-0 pointer-events-none p-4 sm:p-6 overflow-hidden">
        {/* Zen / Immersive Mode Floating Restore Button */}
        <div className="fixed top-4 right-4 z-50 pointer-events-auto animate-in fade-in duration-300">
          <button
            onClick={() => {
              setIsFullZenMode(false);
              setWeatherToast('🧘 일반 뷰 모드로 복원되었습니다.');
            }}
            title="UI 복원하기 (단축키: Z)"
            className="px-3.5 py-1.5 rounded-full bg-black/80 hover:bg-black/95 border border-cyan-400/50 hover:border-cyan-300 text-white backdrop-blur-xl text-xs font-semibold flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all hover:scale-105 active:scale-95 group"
          >
            <Eye className="w-3.5 h-3.5 text-cyan-300 group-hover:text-cyan-200 animate-pulse" />
            <span className="text-cyan-100">UI 전체 복원</span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-cyan-300 border border-white/10">Z</kbd>
          </button>
        </div>

        {/* Weather Preset Notification Toast */}
        {weatherToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-slate-900/95 border border-sky-400/60 backdrop-blur-xl shadow-2xl flex items-center gap-2 text-xs text-sky-100 z-50 animate-in fade-in slide-in-from-top-2 pointer-events-none">
            <CloudSun className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="font-medium">{weatherToast}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 sm:p-6 overflow-hidden">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between gap-3 w-full pointer-events-auto">
        {/* App Title & Subtitle */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)] animate-pulse" />
            <h1 className="text-sm sm:text-base font-semibold tracking-tight text-white/95 font-sans drop-shadow-md">
              ClearWater 3D
            </h1>
            <span className="text-white/40 text-xs hidden md:inline">·</span>
            <span className="text-xs text-white/50 hidden md:inline font-mono">
              WebGL2 Physical Shallow Water Simulation
            </span>
          </div>
          <p className="text-[11px] text-white/60 hidden sm:block mt-0.5">
            Aureliengmz/clearwater 기반 실시간 파동 방정식 · 코스틱스 · 렌즈 회절 시뮬레이터
          </p>
        </div>

        {/* Top Action Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Underwater Environment Presets Quick Button */}
          <button
            onClick={() => setUnderwaterModalOpen(true)}
            title="수중환경 프리셋 (비단잉어 정원 연못, 알프스 빙하 계곡, 몰디브 산호초 라군 등 6대 프리셋)"
            className={`p-2 sm:px-3 sm:py-1.5 rounded-lg border text-xs font-medium backdrop-blur-md transition-all flex items-center gap-1.5 ${
              config.selectedUnderwaterPresetId
                ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                : 'bg-black/40 border-white/10 text-white/80 hover:bg-white/10'
            }`}
          >
            <span className="text-sm leading-none">🌊</span>
            <span className="hidden sm:inline font-medium">수중환경 프리셋</span>
            <span className="px-1 py-0.2 text-[9px] rounded bg-emerald-400/20 text-emerald-300 font-mono">6</span>
          </button>

          {/* Toggle Center UI Hide/Show Button */}
          <button
            onClick={() => {
              setIsCenterUIHidden(!isCenterUIHidden);
              setWeatherToast(
                isCenterUIHidden
                  ? '👁️ 화면 가운데 설정 UI가 표시되었습니다.'
                  : "👁️ 화면 가운데 설정 UI가 숨겨졌습니다. (단축키 'H')"
              );
            }}
            title={isCenterUIHidden ? "화면 가운데 설정 UI 표시 (단축키: H)" : "화면 가운데 설정 UI 숨기기 (단축키: H)"}
            className={`p-2 sm:px-2.5 sm:py-1.5 rounded-lg border text-xs font-medium backdrop-blur-md transition-all flex items-center gap-1.5 ${
              isCenterUIHidden
                ? 'bg-amber-500/25 border-amber-400/50 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                : 'bg-black/40 border-white/10 text-white/70 hover:bg-white/10'
            }`}
          >
            {isCenterUIHidden ? (
              <Eye className="w-4 h-4 text-amber-300 animate-pulse" />
            ) : (
              <EyeOff className="w-4 h-4 text-white/60" />
            )}
            <span className="hidden sm:inline">{isCenterUIHidden ? '중앙 UI 표시' : '중앙 UI 숨기기'}</span>
            <kbd className="hidden md:inline px-1 py-0.2 rounded bg-white/10 text-[9px] font-mono text-white/50">H</kbd>
          </button>

          {/* Quick Fish On/Off Toggle Button */}
          <button
            onClick={() => updateParam('fishEnabled', config.fishEnabled === false ? true : false)}
            title={config.fishEnabled !== false ? '물고기 숨기기 (순수 수면 및 파도 전용 모드로 감상)' : '물고기 생태계 표시하기'}
            className={`p-2 sm:px-3 sm:py-1.5 rounded-lg border text-xs font-medium backdrop-blur-md transition-all flex items-center gap-1.5 ${
              config.fishEnabled !== false
                ? 'bg-cyan-500/25 border-cyan-400/50 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                : 'bg-black/40 border-white/10 text-white/50 hover:bg-white/10'
            }`}
          >
            <Fish className={`w-4 h-4 ${config.fishEnabled !== false ? 'text-cyan-300' : 'text-white/40'}`} />
            <span className="hidden sm:inline font-medium">
              {config.fishEnabled !== false ? '물고기 켬' : '물고기 끔'}
            </span>
            {config.fishEnabled !== false && (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            )}
          </button>

          {/* Cinematic Mode Toggle Button */}
          <button
            onClick={() => updateParam('autoOrbit', !config.autoOrbit)}
            title={config.autoOrbit ? '시네마틱 모드 해제' : '시네마틱 모드 (360° 수면 자동 선회)'}
            className={`p-2 sm:px-3 sm:py-1.5 rounded-lg border text-xs font-medium backdrop-blur-md transition-all flex items-center gap-1.5 ${
              config.autoOrbit
                ? 'bg-amber-500/25 border-amber-400/50 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.35)]'
                : 'bg-black/40 border-white/10 text-white/70 hover:bg-white/10'
            }`}
          >
            <Film className={`w-4 h-4 ${config.autoOrbit ? 'animate-pulse text-amber-300' : ''}`} />
            <span className="hidden sm:inline">{config.autoOrbit ? '시네마틱 켬' : '시네마틱'}</span>
            {config.autoOrbit && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>

          {/* Audio FX & Ambient Water Sound Controller */}
          <div className="relative">
            <div className="flex items-center">
              <button
                onClick={handleAudioToggle}
                title={isAudioActive ? `사운드 끄기 (현재 ${Math.round(masterVolume * 100)}%)` : '수면 엠비언트 사운드 켜기'}
                className={`p-2 sm:px-2.5 sm:py-1.5 rounded-l-lg border-y border-l text-xs font-medium backdrop-blur-md transition-all flex items-center gap-1.5 ${
                  isAudioActive
                    ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                    : 'bg-black/40 border-white/10 text-white/70 hover:bg-white/10'
                }`}
              >
                {isAudioActive ? (
                  masterVolume < 0.35 ? (
                    <Volume1 className="w-4 h-4 text-cyan-300" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-cyan-300" />
                  )
                ) : (
                  <VolumeX className="w-4 h-4 text-white/50" />
                )}
                <span className="hidden sm:inline font-mono">
                  {isAudioActive ? `${Math.round(masterVolume * 100)}%` : '음소거'}
                </span>
                {isAudioActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse hidden sm:inline" />
                )}
              </button>

              <button
                onClick={() => setVolumeMenuOpen(!volumeMenuOpen)}
                title="음향 및 엠비언트 사운드스케이프 조절"
                className={`p-2 sm:px-1.5 sm:py-1.5 rounded-r-lg border-y border-r border-l border-l-white/10 text-xs backdrop-blur-md transition-all ${
                  volumeMenuOpen
                    ? 'bg-white/20 border-white/30 text-white'
                    : isAudioActive
                    ? 'bg-cyan-500/10 border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/20'
                    : 'bg-black/40 border-white/10 text-white/50 hover:bg-white/10'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Volume & Ambient Soundscape Popover */}
            {volumeMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-72 p-3.5 bg-black/90 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl z-50 text-xs text-white space-y-3 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-1 border-b border-white/10">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>엠비언트 수면 음향</span>
                  </div>
                  <button
                    onClick={() => {
                      setVolumeMenuOpen(false);
                      setDrawerOpen(true);
                      setActiveTab('audio');
                    }}
                    className="text-[10px] text-cyan-300 hover:underline"
                  >
                    상세 설정 &gt;
                  </button>
                </div>

                {/* Master Volume */}
                <div className="space-y-1">
                  <div className="flex justify-between text-white/80 text-[11px]">
                    <span>마스터 볼륨</span>
                    <span className="font-mono text-cyan-300 font-semibold">{Math.round(masterVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.02"
                    value={isAudioActive ? masterVolume : 0}
                    onChange={(e) => handleMasterVolumeChange(parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Ambient Water Volume */}
                <div className="space-y-1">
                  <div className="flex justify-between text-white/80 text-[11px]">
                    <span>물결 엠비언트 배경음</span>
                    <span className="font-mono text-sky-300 font-semibold">{Math.round(ambientVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.02"
                    value={ambientVolume}
                    onChange={(e) => handleAmbientVolumeChange(parseFloat(e.target.value))}
                    className="w-full accent-sky-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Ambient Soundscape Presets */}
                <div className="space-y-1 pt-1 border-t border-white/10">
                  <span className="text-[10px] text-white/50 block">사운드스케이프 테마</span>
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    {[
                      { id: 'waves', label: '🌊 잔잔한 파도' },
                      { id: 'rain', label: '🌧️ 포근한 빗소리' },
                      { id: 'both', label: '🌊+🌧️ 파도&비' },
                      { id: 'calm', label: '🍃 고요한 호수' },
                    ].map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => handleAmbientModeChange(theme.id as any)}
                        className={`p-1.5 rounded text-left transition-colors font-medium ${
                          ambientMode === theme.id
                            ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/40'
                            : 'bg-white/5 text-white/70 hover:bg-white/10'
                        }`}
                      >
                        {theme.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Weather Presets Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setWeatherDropdownOpen(!weatherDropdownOpen);
                setVolumeMenuOpen(false);
              }}
              title="날씨 프리셋 전환 (바람, 조도, 파고 자동 동기화)"
              className={`p-2 sm:px-2.5 sm:py-1.5 rounded-lg border text-xs font-medium backdrop-blur-md transition-all flex items-center gap-1.5 ${
                weatherDropdownOpen
                  ? 'bg-sky-500/25 border-sky-400/50 text-sky-200 shadow-[0_0_15px_rgba(14,165,233,0.35)]'
                  : 'bg-black/40 border-white/10 text-white/80 hover:bg-white/10'
              }`}
            >
              <span className="text-sm leading-none">{currentWeather.icon}</span>
              <span className="hidden md:inline font-medium">날씨: {currentWeather.name}</span>
              <span className="hidden sm:inline md:hidden font-medium">{currentWeather.name}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-white/60 transition-transform ${
                  weatherDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Weather Dropdown Menu */}
            {weatherDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-80 sm:w-96 p-3 bg-slate-950/95 backdrop-blur-2xl border border-sky-400/30 rounded-2xl shadow-2xl z-50 text-xs text-white space-y-2 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                  <div className="flex items-center gap-1.5 font-semibold text-white/95">
                    <CloudSun className="w-4 h-4 text-sky-400" />
                    <span>날씨 프리셋 (Weather Presets)</span>
                  </div>
                  <span className="text-[10px] text-sky-300/80 font-mono">바람 · 조도 · 파도 자동 연동</span>
                </div>

                <div className="space-y-1.5 max-h-[72vh] overflow-y-auto pr-1">
                  {WEATHER_PRESETS.map((preset) => {
                    const isCurrent = (config.weather ?? 'calm') === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => applyWeatherPreset(preset.id)}
                        className={`w-full p-2.5 rounded-xl border text-left transition-all ${
                          isCurrent
                            ? 'bg-sky-500/20 border-sky-400/60 shadow-md ring-1 ring-sky-400/40'
                            : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.08] text-white/80'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-base leading-none">{preset.icon}</span>
                            <div>
                              <span className={`font-semibold text-xs ${isCurrent ? 'text-sky-200' : 'text-white'}`}>
                                {preset.name}
                              </span>
                              <span className="text-[10px] text-white/40 ml-1.5 font-mono">
                                {preset.englishName}
                              </span>
                            </div>
                          </div>

                          {isCurrent && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-400/25 text-sky-200 font-semibold border border-sky-400/40">
                              ACTIVE
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-white/60 mb-2 leading-relaxed">
                          {preset.description}
                        </p>

                        {/* Real-time Parameters Strip */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-cyan-300">
                            💨 풍속 {preset.windSpeed}m/s
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-amber-300">
                            ☀️ 조도 {preset.sunIntensity}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-sky-300">
                            🌊 파고 {preset.waveScale}
                          </span>
                          {preset.rainMode && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-400/30 text-blue-300 font-medium">
                              🌧️ 비 내림
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* HDR / SDR Tone Mapping Mode Button */}
          <button
            onClick={() => updateParam('toneMappingMode', (config.toneMappingMode ?? 'hdr') === 'hdr' ? 'standard' : 'hdr')}
            title={(config.toneMappingMode ?? 'hdr') === 'hdr' ? 'HDR 톤 매핑 켜짐 (수면 태양광 반사 다이내믹 레인지 극대화) / 클릭하여 SDR로 전환' : '표준(SDR) 톤 매핑 / 클릭하여 HDR로 전환'}
            className={`p-2 sm:px-2.5 sm:py-1.5 rounded-lg border text-xs font-medium backdrop-blur-md transition-all flex items-center gap-1.5 ${
              (config.toneMappingMode ?? 'hdr') === 'hdr'
                ? 'bg-amber-500/25 border-amber-400/50 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                : 'bg-black/40 border-white/10 text-white/60 hover:bg-white/10'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${(config.toneMappingMode ?? 'hdr') === 'hdr' ? 'text-amber-300 animate-pulse' : 'text-white/40'}`} />
            <span className="font-mono font-bold tracking-wider">{(config.toneMappingMode ?? 'hdr') === 'hdr' ? 'HDR' : 'SDR'}</span>
          </button>

          {/* Zen / Immersive Full-Screen View Toggle Button */}
          <button
            onClick={() => {
              setIsFullZenMode(true);
              setWeatherToast("🧘 몰입 감상 모드 활성화 (화면 우상단 버튼 또는 'Z' 키로 복원)");
            }}
            title="전체 UI 숨기기 / 몰입 감상 모드 (단축키: Z)"
            className="p-2 sm:px-2.5 sm:py-1.5 rounded-lg border border-white/10 bg-black/40 text-white/70 hover:bg-white/10 backdrop-blur-md transition-all text-xs font-medium flex items-center gap-1.5"
          >
            <Compass className="w-4 h-4 text-cyan-300" />
            <span className="hidden sm:inline">몰입 모드</span>
            <kbd className="hidden md:inline px-1 py-0.2 rounded bg-white/10 text-[9px] font-mono text-white/50">Z</kbd>
          </button>

          {/* Snapshot Button */}
          <button
            onClick={onSnapshot}
            title="고해상도 스크린샷 저장"
            className="p-2 sm:px-3 sm:py-1.5 rounded-lg border border-white/10 bg-black/40 text-white/70 hover:bg-white/10 backdrop-blur-md transition-all text-xs font-medium flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">캡처</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={handleFullscreenToggle}
            title="전체화면 전환"
            className="p-2 rounded-lg border border-white/10 bg-black/40 text-white/70 hover:bg-white/10 backdrop-blur-md transition-all text-xs"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Tech Info Button */}
          <button
            onClick={() => setInfoOpen(true)}
            title="기술 명세 및 이론 보기"
            className="p-2 rounded-lg border border-white/10 bg-black/40 text-white/70 hover:bg-white/10 backdrop-blur-md transition-all text-xs"
          >
            <Info className="w-4 h-4" />
          </button>

          {/* Settings Drawer Toggle */}
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium backdrop-blur-md transition-all flex items-center gap-1.5 ${
              drawerOpen
                ? 'bg-white/20 border-white/30 text-white shadow-lg'
                : 'bg-black/50 border-white/15 text-white/90 hover:bg-white/10'
            }`}
          >
            <Sliders className="w-4 h-4 text-cyan-300" />
            <span>설정</span>
          </button>
        </div>
      </header>

      {/* Weather Preset Notification Toast */}
      {weatherToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-slate-900/95 border border-sky-400/60 backdrop-blur-xl shadow-2xl flex items-center gap-2 text-xs text-sky-100 z-50 animate-in fade-in slide-in-from-top-2 pointer-events-none">
          <CloudSun className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="font-medium">{weatherToast}</span>
        </div>
      )}

      {/* Preset Bar & Interaction Mode Bar (Center-Top) - Collapsible with 'H' shortcut */}
      {isCenterUIHidden ? (
        <div className="flex items-center justify-center w-full mx-auto pointer-events-auto my-1 animate-in fade-in slide-in-from-top-2 duration-300">
          <button
            onClick={() => {
              setIsCenterUIHidden(false);
              setWeatherToast('👁️ 화면 가운데 설정 UI가 표시되었습니다.');
            }}
            title="화면 가운데 설정 UI 다시 표시 (단축키: H)"
            className="px-3.5 py-1.5 rounded-full bg-black/80 hover:bg-black/95 border border-cyan-400/40 hover:border-cyan-300 text-white backdrop-blur-xl text-xs font-medium flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.25)] transition-all hover:scale-105 active:scale-95 group"
          >
            <Eye className="w-3.5 h-3.5 text-cyan-400 group-hover:text-cyan-300 animate-pulse" />
            <span className="font-semibold text-cyan-200">중앙 설정 UI 펼치기</span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-cyan-300 border border-white/10">
              H
            </kbd>
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 w-full max-w-2xl mx-auto pointer-events-auto animate-in fade-in slide-in-from-top-3 duration-200">
          {/* 🌿 연못 / 🏞️ 강 / 🌊 바다 수역 환경 선택기 & 숨기기 버튼 */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/75 border border-white/15 backdrop-blur-xl shadow-2xl">
          {WATER_ENVIRONMENTS.map((env) => {
            const isSelected = (config.waterEnvironment ?? 'river') === env.id;
            return (
              <button
                key={env.id}
                onClick={() => applyEnvironment(env.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 active:scale-95 ${
                  isSelected
                    ? env.id === 'pond'
                      ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                      : env.id === 'river'
                      ? 'bg-sky-500/30 text-sky-200 border border-sky-400/50 shadow-[0_0_12px_rgba(14,165,233,0.35)]'
                      : 'bg-blue-600/30 text-blue-200 border border-blue-400/50 shadow-[0_0_12px_rgba(37,99,235,0.35)]'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
                title={`${env.nameKo}: ${env.tagline}`}
              >
                <span className="text-sm">{env.icon}</span>
                <span>{env.nameKo}</span>
                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse" />}
              </button>
            );
          })}

            {/* 🌿 캣멀-롬 유려한 정원 수로 & 3D 호안석 정원 토글 */}
            {(config.waterEnvironment ?? 'river') === 'pond' && (
              <>
                <div className="w-[1px] h-4 bg-emerald-500/30 shrink-0 mx-0.5" />
                <button
                  onClick={() => {
                    const nextMode = (config.pondBorderMode ?? 'framed') === 'framed' ? 'fullscreen' : 'framed';
                    onChangeConfig({
                      ...config,
                      pondBorderMode: nextMode,
                    });
                    setWeatherToast(
                      nextMode === 'framed'
                        ? '🌿 고즈넉한 3D 정원 & 캣멀-롬 곡선 수로: 유려한 스플라인 수면, 호안석, 이끼 구릉, 춘일등롱 석등 활성화'
                        : '🌊 전체 화면 수면 모드: 화면 가득 찬 무경계 수면 활성화'
                    );
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 active:scale-95 ${
                    (config.pondBorderMode ?? 'framed') === 'framed'
                      ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/50 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                      : 'bg-white/5 text-white/70 hover:text-white border border-white/10'
                  }`}
                  title="정원 뷰 전환: 유려한 캣멀-롬 수로 및 3D 호안석 정원 ↔ 전체 화면 수면"
                >
                  <span className="text-xs">{(config.pondBorderMode ?? 'framed') === 'framed' ? '🌿' : '🌊'}</span>
                  <span>{(config.pondBorderMode ?? 'framed') === 'framed' ? '고즈넉한 정원 (곡선 수로)' : '화면 가득 수면'}</span>
                </button>
              </>
            )}

            <div className="w-[1px] h-4 bg-white/20 shrink-0 mx-0.5" />

            {/* Collapse/Hide Button */}
            <button
              onClick={() => {
                setIsCenterUIHidden(true);
                setWeatherToast("👁️ 화면 가운데 설정 UI를 숨겼습니다. (단축키 'H'로 언제든 다시 표시)");
              }}
              title="화면 가운데 설정 UI 숨기기 (단축키: H)"
              className="px-2 py-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1 text-[11px]"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">숨기기</span>
              <kbd className="text-[9px] font-mono px-1 py-0.2 rounded bg-white/10 text-white/40">H</kbd>
            </button>
          </div>

          {/* 🌿 3D Japanese Garden & Pond Viewpoint & Stroll Controller (정원 ↔ 연못 시점 이동 및 산책 네비게이션) */}
          {config.waterEnvironment === 'pond' && (
            <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-black/75 border border-emerald-500/30 backdrop-blur-xl shadow-2xl max-w-full">
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                  <span>🍵</span>
                  <span>정원 ↔ 연못 시점 이동 & 자유 탐색</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-400/20 text-emerald-200 font-mono">3D</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-white/50">
                  <span className="hidden md:inline font-mono">⌨️ WASD 정원 산책 / Q·E 수면·정원 높이</span>
                  <button
                    onClick={() => setShowStrollDpad(!showStrollDpad)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-all flex items-center gap-1 ${
                      showStrollDpad
                        ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400/50 shadow-sm'
                        : 'bg-white/5 text-white/70 hover:text-white border-white/10'
                    }`}
                    title="화면 터치/마우스 산책 네비게이션 조작기 표시"
                  >
                    <span>🚶‍♂️</span>
                    <span>{showStrollDpad ? '조작기 닫기' : '산책 패드'}</span>
                  </button>
                </div>
              </div>

              {/* 6 Viewpoint Selector Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                {[
                  {
                    id: 'deck' as const,
                    name: '툇마루 관람석',
                    icon: '🍵',
                    desc: '삼나무 툇마루에서 연못과 정원 전체 조망 (높이 1.35m)',
                    toast: '🍵 툇마루 관람석으로 이동했습니다. 전통 삼나무 툇마루에서 정원과 연못 전체를 조망합니다.',
                  },
                  {
                    id: 'pond' as const,
                    name: '연못 수면 밀착',
                    icon: '🌊',
                    desc: '수면 바로 위로 하강하여 물결, 연꽃/연잎, 비단잉어 밀착 조망 (높이 0.38m)',
                    toast: '🌊 연못 수면 밀착 시점으로 이동했습니다. 투명한 물결과 수련 연잎, 비단잉어가 눈앞을 스쳐 지나갑니다.',
                  },
                  {
                    id: 'stepping' as const,
                    name: '징검다리 산책로',
                    icon: '🪨',
                    desc: '연못 수로를 가로지르는 화강암 디딤돌 위 횡단 시점 (높이 0.65m)',
                    toast: '🪨 징검다리 디딤돌 위로 이동했습니다. 맑은 물이 발밑으로 흐르는 정취를 느낍니다.',
                  },
                  {
                    id: 'pine' as const,
                    name: '용트림 흑송',
                    icon: '🌲',
                    desc: '연못 위로 드리운 조형 흑송 고목 & 호안석 석축 클로즈업 (높이 0.85m)',
                    toast: '🌲 조형 흑송 & 호안석으로 이동했습니다. 굽이치는 흑송 고목의 솔잎과 수석을 감상합니다.',
                  },
                  {
                    id: 'lantern' as const,
                    name: '카스가 석등',
                    icon: '🏮',
                    desc: '6단 화강암 카스가 석등 화실 등불과 수양 붉은 단풍 (높이 0.95m)',
                    toast: '🏮 카스가 석등 & 수양 단풍으로 이동했습니다. 온화한 등불과 붉은 단풍잎의 조화를 감상합니다.',
                  },
                  {
                    id: 'bamboo' as const,
                    name: '대나무숲길',
                    icon: '🎋',
                    desc: '건인지 대나무 담장과 비단이끼 언덕길 산책 (높이 1.05m)',
                    toast: '🎋 대나무 담장 산책로로 이동했습니다. 정갈한 대나무 마디와 푸른 비단이끼 언덕을 산책합니다.',
                  },
                ].map((vp) => {
                  const isCurrent = activeGardenViewpoint === vp.id;
                  return (
                    <button
                      key={vp.id}
                      onClick={() => {
                        setActiveGardenViewpoint(vp.id);
                        onSetGardenViewpoint?.(vp.id);
                        if (config.pondBorderMode !== 'framed') {
                          onChangeConfig({ ...config, pondBorderMode: 'framed' });
                        }
                        setWeatherToast(vp.toast);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap active:scale-95 ${
                        isCurrent
                          ? 'bg-emerald-500/40 text-emerald-100 border border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                          : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10 border border-white/10'
                      }`}
                      title={vp.desc}
                    >
                      <span className="text-xs">{vp.icon}</span>
                      <span>{vp.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* 👁️ Dynamic Transparency & Water Surface Visibility Bar (시점 하강 시 정원 투명도 조절) */}
              <div className="flex items-center justify-between flex-wrap gap-2 pt-1.5 border-t border-white/10 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const next = !(config.gardenLowAngleTransparency !== false);
                      onChangeConfig({ ...config, gardenLowAngleTransparency: next });
                      setWeatherToast(next 
                        ? "👁️ 수면 시야 자동 확보 활성화: 시점이 낮아지면 정원 돌/식물이 자동으로 반투명해져 연못 수면을 가리지 않습니다."
                        : "🌿 정원 불투명 고정: 시점과 무관하게 모든 오브젝트가 100% 불투명하게 유지됩니다."
                      );
                    }}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1.5 active:scale-95 ${
                      config.gardenLowAngleTransparency !== false
                        ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400/40 shadow-sm shadow-cyan-500/10'
                        : 'bg-white/5 text-white/50 border-white/10 hover:text-white'
                    }`}
                    title="카메라 시점이 낮아졌을 때 정원 요소들이 수면을 가리지 않도록, 특정 높이 이하 오브젝트 투명도를 동적으로 조절합니다"
                  >
                    <span>{config.gardenLowAngleTransparency !== false ? '👁️' : '🔒'}</span>
                    <span>시점 하강 수면 투명도 조절</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-400/20 text-cyan-200 font-mono">
                      {config.gardenLowAngleTransparency !== false ? '자동 연동 ON' : 'OFF'}
                    </span>
                  </button>
                  <span className="text-[11px] text-white/40 hidden lg:inline">
                    (시점 하강 시 특정 높이 이하 돌·식물이 반투명화되어 수면 100% 확보)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-white/60">정원 투명도:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={config.gardenObjectOpacity ?? 1.0}
                    onChange={(e) => {
                      onChangeConfig({ ...config, gardenObjectOpacity: parseFloat(e.target.value) });
                    }}
                    className="w-16 md:w-24 accent-emerald-400 h-1.5 bg-white/20 rounded cursor-pointer"
                    title={`정원 오브젝트 기본 불투명도: ${Math.round((config.gardenObjectOpacity ?? 1.0) * 100)}%`}
                  />
                  <span className="text-[11px] font-mono text-emerald-300 w-9 text-right font-semibold">
                    {Math.round((config.gardenObjectOpacity ?? 1.0) * 100)}%
                  </span>
                </div>
              </div>

              {/* On-screen Walk D-Pad Controller */}
              {showStrollDpad && (
                <div className="mt-1 pt-1.5 border-t border-white/10 flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-emerald-300 font-semibold mr-1">산책:</span>
                    <button
                      onClick={() => onMoveCamera?.(0.65, 0, 0)}
                      className="px-2 py-1 rounded bg-white/10 hover:bg-emerald-500/30 text-white font-bold border border-white/15 active:scale-95"
                      title="앞으로 걷기 (단축키: W / ↑)"
                    >
                      ▲ 전진
                    </button>
                    <button
                      onClick={() => onMoveCamera?.(-0.65, 0, 0)}
                      className="px-2 py-1 rounded bg-white/10 hover:bg-emerald-500/30 text-white font-bold border border-white/15 active:scale-95"
                      title="뒤로 걷기 (단축키: S / ↓)"
                    >
                      ▼ 후진
                    </button>
                    <button
                      onClick={() => onMoveCamera?.(0, -0.65, 0)}
                      className="px-2 py-1 rounded bg-white/10 hover:bg-emerald-500/30 text-white font-bold border border-white/15 active:scale-95"
                      title="좌측 이동 (단축키: A / ←)"
                    >
                      ◀ 좌
                    </button>
                    <button
                      onClick={() => onMoveCamera?.(0, 0.65, 0)}
                      className="px-2 py-1 rounded bg-white/10 hover:bg-emerald-500/30 text-white font-bold border border-white/15 active:scale-95"
                      title="우측 이동 (단축키: D / →)"
                    >
                      ▶ 우
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-cyan-300 font-semibold mr-1">높이:</span>
                    <button
                      onClick={() => onMoveCamera?.(0, 0, -0.28)}
                      className="px-2 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-200 font-bold border border-cyan-400/30 active:scale-95 flex items-center gap-1"
                      title="연못 수면으로 내려가기 (단축키: Q / PageDown)"
                    >
                      <span>🌊</span>
                      <span>수면으로 하강</span>
                    </button>
                    <button
                      onClick={() => onMoveCamera?.(0, 0, 0.28)}
                      className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-200 font-bold border border-emerald-400/30 active:scale-95 flex items-center gap-1"
                      title="정원 언덕으로 올라오기 (단축키: E / Space / PageUp)"
                    >
                      <span>🌿</span>
                      <span>정원으로 상승</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Preset & Weather Selector */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/60 border border-white/10 backdrop-blur-xl shadow-2xl overflow-x-auto max-w-full scrollbar-none">
            {/* 🌊 6 Underwater Environment Presets Button */}
            <button
              onClick={() => setUnderwaterModalOpen(true)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/40 transition-all flex items-center gap-1.5 shrink-0 shadow-sm ring-1 ring-emerald-400/20 active:scale-95"
              title="수중환경 프리셋 (비단잉어 정원 연못, 알프스 빙하 계곡, 몰디브 산호초 라군 등 6대 프리셋)"
            >
              <span>🌊</span>
              <span className="font-bold">수중환경 프리셋</span>
              <span className="px-1 py-0.2 text-[9px] rounded bg-emerald-400/20 text-emerald-300 font-mono">6</span>
            </button>

            <div className="w-[1px] h-4 bg-white/20 shrink-0 mx-0.5" />

            {/* 12 Crystal Beaches Button */}
            <button
              onClick={() => setBeachModalOpen(true)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-teal-500/30 border border-teal-400/50 text-teal-200 hover:bg-teal-500/40 transition-all flex items-center gap-1.5 shrink-0 shadow-sm ring-1 ring-teal-400/20 active:scale-95"
              title="전세계 수정같이 투명한 12대 해변 탐험 및 광학 시뮬레이션 적용"
            >
              <span>🏖️</span>
              <span className="font-bold">세계 12대 수정 해변</span>
              <span className="px-1 py-0.2 text-[9px] rounded bg-teal-400/20 text-teal-300 font-mono">12</span>
            </button>

          <div className="w-[1px] h-4 bg-white/20 shrink-0 mx-0.5" />

          {/* Weather Dropdown Quick Button */}
          <button
            onClick={() => setWeatherDropdownOpen(!weatherDropdownOpen)}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-sky-500/25 border border-sky-400/40 text-sky-200 hover:bg-sky-500/35 transition-all flex items-center gap-1 shrink-0"
            title="날씨 프리셋 전환 (Calm Sea, Stormy Weather, Tropical Rain 등)"
          >
            <span>{currentWeather.icon}</span>
            <span>{currentWeather.name}</span>
            <ChevronDown className="w-3 h-3 text-sky-300" />
          </button>

          <div className="w-[1px] h-4 bg-white/20 shrink-0 mx-0.5" />

          {/* Water Presets */}
          {WATER_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className="px-2.5 sm:px-3 py-1 text-xs font-medium rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap active:scale-95 shrink-0"
            >
              {p.name.split(' (')[0]}
            </button>
          ))}
        </div>

        {/* Quick Interaction Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-black/50 border border-white/10 backdrop-blur-md text-xs">
          <button
            onClick={() => onChangeInteractionMode('ripple')}
            className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
              interactionMode === 'ripple'
                ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/30 shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Droplets className="w-3.5 h-3.5" />
            <span>물결 터치</span>
          </button>

          <button
            onClick={() => onChangeInteractionMode('orbit')}
            className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
              interactionMode === 'orbit'
                ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/30 shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>시점 회전</span>
          </button>

          <button
            onClick={() => updateParam('rainMode', !config.rainMode)}
            className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
              config.rainMode
                ? 'bg-blue-500/30 text-blue-300 border border-blue-400/30 shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <CloudRain className="w-3.5 h-3.5" />
            <span>{config.rainMode ? '비 내리는 중' : '비 내리기'}</span>
          </button>

          {/* Quick Fish On/Off Switch */}
          <button
            onClick={() => updateParam('fishEnabled', config.fishEnabled === false ? true : false)}
            className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
              config.fishEnabled !== false
                ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/30 shadow-sm'
                : 'text-white/50 hover:text-white'
            }`}
            title={config.fishEnabled !== false ? '물고기 숨기기 (순수 수면 전용 모드)' : '물고기 생태계 표시하기'}
          >
            <Fish className={`w-3.5 h-3.5 ${config.fishEnabled !== false ? 'text-cyan-300' : 'text-white/40'}`} />
            <span>{config.fishEnabled !== false ? '물고기 켬' : '물고기 끔'}</span>
          </button>

          <button
            onClick={() => updateParam('autoOrbit', !config.autoOrbit)}
            className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
              config.autoOrbit
                ? 'bg-amber-500/30 text-amber-300 border border-amber-400/30 shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
            title="시네마틱 모드 (수면 주위를 360도 천천히 자동 회전)"
          >
            <Film className="w-3.5 h-3.5" />
            <span>{config.autoOrbit ? '시네마틱 순항 중' : '시네마틱'}</span>
          </button>
        </div>

        {/* Quick Time of Day Slider Bar */}
        <div className="w-full max-w-lg px-3 py-2 rounded-xl bg-black/65 border border-white/15 backdrop-blur-xl shadow-2xl flex items-center gap-2.5 text-xs text-white/90">
          <button
            onClick={() => setIsDayCycling(!isDayCycling)}
            title={isDayCycling ? '시간 자동 흐름 일시정지' : '하루 햇살 자동 흐름 재생'}
            className={`p-1.5 rounded-lg border transition-all shrink-0 flex items-center justify-center ${
              isDayCycling
                ? 'bg-amber-500/30 border-amber-400/50 text-amber-300 shadow-sm animate-pulse'
                : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            {isDayCycling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-base select-none">{timeInfo.icon}</span>
            <span className="font-mono text-cyan-300 font-semibold text-xs tracking-tight">
              {timeInfo.period}
            </span>
            <span className="text-[11px] text-white/50 hidden sm:inline font-sans">
              ({timeInfo.nameKo})
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-0.5">
            <input
              type="range"
              min="6.0"
              max="19.5"
              step="0.05"
              value={currentTimeOfDay}
              onChange={(e) => {
                if (isDayCycling) setIsDayCycling(false);
                handleTimeOfDayChange(parseFloat(e.target.value));
              }}
              aria-label="Time of Day"
              title="시간대 조절 (일출 ~ 일몰)"
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-white"
              style={{
                background:
                  'linear-gradient(to right, #ea580c 0%, #f59e0b 20%, #38bdf8 50%, #60a5fa 75%, #f43f5e 100%)',
              }}
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full border border-white/30 shrink-0"
              style={{
                backgroundColor: `rgb(${Math.round(config.sunColor[0] * 255)}, ${Math.round(
                  config.sunColor[1] * 255
                )}, ${Math.round(config.sunColor[2] * 255)})`,
              }}
              title="현재 태양광 색온도 색상"
            />
            <span className="text-amber-300 font-medium">{config.colorTemperature}K</span>
            <span className="text-white/20">·</span>
            <span className="text-cyan-300 font-medium">{config.sunIntensity.toFixed(1)}x</span>
          </div>
        </div>

        {/* Quick Lens Diffraction & Bloom Glow Slider Bar */}
        <div className="w-full max-w-lg px-3 py-2 rounded-xl bg-black/70 border border-white/15 backdrop-blur-xl shadow-2xl flex flex-col gap-2 text-xs text-white/90">
          {/* Row 1: Lens Diffraction Glare */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = (config.diffractionIntensity ?? 1.0) > 0.05 ? 0.0 : 1.0;
                handleDiffractionChange(next);
              }}
              title={currentDiffraction > 0.05 ? '윤슬 회절 글레어 끄기' : '윤슬 회절 글레어 켜기 (1.0x)'}
              className={`p-1.5 rounded-lg border transition-all shrink-0 flex items-center justify-center ${
                currentDiffraction > 0.05 && config.glareEnabled
                  ? 'bg-amber-500/25 border-amber-400/50 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${currentDiffraction > 1.2 ? 'animate-pulse' : ''}`} />
            </button>

            <div className="flex items-center gap-1 shrink-0 min-w-[70px]">
              <span className="font-semibold text-white/95 text-xs tracking-tight">회절 글레어</span>
            </div>

            <div className="flex-1 flex flex-col justify-center">
              <input
                type="range"
                min="0.0"
                max="3.0"
                step="0.05"
                value={currentDiffraction}
                onChange={(e) => handleDiffractionChange(parseFloat(e.target.value))}
                aria-label="Lens Diffraction Glare Intensity"
                title="수면 태양광 렌즈 회절 스파이크 글레어 강도 조절"
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-amber-400"
                style={{
                  background:
                    'linear-gradient(to right, #334155 0%, #b45309 30%, #f59e0b 70%, #fbbf24 100%)',
                }}
              />
            </div>

            {/* Quick Presets for Diffraction */}
            <div className="hidden sm:flex items-center gap-1 shrink-0 font-mono text-[10px]">
              {[
                { val: 0.0, label: '0x' },
                { val: 1.0, label: '1x' },
                { val: 2.0, label: '2x' },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => handleDiffractionChange(p.val)}
                  className={`px-1.5 py-0.5 rounded border transition-colors ${
                    Math.abs(currentDiffraction - p.val) < 0.15
                      ? 'bg-amber-500/30 border-amber-400/50 text-amber-200'
                      : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 shrink-0 text-[11px] font-mono">
              <span className="text-amber-300 font-semibold min-w-[2.2rem] text-right">
                {currentDiffraction.toFixed(2)}x
              </span>
            </div>
          </div>

          {/* Row 2: Bloom Intensity */}
          <div className="flex items-center gap-2 pt-1.5 border-t border-white/10">
            <button
              onClick={() => {
                const next = (config.bloomIntensity ?? 1.0) > 0.05 ? 0.0 : 1.0;
                handleBloomChange(next);
              }}
              title={currentBloom > 0.05 ? '블룸 광휘 끄기' : '블룸 광휘 켜기 (1.0x)'}
              className={`p-1.5 rounded-lg border transition-all shrink-0 flex items-center justify-center ${
                currentBloom > 0.05
                  ? 'bg-cyan-500/25 border-cyan-400/50 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.35)]'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${currentBloom > 1.2 ? 'animate-pulse text-cyan-300' : 'text-cyan-400'}`} />
            </button>

            <div className="flex items-center gap-1 shrink-0 min-w-[70px]">
              <span className="font-semibold text-cyan-200 text-xs tracking-tight">블룸 강도</span>
            </div>

            <div className="flex-1 flex flex-col justify-center">
              <input
                type="range"
                min="0.0"
                max="3.0"
                step="0.05"
                value={currentBloom}
                onChange={(e) => handleBloomChange(parseFloat(e.target.value))}
                aria-label="Bloom Intensity Slider"
                title="태양광 및 수면 반사체 주변으로 퍼지는 블룸 헤일로 광채 강도 조절"
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                style={{
                  background:
                    'linear-gradient(to right, #1e293b 0%, #0369a1 30%, #06b6d4 70%, #67e8f9 100%)',
                }}
              />
            </div>

            {/* Quick Presets for Bloom */}
            <div className="hidden sm:flex items-center gap-1 shrink-0 font-mono text-[10px]">
              {[
                { val: 0.0, label: '0x' },
                { val: 1.0, label: '1x' },
                { val: 2.0, label: '2x' },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => handleBloomChange(p.val)}
                  className={`px-1.5 py-0.5 rounded border transition-colors ${
                    Math.abs(currentBloom - p.val) < 0.15
                      ? 'bg-cyan-500/30 border-cyan-400/50 text-cyan-200'
                      : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 shrink-0 text-[11px] font-mono">
              <span className="text-cyan-300 font-semibold min-w-[2.2rem] text-right">
                {currentBloom.toFixed(2)}x
              </span>
            </div>
          </div>
        </div>

        {/* Quick Pond Floor Light Caustics Slider Bar (연못 바닥 수중 코스틱스 / 햇살 투영 조절바) */}
        <div className="w-full max-w-lg px-3 py-2 rounded-xl bg-black/65 border border-amber-500/20 backdrop-blur-xl shadow-2xl flex items-center gap-2.5 text-xs text-white/90">
          <button
            onClick={() => {
              const currentVal = config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0;
              const nextVal = currentVal > 0.1 ? 0.0 : 1.25;
              onChangeConfig({
                ...config,
                causticsIntensity: nextVal,
                underwaterCausticsIntensity: nextVal,
              });
              setWeatherToast(nextVal === 0 ? '🌑 바닥 코스틱스 소멸 (어두운 그늘)' : '☀️ 바닥 코스틱스 활성화 (1.25x 햇살)');
            }}
            title={(config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0) > 0.1 ? '연못 바닥 코스틱스 끄기 (그늘진 수중 연출)' : '연못 바닥 코스틱스 켜기 (햇살 가득한 연못)'}
            className={`p-1.5 rounded-lg border transition-all shrink-0 flex items-center justify-center ${
              (config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0) > 0.1
                ? 'bg-amber-500/25 border-amber-400/50 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
                : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
            }`}
          >
            <Sun className={`w-3.5 h-3.5 ${(config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0) > 1.5 ? 'animate-pulse text-amber-300' : ''}`} />
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-semibold text-white/95 text-xs tracking-tight">바닥 코스틱스</span>
            <span className="text-[11px] text-amber-300/80 font-mono hidden sm:inline">
              (Sun-Drenched)
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-0.5">
            <input
              type="range"
              min="0.0"
              max="3.0"
              step="0.05"
              value={config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                onChangeConfig({
                  ...config,
                  causticsIntensity: val,
                  underwaterCausticsIntensity: val,
                });
              }}
              aria-label="Pond Floor Light Caustics Intensity"
              title="연못 바닥 수중 햇살 집광 코스틱스 강도 (더 어둡거나 더 눈부신 햇살 투영 조절)"
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-amber-400"
              style={{
                background:
                  'linear-gradient(to right, #1e293b 0%, #0e7490 20%, #d97706 60%, #fef08a 100%)',
              }}
            />
          </div>

          {/* Quick Preset Buttons */}
          <div className="hidden sm:flex items-center gap-1 shrink-0 font-mono text-[10px]">
            {[
              { val: 0.2, label: '그늘' },
              { val: 1.0, label: '표준' },
              { val: 2.2, label: '찬란' },
            ].map((p) => {
              const isSel = Math.abs((config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0) - p.val) < 0.25;
              return (
                <button
                  key={p.label}
                  onClick={() => {
                    onChangeConfig({
                      ...config,
                      causticsIntensity: p.val,
                      underwaterCausticsIntensity: p.val,
                    });
                  }}
                  className={`px-1.5 py-0.5 rounded border transition-colors ${
                    isSel
                      ? 'bg-amber-500/30 border-amber-400/50 text-amber-200'
                      : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                  }`}
                  title={`${p.val.toFixed(1)}x`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full border border-white/40 shrink-0 transition-all"
              style={{
                backgroundColor: (config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0) > 0.1 ? '#f59e0b' : '#334155',
                boxShadow: (config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0) > 0.5 ? `0 0 ${Math.min(12, (config.underwaterCausticsIntensity ?? 1.0) * 4)}px rgba(245,158,11,0.9)` : 'none',
              }}
              title="현재 바닥 코스틱스 광량 상태"
            />
            <span className="text-amber-300 font-semibold min-w-[2.6rem] text-right">
              {(config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0).toFixed(2)}x
            </span>
          </div>
        </div>

        {/* Quick Wind Speed Slider Bar */}
        <div className="w-full max-w-lg px-3 py-2 rounded-xl bg-black/65 border border-white/15 backdrop-blur-xl shadow-2xl flex items-center gap-2.5 text-xs text-white/90">
          <div
            title={`보퍼트 풍력 계급 ${beaufortInfo.scale}: ${beaufortInfo.nameKo} (${beaufortInfo.nameEn})\n${beaufortInfo.desc}\nFFT 파도 파고 및 주파수 동적 반영`}
            className="p-1.5 rounded-lg border border-sky-400/30 bg-sky-500/15 text-sky-300 shadow-sm shrink-0 flex items-center justify-center"
          >
            <Wind className={`w-3.5 h-3.5 ${currentWindSpeed > 10 ? 'animate-pulse text-sky-200' : ''}`} />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-semibold text-white/95 text-xs tracking-tight">바람 세기</span>
            <span className="text-[11px] text-sky-300/80 font-mono hidden sm:inline">
              (Wind)
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-0.5">
            <input
              type="range"
              min="1.0"
              max="20.0"
              step="0.1"
              value={currentWindSpeed}
              onChange={(e) => handleWindSpeedChange(parseFloat(e.target.value))}
              aria-label="Wind Speed"
              title="바람 세기 조절 (FFT 해양 파도의 진폭 및 주파수에 동적 반영)"
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-white"
              style={{
                background:
                  'linear-gradient(to right, #0284c7 0%, #06b6d4 25%, #10b981 50%, #f59e0b 75%, #ef4444 100%)',
              }}
            />
          </div>

          {/* Quick Preset Buttons for Wind */}
          <div className="hidden sm:flex items-center gap-1 shrink-0 font-mono text-[10px]">
            {[
              { val: 2.0, label: '2m' },
              { val: 6.0, label: '6m' },
              { val: 12.0, label: '12m' },
              { val: 18.0, label: '18m' },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => handleWindSpeedChange(p.val)}
                className={`px-1.5 py-0.5 rounded border transition-colors ${
                  Math.abs(currentWindSpeed - p.val) < 0.6
                    ? 'bg-sky-500/30 border-sky-400/50 text-sky-200'
                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                }`}
                title={`${p.val} m/s`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full border border-white/40 shrink-0 transition-all"
              style={{
                backgroundColor: currentWindSpeed > 14 ? '#ef4444' : currentWindSpeed > 8 ? '#f59e0b' : '#38bdf8',
                boxShadow: `0 0 ${Math.min(10, currentWindSpeed * 0.6)}px rgba(56, 189, 248, 0.8)`,
              }}
              title={`현재 풍력: ${beaufortInfo.nameKo}`}
            />
            <span className="text-sky-300 font-semibold min-w-[2.4rem] text-right">
              {currentWindSpeed.toFixed(1)}
            </span>
            <span className="text-[10px] text-white/50 font-sans hidden min-[400px]:inline">m/s</span>
          </div>
        </div>
      </div>
      )}

      {/* Floating Interactive Settings Drawer (Right Side) */}
      {drawerOpen && (
        <aside className="pointer-events-auto fixed top-16 right-4 sm:right-6 bottom-16 w-80 sm:w-96 bg-black/85 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-40 text-slate-200 animate-in fade-in slide-in-from-right-4 duration-200">
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-white tracking-tight">수면 시뮬레이션 파라미터</h2>
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-1 rounded-md hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Category Tabs */}
          <div className="flex border-b border-white/10 text-xs px-2 pt-2 bg-black/40 gap-1 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('light')}
              className={`px-2.5 py-1.5 rounded-t-md font-medium transition-colors flex items-center gap-1 ${
                activeTab === 'light'
                  ? 'bg-white/10 text-cyan-300 border-b-2 border-cyan-400'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>조명</span>
            </button>
            <button
              onClick={() => setActiveTab('wave')}
              className={`px-2.5 py-1.5 rounded-t-md font-medium transition-colors flex items-center gap-1 ${
                activeTab === 'wave'
                  ? 'bg-white/10 text-cyan-300 border-b-2 border-cyan-400'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Waves className="w-3.5 h-3.5" />
              <span>파도</span>
            </button>
            <button
              onClick={() => setActiveTab('optics')}
              className={`px-2.5 py-1.5 rounded-t-md font-medium transition-colors flex items-center gap-1 ${
                activeTab === 'optics'
                  ? 'bg-white/10 text-cyan-300 border-b-2 border-cyan-400'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>코스틱</span>
            </button>
            <button
              onClick={() => setActiveTab('water')}
              className={`px-2.5 py-1.5 rounded-t-md font-medium transition-colors flex items-center gap-1 ${
                activeTab === 'water'
                  ? 'bg-white/10 text-cyan-300 border-b-2 border-cyan-400'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>수질</span>
            </button>
            <button
              onClick={() => setActiveTab('cam')}
              className={`px-2.5 py-1.5 rounded-t-md font-medium transition-colors flex items-center gap-1 ${
                activeTab === 'cam'
                  ? 'bg-white/10 text-cyan-300 border-b-2 border-cyan-400'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>카메라</span>
            </button>
            <button
              onClick={() => setActiveTab('audio')}
              className={`px-2.5 py-1.5 rounded-t-md font-medium transition-colors flex items-center gap-1 ${
                activeTab === 'audio'
                  ? 'bg-white/10 text-cyan-300 border-b-2 border-cyan-400'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>사운드</span>
            </button>
          </div>

          {/* Controls Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-sans">
            {/* 1. LIGHT TAB */}
            {activeTab === 'light' && (
              <div className="space-y-4">
                {/* 1.1 Time of Day Section */}
                <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-white/90 font-medium">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>시간대 (Time of Day)</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 border border-white/15 text-[11px] font-mono text-cyan-300">
                      <span>{timeInfo.icon}</span>
                      <span className="font-semibold">{timeInfo.period}</span>
                      <span className="text-white/40">·</span>
                      <span className="text-amber-300 font-sans">{timeInfo.nameKo}</span>
                    </div>
                  </div>

                  {/* Main Time Slider */}
                  <div>
                    <input
                      type="range"
                      min="6.0"
                      max="19.5"
                      step="0.05"
                      value={currentTimeOfDay}
                      onChange={(e) => {
                        if (isDayCycling) setIsDayCycling(false);
                        handleTimeOfDayChange(parseFloat(e.target.value));
                      }}
                      className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-white"
                      style={{
                        background:
                          'linear-gradient(to right, #ea580c 0%, #f59e0b 22%, #38bdf8 50%, #60a5fa 75%, #f43f5e 100%)',
                      }}
                    />
                    <div className="flex justify-between text-[10px] text-white/40 mt-1 font-mono">
                      <span>🌅 일출 (06:00)</span>
                      <span>☀️ 정오 (12:30)</span>
                      <span>🌆 일몰 (19:15)</span>
                    </div>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    {TIME_OF_DAY_PRESETS.map((preset) => {
                      const isSelected = Math.abs(currentTimeOfDay - preset.time) < 0.45;
                      return (
                        <button
                          key={preset.label}
                          onClick={() => {
                            if (isDayCycling) setIsDayCycling(false);
                            handleTimeOfDayChange(preset.time);
                          }}
                          className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-all flex flex-col items-center justify-center gap-0.5 ${
                            isSelected
                              ? 'bg-amber-500/25 border-amber-400/50 text-white shadow-sm'
                              : 'bg-black/30 border-white/10 text-white/70 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <span>{preset.icon}</span>
                            <span>{preset.label}</span>
                          </div>
                          <span className="text-[9px] text-white/40 font-mono">{preset.sub}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Physical Atmospheric Sync Feedback Card */}
                  <div className="p-2 rounded-lg bg-black/40 border border-white/5 grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div>
                      <div className="text-white/40">태양 고도</div>
                      <div className="font-mono text-cyan-300 font-semibold mt-0.5">
                        {config.sunElevation.toFixed(0)}°
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40">빛 강도</div>
                      <div className="font-mono text-cyan-300 font-semibold mt-0.5">
                        {config.sunIntensity.toFixed(1)}x
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40">색온도</div>
                      <div className="font-mono text-amber-300 font-semibold mt-0.5">
                        {config.colorTemperature}K
                      </div>
                    </div>
                  </div>
                </div>

                {/* 1.2 Color Temperature Slider */}
                <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-white/90 font-medium">
                      <Thermometer className="w-3.5 h-3.5 text-orange-400" />
                      <span>색온도 (Color Temperature)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-3 h-3 rounded-full border border-white/30 shadow-sm"
                        style={{
                          backgroundColor: `rgb(${Math.round(config.sunColor[0] * 255)}, ${Math.round(
                            config.sunColor[1] * 255
                          )}, ${Math.round(config.sunColor[2] * 255)})`,
                        }}
                      />
                      <span className="font-mono text-amber-300 font-semibold text-xs">
                        {config.colorTemperature}K
                      </span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min="2000"
                    max="8000"
                    step="50"
                    value={config.colorTemperature}
                    onChange={(e) => handleColorTemperatureChange(parseFloat(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-white"
                    style={{
                      background:
                        'linear-gradient(to right, #ff6b1a 0%, #ffa54f 20%, #ffe0b2 45%, #ffffff 65%, #c8e0ff 100%)',
                    }}
                  />

                  <div className="flex justify-between text-[10px] text-white/40 font-mono">
                    <span>2000K (석양 붉은빛)</span>
                    <span>5500K (한낮 햇살)</span>
                    <span>8000K (푸른 하늘빛)</span>
                  </div>

                  {/* Color Temperature Quick Chips */}
                  <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pt-0.5">
                    {[
                      { k: 2200, label: '2200K 노을' },
                      { k: 3200, label: '3200K 골든' },
                      { k: 5500, label: '5500K 햇살' },
                      { k: 6500, label: '6500K 주광' },
                      { k: 7500, label: '7500K 청천' },
                    ].map((chip) => (
                      <button
                        key={chip.k}
                        onClick={() => handleColorTemperatureChange(chip.k)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors whitespace-nowrap ${
                          Math.abs(config.colorTemperature - chip.k) < 150
                            ? 'bg-amber-500/30 border-amber-400/50 text-white'
                            : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 1.3 Light Intensity Slider */}
                <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-white/80">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Sun className="w-3.5 h-3.5 text-yellow-400" />
                      <span>태양광 강도 (Light Radiance)</span>
                    </div>
                    <span className="font-mono text-cyan-300 font-semibold">{config.sunIntensity.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="10.0"
                    step="0.2"
                    value={config.sunIntensity}
                    onChange={(e) => updateParam('sunIntensity', parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-white/40">
                    <span>은은한 광원 (1.0x)</span>
                    <span>강렬한 정오 (10.0x)</span>
                  </div>
                </div>

                {/* 1.3.1 연못 바닥 수중 코스틱스 광원 / 햇살 투영 (Pond Floor Light Caustics / Sun-Drenched Underwater) */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-950/30 via-cyan-950/20 to-black/40 border border-amber-500/30 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sun className="w-4 h-4 text-amber-400 animate-pulse" />
                      <span className="font-semibold text-white text-xs tracking-wide">
                        연못 바닥 코스틱스 강도 (Pond Floor Light Caustics)
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-[11px] font-mono text-amber-300 font-bold">
                      {(config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0).toFixed(2)}x
                    </span>
                  </div>

                  <p className="text-[11px] text-white/65 leading-relaxed">
                    태양광이 수면 굴절을 거쳐 연못 바닥 조약돌과 디딤돌, 유목에 맺히는 햇살 집광 무늬(Caustics)의 강도를 조절하여, 깊고 차분한 그늘진 연못부터 햇빛이 쏟아져 내리는 눈부신 수중까지 연출할 수 있습니다.
                  </p>

                  <div>
                    <input
                      type="range"
                      min="0.0"
                      max="3.0"
                      step="0.05"
                      value={config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        onChangeConfig({
                          ...config,
                          causticsIntensity: val,
                          underwaterCausticsIntensity: val,
                        });
                      }}
                      className="w-full accent-amber-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-white/40 mt-0.5 font-mono">
                      <span>0.0x (어두운 그늘)</span>
                      <span>1.0x (자연광 표준)</span>
                      <span>2.0x (찬란한 일광)</span>
                      <span>3.0x (강렬한 햇살)</span>
                    </div>
                  </div>

                  {/* Quick chips */}
                  <div className="flex items-center gap-1.5 pt-1 overflow-x-auto scrollbar-none">
                    {[
                      { val: 0.1, label: '0.1x 차분한 그늘' },
                      { val: 0.6, label: '0.6x 온화한 빛' },
                      { val: 1.0, label: '1.0x 자연광' },
                      { val: 1.8, label: '1.8x 화사한 햇살' },
                      { val: 2.5, label: '2.5x 눈부신 일광' },
                    ].map((chip) => {
                      const isCurrent = Math.abs((config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0) - chip.val) < 0.15;
                      return (
                        <button
                          key={chip.label}
                          onClick={() => {
                            onChangeConfig({
                              ...config,
                              causticsIntensity: chip.val,
                              underwaterCausticsIntensity: chip.val,
                            });
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors whitespace-nowrap ${
                            isCurrent
                              ? 'bg-amber-500/30 border-amber-400/50 text-white shadow-sm'
                              : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 1.4 Manual Angle Fine-tuning */}
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
                  <div className="text-[11px] font-medium text-white/60">태양 각도 미세 조정 (Fine Angle)</div>

                  <div>
                    <div className="flex justify-between text-white/70 mb-1">
                      <span>태양 고도 (Sun Elevation)</span>
                      <span className="font-mono text-cyan-300">{config.sunElevation.toFixed(0)}°</span>
                    </div>
                    <input
                      type="range"
                      min="3"
                      max="85"
                      step="1"
                      value={config.sunElevation}
                      onChange={(e) => updateParam('sunElevation', parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
                      <span>일몰/황혼 (3°)</span>
                      <span>정오 천정 (85°)</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-white/70 mb-1">
                      <span>태양 방위각 (Sun Azimuth)</span>
                      <span className="font-mono text-cyan-300">{config.sunAzimuth.toFixed(0)}°</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="2"
                      value={config.sunAzimuth}
                      onChange={(e) => updateParam('sunAzimuth', parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
                      <span>0° (정북)</span>
                      <span>90° (동)</span>
                      <span>180° (남)</span>
                      <span>270° (서)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. WAVE TAB */}
            {activeTab === 'wave' && (
              <div className="space-y-4">
                {/* 2.0 Weather Presets Selector */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-sky-950/30 via-black/40 to-slate-900/40 border border-sky-500/25 space-y-2.5 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-medium text-xs text-white/90">
                      <CloudSun className="w-4 h-4 text-sky-400" />
                      <span>날씨 프리셋 (Weather Presets)</span>
                    </div>
                    <span className="text-[10px] text-sky-300 font-mono">바람·빛·파도 자동 연동</span>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5">
                    {WEATHER_PRESETS.map((wp) => {
                      const active = (config.weather ?? 'calm') === wp.id;
                      return (
                        <button
                          key={wp.id}
                          onClick={() => applyWeatherPreset(wp.id)}
                          className={`p-2 rounded-lg border text-left transition-all ${
                            active
                              ? 'bg-sky-500/25 border-sky-400/50 text-white shadow-sm ring-1 ring-sky-400/30'
                              : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07] text-white/70'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5 font-medium text-xs">
                              <span>{wp.icon}</span>
                              <span className={active ? 'text-sky-200' : 'text-white'}>{wp.name}</span>
                              <span className="text-[10px] text-white/40 font-mono">({wp.englishName})</span>
                            </div>
                            {active && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-400/20 text-sky-300 font-semibold border border-sky-400/30">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-white/50 font-mono">
                            <span>풍속 {wp.windSpeed}m/s</span>
                            <span>·</span>
                            <span>파고 {wp.waveScale}</span>
                            <span>·</span>
                            <span>조도 {wp.sunIntensity}</span>
                            {wp.rainMode && <span>· 🌧️ 비</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2.1 Wind Speed & FFT Ocean Wave Dynamics */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-sky-950/40 via-black/40 to-slate-900/40 border border-sky-500/25 space-y-2.5 shadow-lg">
                  <div className="flex items-center justify-between text-white/90">
                    <div className="flex items-center gap-1.5 font-medium text-xs">
                      <Wind className="w-4 h-4 text-sky-400" />
                      <span>바람 세기 (Wind Speed)</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[10px] font-sans font-medium">
                        Lv.{beaufortInfo.scale} {beaufortInfo.nameKo}
                      </span>
                      <span className="text-sky-300 font-bold">{currentWindSpeed.toFixed(1)} m/s</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min="1.0"
                    max="20.0"
                    step="0.1"
                    value={currentWindSpeed}
                    onChange={(e) => handleWindSpeedChange(parseFloat(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-white"
                    style={{
                      background:
                        'linear-gradient(to right, #0284c7 0%, #06b6d4 25%, #10b981 50%, #f59e0b 75%, #ef4444 100%)',
                    }}
                  />

                  <div className="flex justify-between text-[10px] text-white/45 font-mono">
                    <span>1.0 m/s (고요)</span>
                    <span>6.0 m/s (표준 해풍)</span>
                    <span>20.0 m/s (거센 폭풍)</span>
                  </div>

                  {/* Wind Preset Chips */}
                  <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pt-0.5">
                    {[
                      { v: 2.0, l: '2m 잔잔' },
                      { v: 4.5, l: '4.5m 미풍' },
                      { v: 6.0, l: '6m 표준' },
                      { v: 10.0, l: '10m 백파' },
                      { v: 16.0, l: '16m 강풍' },
                    ].map((chip) => (
                      <button
                        key={chip.v}
                        onClick={() => handleWindSpeedChange(chip.v)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors whitespace-nowrap ${
                          Math.abs(currentWindSpeed - chip.v) < 0.6
                            ? 'bg-sky-500/30 border-sky-400/50 text-white font-medium'
                            : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {chip.l}
                      </button>
                    ))}
                  </div>

                  {/* Real-time Wave Physics Readouts */}
                  <div className="p-2 rounded-lg bg-black/40 border border-white/5 grid grid-cols-3 gap-1 text-center text-[10px] font-mono">
                    <div>
                      <span className="text-white/40 block text-[9px]">파고 진폭</span>
                      <span className="text-cyan-300 font-semibold">
                        {(Math.pow(currentWindSpeed / 6.0, 0.55)).toFixed(2)}x
                      </span>
                    </div>
                    <div>
                      <span className="text-white/40 block text-[9px]">전파 주파수</span>
                      <span className="text-sky-300 font-semibold">
                        {(0.72 + 0.28 * Math.sqrt(currentWindSpeed / 6.0)).toFixed(2)}x
                      </span>
                    </div>
                    <div>
                      <span className="text-white/40 block text-[9px]">첨두 파장</span>
                      <span className="text-teal-300 font-semibold">
                        {Math.max(0.12, 0.18 + 0.075 * currentWindSpeed).toFixed(2)}m
                      </span>
                    </div>
                  </div>

                  <p className="text-[10px] text-white/50 leading-relaxed">
                    풍속이 증가할수록 파도의 진폭(파고)이 커지고, 주파수 분산 관계에 따른 위상 속도와 장파장 너울이 발달합니다.
                  </p>
                </div>

                {/* 2.2 FFT Wave Choppiness Slider Card */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-cyan-950/30 via-black/40 to-slate-900/40 border border-cyan-500/25 space-y-2.5 shadow-lg">
                  <div className="flex items-center justify-between text-white/90">
                    <div className="flex items-center gap-1.5 font-medium text-xs">
                      <Waves className="w-4 h-4 text-cyan-400" />
                      <span>파도 첨두성 (Choppiness)</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-medium border ${
                          (config.choppiness ?? 1.1) < 0.4
                            ? 'bg-sky-500/20 text-sky-200 border-sky-400/30'
                            : (config.choppiness ?? 1.1) < 1.3
                            ? 'bg-teal-500/20 text-teal-200 border-teal-400/30'
                            : (config.choppiness ?? 1.1) < 1.8
                            ? 'bg-amber-500/20 text-amber-200 border-amber-400/30'
                            : 'bg-rose-500/20 text-rose-200 border-rose-400/30'
                        }`}
                      >
                        {(config.choppiness ?? 1.1) < 0.4
                          ? '🌊 둥근 너울 (Rolling Swells)'
                          : (config.choppiness ?? 1.1) < 1.3
                          ? '🌊 자연스러운 파도 (Natural)'
                          : (config.choppiness ?? 1.1) < 1.8
                          ? '🌊 가파른 쇄파 (Steep Crests)'
                          : '🌊 날카로운 부서짐 (Breaking)'}
                      </span>
                      <span className="text-cyan-300 font-bold font-mono">
                        {(config.choppiness ?? 1.1).toFixed(2)}x
                      </span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min="0.0"
                    max="2.5"
                    step="0.05"
                    value={config.choppiness ?? 1.1}
                    onChange={(e) => updateParam('choppiness', parseFloat(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-white"
                    style={{
                      background:
                        'linear-gradient(to right, #0284c7 0%, #06b6d4 35%, #10b981 60%, #f59e0b 85%, #f43f5e 100%)',
                    }}
                  />

                  <div className="flex justify-between text-[10px] text-white/45 font-mono">
                    <span>0.0 (완만한 너울 / Rolling)</span>
                    <span>1.1 (자연스러운 파도)</span>
                    <span>2.5 (날카로운 쇄파 / Breaking)</span>
                  </div>

                  {/* Choppiness Preset Chips */}
                  <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pt-0.5">
                    {[
                      { v: 0.0, l: '0.0 완만 너울' },
                      { v: 0.5, l: '0.5 부드러움' },
                      { v: 1.1, l: '1.1 표준 파도' },
                      { v: 1.6, l: '1.6 가파른 쇄파' },
                      { v: 2.2, l: '2.2 날카로운 파고' },
                    ].map((chip) => (
                      <button
                        key={chip.v}
                        onClick={() => updateParam('choppiness', chip.v)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors whitespace-nowrap ${
                          Math.abs((config.choppiness ?? 1.1) - chip.v) < 0.15
                            ? 'bg-cyan-500/30 border-cyan-400/50 text-white font-medium'
                            : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {chip.l}
                      </button>
                    ))}
                  </div>

                  <p className="text-[10px] text-white/50 leading-relaxed">
                    테센도르프(Tessendorf) 2D FFT 파도의 수평 변위 및 정점 첨두성(Choppiness)을 조절합니다. 0으로 낮추면 부드럽고 둥근 너울(Rolling Swells)이 되고, 값을 높이면 파고 정점이 뾰족하게 모여 날카롭게 부서지는 파도(Sharp, Breaking Waves)로 변환됩니다.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between text-white/80 mb-1">
                    <span>파도 기본 경사 (RMS Slope)</span>
                    <span className="font-mono text-cyan-300">{config.waveScale.toFixed(3)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.02"
                    max="0.14"
                    step="0.004"
                    value={config.waveScale}
                    onChange={(e) => updateParam('waveScale', parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
                    <span>잔잔한 호수</span>
                    <span>거센 바다 파도</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-white/80 mb-1">
                    <span>시뮬레이션 시간 속도</span>
                    <span className="font-mono text-cyan-300">{config.waveSpeed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="2.0"
                    step="0.05"
                    value={config.waveSpeed}
                    onChange={(e) => updateParam('waveSpeed', parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-white/80 mb-1">
                    <span>물 수심 (Mean Depth)</span>
                    <span className="font-mono text-cyan-300">{config.waterDepth.toFixed(1)} m</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="3.5"
                    step="0.1"
                    value={config.waterDepth}
                    onChange={(e) => updateParam('waterDepth', parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
                    <span>얕은 모래사장 (0.5m)</span>
                    <span>깊은 만 (3.5m)</span>
                  </div>
                </div>

                {config.rainMode && (
                  <div>
                    <div className="flex justify-between text-white/80 mb-1">
                      <span>빗방울 빈도 (Rain Rate)</span>
                      <span className="font-mono text-cyan-300">{config.rainIntensity} drops/s</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="8"
                      step="1"
                      value={config.rainIntensity}
                      onChange={(e) => updateParam('rainIntensity', parseInt(e.target.value, 10))}
                      className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                )}

                {/* 2.4 Circular Ripple Disturbances (클릭 & 드래그 원형 파문) */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-cyan-950/40 via-black/40 to-blue-950/40 border border-cyan-500/25 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between text-white/90">
                    <div className="flex items-center gap-1.5 font-medium text-xs">
                      <Droplets className="w-4 h-4 text-cyan-400" />
                      <span>원형 수면 파문 교란 (Circular Ripples)</span>
                    </div>
                    <span className="text-[10px] text-cyan-300 font-mono">2D Shallow Wave</span>
                  </div>

                  <p className="text-[11px] text-white/60 leading-normal">
                    자연 배경 파도와 독립적으로 동작하는 인터랙티브 파동 방정식입니다. 수면을 클릭하거나 드래그할 때 실시간 원형 파문이 방사형으로 전파됩니다.
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-white/80">드래그 시 파문 궤적 생성</span>
                    <button
                      onClick={() => updateParam('rippleDragWake', !config.rippleDragWake)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        config.rippleDragWake !== false ? 'bg-cyan-500' : 'bg-white/20'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          config.rippleDragWake !== false ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div>
                    <div className="flex justify-between text-white/80 mb-1 text-xs">
                      <span>파문 반경 (Ripple Radius)</span>
                      <span className="font-mono text-cyan-300">{(config.rippleDisturbanceRadius ?? 0.026).toFixed(3)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.012"
                      max="0.055"
                      step="0.002"
                      value={config.rippleDisturbanceRadius ?? 0.026}
                      onChange={(e) => updateParam('rippleDisturbanceRadius', parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-white/80 mb-1 text-xs">
                      <span>파문 충격 강도 (Ripple Strength)</span>
                      <span className="font-mono text-cyan-300">{(config.rippleDisturbanceStrength ?? 0.08).toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.03"
                      max="0.18"
                      step="0.01"
                      value={config.rippleDisturbanceStrength ?? 0.08}
                      onChange={(e) => updateParam('rippleDisturbanceStrength', parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. OPTICS TAB */}
            {activeTab === 'optics' && (
              <div className="space-y-4">
                {/* 🌊 수중환경 프리셋 (Underwater Presets) 빠른 선택 카드 */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-950/40 via-teal-950/20 to-black/40 border border-emerald-500/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🌊</span>
                      <span className="font-semibold text-white text-xs tracking-wide">
                        수중환경 프리셋 (Underwater Presets)
                      </span>
                    </div>
                    <button
                      onClick={() => setUnderwaterModalOpen(true)}
                      className="text-[11px] text-emerald-300 hover:text-emerald-200 underline font-mono flex items-center gap-1"
                    >
                      전체 6종 사양 &gt;
                    </button>
                  </div>

                  <p className="text-[11px] text-white/65 leading-relaxed">
                    최신 koi-pond-garden(비단잉어·연잎 연못), clearwater(초투명 얕은 물), caustic-volume 역설계 기반 6대 수중환경입니다.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                    {UNDERWATER_PRESETS.map((p) => {
                      const isActive = config.selectedUnderwaterPresetId === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => applyUnderwaterPreset(p.id)}
                          className={`p-2 rounded-lg text-left border transition-all text-xs flex flex-col justify-between ${
                            isActive
                              ? 'bg-emerald-500/25 border-emerald-400/60 shadow-sm ring-1 ring-emerald-400/40'
                              : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/80'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-sm">{p.icon}</span>
                            <span className={`font-semibold truncate text-[11px] ${isActive ? 'text-emerald-200' : 'text-white'}`}>
                              {p.badge}
                            </span>
                          </div>
                          <span className="text-[10px] text-white/50 truncate block">
                            {p.nameKo.split(' ')[0]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 수중 광원 (Underwater Caustics Intensity) & 광원 각도 연동 동적 그림자 시뮬레이션 파라미터 */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-cyan-950/40 via-blue-950/20 to-black/40 border border-cyan-500/25 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sun className="w-4 h-4 text-cyan-400 animate-pulse" />
                      <span className="font-semibold text-white text-xs tracking-wide">
                        연못 바닥 코스틱스 강도 (Pond Floor Light Caustics)
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-[11px] font-mono text-cyan-300 font-bold">
                      {(config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0).toFixed(2)}x
                    </span>
                  </div>

                  <p className="text-[11px] text-white/65 leading-relaxed">
                    수면 굴절 광선이 물속으로 투과하며 연못 바닥 조약돌과 디딤돌, 유목, 해양 생물에 맺히는 수중 집광 무늬와 볼륨 산란 광선의 강도를 제어하여 햇살 가득한(Sun-Drenched) 연못 수중 환경을 연출합니다.
                  </p>

                  <div>
                    <input
                      type="range"
                      min="0.0"
                      max="3.0"
                      step="0.05"
                      value={config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        onChangeConfig({
                          ...config,
                          causticsIntensity: val,
                          underwaterCausticsIntensity: val,
                        });
                      }}
                      className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-white/40 mt-0.5 font-mono">
                      <span>0.0x (어두운 그늘)</span>
                      <span>1.0x (자연광 표준)</span>
                      <span>2.0x (화사한 일광)</span>
                      <span>3.0x (극대 찬란함)</span>
                    </div>
                  </div>

                  {/* Quick Preset Chips for Caustics */}
                  <div className="flex items-center gap-1.5 pt-0.5 overflow-x-auto scrollbar-none">
                    {[
                      { val: 0.1, label: '0.1x 차분한 그늘' },
                      { val: 0.6, label: '0.6x 온화한 빛' },
                      { val: 1.0, label: '1.0x 자연광' },
                      { val: 1.8, label: '1.8x 화사한 햇살' },
                      { val: 2.5, label: '2.5x 눈부신 일광' },
                    ].map((chip) => {
                      const isCurrent = Math.abs((config.underwaterCausticsIntensity ?? config.causticsIntensity ?? 1.0) - chip.val) < 0.15;
                      return (
                        <button
                          key={chip.label}
                          onClick={() => {
                            onChangeConfig({
                              ...config,
                              causticsIntensity: chip.val,
                              underwaterCausticsIntensity: chip.val,
                            });
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors whitespace-nowrap ${
                            isCurrent
                              ? 'bg-cyan-500/30 border-cyan-400/50 text-white shadow-sm'
                              : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* 광원의 각도에 따른 동적 수중 그림자 시뮬레이션 파라미터 */}
                  <div className="pt-2.5 border-t border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-white/90">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>광원 각도 연동 동적 그림자 (Dynamic Shadow)</span>
                      </div>
                      <span className="font-mono text-xs text-amber-300 font-bold">
                        {(config.underwaterShadowIntensity ?? 1.0).toFixed(2)}x
                      </span>
                    </div>

                    <input
                      type="range"
                      min="0.0"
                      max="2.0"
                      step="0.05"
                      value={config.underwaterShadowIntensity ?? 1.0}
                      onChange={(e) => updateParam('underwaterShadowIntensity', parseFloat(e.target.value))}
                      className="w-full accent-amber-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />

                    {/* 그림자 분산 및 부드러움 (Shadow Softness / Penumbra) */}
                    <div>
                      <div className="flex justify-between text-white/80 mb-1 text-[11px]">
                        <span>수중 산란 그림자 분산도 (Shadow Softness)</span>
                        <span className="font-mono text-cyan-300">{(config.underwaterShadowSoftness ?? 1.0).toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="2.5"
                        step="0.05"
                        value={config.underwaterShadowSoftness ?? 1.0}
                        onChange={(e) => updateParam('underwaterShadowSoftness', parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    {/* 실시간 광원 각도 및 그림자 투영 상태 배지 */}
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-black/50 border border-white/5 text-[10px] text-white/70">
                      <span className="text-amber-400">☀️</span>
                      <div className="flex-1">
                        <span className="text-white/50">광원 각도: </span>
                        <span className="font-mono text-cyan-300 font-semibold">{config.sunElevation.toFixed(0)}°</span>
                        <span className="text-white/50"> 고도 / </span>
                        <span className="font-mono text-cyan-300 font-semibold">{config.sunAzimuth.toFixed(0)}°</span>
                        <span className="text-white/50"> 방위각 ➔ 실시간 수중 그림자 투영각 연동 중</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-white/80 mb-1">
                    <span>프리즘 색분산 (Dispersion Fringes)</span>
                    <span className="font-mono text-cyan-300">{config.dispersionStrength.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="2.5"
                    step="0.1"
                    value={config.dispersionStrength}
                    onChange={(e) => updateParam('dispersionStrength', parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-white/80 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Droplets className="w-3.5 h-3.5 text-emerald-400" />
                      <span>수중 탁도 및 산란도 (Turbidity)</span>
                    </span>
                    <span className="font-mono text-emerald-300">{(config.turbidity ?? 1.0).toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="3.0"
                    step="0.05"
                    value={config.turbidity ?? 1.0}
                    onChange={(e) => updateParam('turbidity', parseFloat(e.target.value))}
                    className="w-full accent-emerald-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-white/40 mt-0.5 font-mono">
                    <span>0.05x (초투명 수정)</span>
                    <span>1.0x (표준)</span>
                    <span>3.0x (짙은 탁도)</span>
                  </div>
                </div>

                {/* Sunlight Glints Lens Diffraction & Bloom Card */}
                <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-white/90 font-medium">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>윤슬 회절 & 블룸 (Lens Glare & Bloom)</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 border border-white/15 text-[11px] font-mono text-amber-300">
                      <span>✨</span>
                      <span className="font-semibold">{currentGlow.toFixed(2)}x</span>
                    </div>
                  </div>

                  {/* Master Glow Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-white/70">
                      <span>통합 윤슬 광채 (Master Glow)</span>
                      <span className="font-mono text-amber-300 font-semibold">{currentGlow.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="3.0"
                      step="0.05"
                      value={currentGlow}
                      onChange={(e) => handleGlowChange(parseFloat(e.target.value))}
                      className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-white"
                      style={{
                        background:
                          'linear-gradient(to right, #475569 0%, #38bdf8 30%, #fbbf24 70%, #f43f5e 100%)',
                      }}
                    />
                    <div className="flex justify-between text-[10px] text-white/40 font-mono">
                      <span>0x (꺼짐)</span>
                      <span>1.0x (표준)</span>
                      <span>3.0x (찬란함)</span>
                    </div>
                  </div>

                  {/* Glow Quick Preset Chips */}
                  <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pt-0.5">
                    {[
                      { val: 0.0, label: '0x 끔' },
                      { val: 0.5, label: '0.5x 은은' },
                      { val: 1.0, label: '1.0x 표준' },
                      { val: 1.8, label: '1.8x 화려' },
                      { val: 2.5, label: '2.5x 찬란' },
                    ].map((chip) => (
                      <button
                        key={chip.label}
                        onClick={() => handleGlowChange(chip.val)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors whitespace-nowrap ${
                          Math.abs(currentGlow - chip.val) < 0.15
                            ? 'bg-amber-500/30 border-amber-400/50 text-white'
                            : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>

                  {/* Lens Diffraction Glare Detail */}
                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 cursor-pointer text-white/80">
                        <Aperture className="w-3.5 h-3.5 text-cyan-400" />
                        <span>렌즈 회절 글레어 (Diffraction Glare)</span>
                        <input
                          type="checkbox"
                          checked={config.glareEnabled}
                          onChange={(e) => updateParam('glareEnabled', e.target.checked)}
                          className="w-3.5 h-3.5 ml-1 rounded accent-cyan-400 bg-white/10 border-white/20 cursor-pointer"
                        />
                      </label>
                      <span className="font-mono text-cyan-300 font-semibold">
                        {(config.glareEnabled ? currentDiffraction : 0).toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="3.0"
                      step="0.05"
                      disabled={!config.glareEnabled}
                      value={currentDiffraction}
                      onChange={(e) => handleDiffractionChange(parseFloat(e.target.value))}
                      className={`w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer ${
                        !config.glareEnabled ? 'opacity-40 cursor-not-allowed' : ''
                      }`}
                    />
                    <p className="text-[10px] text-white/40">
                      수면 햇살 윤슬의 6각 조리개 2D FFT 회절 스파이크 빛갈라짐 강도
                    </p>
                  </div>

                  {/* Bloom Glow Detail */}
                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-white/80">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                        <span>블룸 광휘 (Bloom Glow)</span>
                      </div>
                      <span className="font-mono text-cyan-300 font-semibold">{currentBloom.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="3.0"
                      step="0.05"
                      value={currentBloom}
                      onChange={(e) => handleBloomChange(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                    <p className="text-[10px] text-white/40">
                      태양광 반사체 주변으로 부드럽게 퍼지는 몽환적인 2단계 가우시안 헤일로 광채
                    </p>
                  </div>
                </div>

                {/* 3.3 Tone Mapping Mode Card (HDR vs Standard) */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-950/20 via-black/40 to-slate-900/40 border border-amber-500/25 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg border transition-all ${
                        (config.toneMappingMode ?? 'hdr') === 'hdr'
                          ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                          : 'bg-white/5 border-white/10 text-white/50'
                      }`}>
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-white/95 block">
                          톤 매핑 모드 (Tone Mapping)
                        </span>
                        <span className="text-[10px] text-white/50">
                          수면 태양광 반사 하이라이트 다이내믹 레인지 제어
                        </span>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      (config.toneMappingMode ?? 'hdr') === 'hdr'
                        ? 'bg-amber-400/20 text-amber-300 border-amber-400/30'
                        : 'bg-white/10 text-white/70 border-white/20'
                    }`}>
                      {(config.toneMappingMode ?? 'hdr') === 'hdr' ? 'ACES HDR' : 'REINHARD SDR'}
                    </span>
                  </div>

                  {/* Segmented Switch */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-black/50 border border-white/10 text-xs">
                    <button
                      onClick={() => updateParam('toneMappingMode', 'hdr')}
                      className={`py-1.5 px-2 rounded-md font-medium transition-all flex items-center justify-center gap-1.5 ${
                        (config.toneMappingMode ?? 'hdr') === 'hdr'
                          ? 'bg-amber-500/30 border border-amber-400/40 text-amber-200 shadow-sm'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>✨ HDR 모드 (ACES)</span>
                    </button>

                    <button
                      onClick={() => updateParam('toneMappingMode', 'standard')}
                      className={`py-1.5 px-2 rounded-md font-medium transition-all flex items-center justify-center gap-1.5 ${
                        config.toneMappingMode === 'standard'
                          ? 'bg-white/20 border border-white/30 text-white shadow-sm'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>📷 표준 모드 (SDR)</span>
                    </button>
                  </div>

                  {/* Mode Characteristic Description */}
                  <p className="text-[11px] text-white/60 leading-relaxed bg-black/30 p-2 rounded-lg border border-white/5">
                    {(config.toneMappingMode ?? 'hdr') === 'hdr' ? (
                      <>
                        <strong className="text-amber-300 font-medium">HDR 모드: </strong>
                        헐리우드 표준 ACES Filmic S-곡선을 적용하여 태양광 반사의 극적인 휘도(최대 12,000 cd/m²)를 화이트 클리핑 없이 황금빛/순백의 자연스러운 롤오프로 표현합니다.
                      </>
                    ) : (
                      <>
                        <strong className="text-white/90 font-medium">표준(SDR) 모드: </strong>
                        전통적인 Reinhard 곡선(x / (1 + x))을 적용하여 하이라이트를 부드럽고 균일하게 압축하며, 차분하고 평온한 수면 톤을 연출합니다.
                      </>
                    )}
                  </p>

                  {/* HDR Specular Headroom Slider (active in HDR mode) */}
                  {(config.toneMappingMode ?? 'hdr') === 'hdr' && (
                    <div className="space-y-1.5 pt-2 border-t border-white/10">
                      <div className="flex justify-between text-xs text-white/80">
                        <span className="text-[11px]">태양광 다이내믹 헤드룸 (Specular Headroom)</span>
                        <span className="font-mono text-amber-300 font-semibold">
                          {(config.hdrExposureBoost ?? 1.0).toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.6"
                        max="2.0"
                        step="0.05"
                        value={config.hdrExposureBoost ?? 1.0}
                        onChange={(e) => updateParam('hdrExposureBoost', parseFloat(e.target.value))}
                        className="w-full accent-amber-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex items-center gap-1 pt-0.5">
                        {[
                          { val: 0.8, label: '0.8x 은은' },
                          { val: 1.0, label: '1.0x 표준' },
                          { val: 1.4, label: '1.4x 찬란' },
                          { val: 1.8, label: '1.8x 극대' },
                        ].map((chip) => (
                          <button
                            key={chip.val}
                            onClick={() => updateParam('hdrExposureBoost', chip.val)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                              Math.abs((config.hdrExposureBoost ?? 1.0) - chip.val) < 0.1
                                ? 'bg-amber-500/30 border-amber-400/50 text-amber-200'
                                : 'bg-black/30 border-white/10 text-white/50 hover:text-white'
                            }`}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex justify-between text-white/80 mb-1">
                    <span>카메라 노출 (Exposure)</span>
                    <span className="font-mono text-cyan-300">{config.exposure.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1.5"
                    step="0.03"
                    value={config.exposure}
                    onChange={(e) => updateParam('exposure', parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* 3.4 Volumetric God Rays (수중 빛내림 / 틴들 현상) */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-950/35 via-black/40 to-cyan-950/35 border border-amber-500/25 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between text-white/90">
                    <div className="flex items-center gap-1.5 font-medium text-xs">
                      <Sun className="w-4 h-4 text-amber-400" />
                      <span>볼륨메트릭 고드 레이 (Volumetric God Rays)</span>
                    </div>
                    <span className="font-mono text-xs text-amber-300 font-bold">{(config.godRayIntensity ?? 1.2).toFixed(2)}x</span>
                  </div>

                  <p className="text-[11px] text-white/60 leading-normal">
                    태양빛이 수면 굴절 코스틱 렌즈를 통해 물속 깊숙이 관통하며 만드는 신비로운 빛의 기둥(Light Shafts)입니다. 현재 태양 고도({Math.round(config.sunElevation)}°)와 수중 탁도({(config.turbidity ?? 1.0).toFixed(2)}x)에 실시간 연동됩니다.
                  </p>

                  <input
                    type="range"
                    min="0.0"
                    max="3.0"
                    step="0.05"
                    value={config.godRayIntensity ?? 1.2}
                    onChange={(e) => updateParam('godRayIntensity', parseFloat(e.target.value))}
                    className="w-full accent-amber-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />

                  <div className="flex justify-between text-[10px] text-white/45 font-mono">
                    <span>0.0x (비활성)</span>
                    <span>1.2x (자연스러운 빛줄기)</span>
                    <span>3.0x (환상적 극대화)</span>
                  </div>

                  <div className="flex items-center gap-2 p-2 rounded-lg bg-black/40 border border-white/5 text-[10px] text-white/70">
                    <span className="text-amber-400">☀️</span>
                    <span>
                      {config.sunElevation > 35
                        ? `높은 정오 태양(${Math.round(config.sunElevation)}°)으로 수직 관통 광선이 뚜렷함`
                        : config.sunElevation > 12
                        ? `완만한 사선 태양(${Math.round(config.sunElevation)}°)으로 부드럽게 기울어진 광선`
                        : `낮은 일몰/일출 각도(${Math.round(config.sunElevation)}°)로 광선이 대기에 감쇠`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 4. WATER ABSORPTION TAB */}
            {activeTab === 'water' && (
              <div className="space-y-4">
                {/* 4.1 Turbidity & Water Clarity Card */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-950/30 via-black/40 to-cyan-950/30 border border-emerald-500/25 space-y-2.5 shadow-lg">
                  <div className="flex items-center justify-between text-white/90">
                    <div className="flex items-center gap-1.5 font-medium text-xs">
                      <Droplets className="w-4 h-4 text-emerald-400" />
                      <span>수중 탁도 및 투명도 (Turbidity & Clarity)</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-medium border ${
                          (config.turbidity ?? 1.0) < 0.35
                            ? 'bg-teal-500/20 text-teal-200 border-teal-400/30'
                            : (config.turbidity ?? 1.0) < 0.8
                            ? 'bg-sky-500/20 text-sky-200 border-sky-400/30'
                            : (config.turbidity ?? 1.0) < 1.4
                            ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30'
                            : (config.turbidity ?? 1.0) < 2.2
                            ? 'bg-amber-500/20 text-amber-200 border-amber-400/30'
                            : 'bg-rose-500/20 text-rose-200 border-rose-400/30'
                        }`}
                      >
                        {(config.turbidity ?? 1.0) < 0.35
                          ? '💎 수정같이 맑음 (Crystal Clear)'
                          : (config.turbidity ?? 1.0) < 0.8
                          ? '🌊 청명한 바다 (High Clarity)'
                          : (config.turbidity ?? 1.0) < 1.4
                          ? '🌊 표준 해양 산란 (Balanced Ocean)'
                          : (config.turbidity ?? 1.0) < 2.2
                          ? '🌫️ 탁한 연안 (Moderate Turbidity)'
                          : '☕ 짙은 부유물 / 흐림 (Heavy Scattering)'}
                      </span>
                      <span className="text-emerald-300 font-bold font-mono">
                        {(config.turbidity ?? 1.0).toFixed(2)}x
                      </span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min="0.05"
                    max="3.0"
                    step="0.05"
                    value={config.turbidity ?? 1.0}
                    onChange={(e) => updateParam('turbidity', parseFloat(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-white"
                    style={{
                      background:
                        'linear-gradient(to right, #38bdf8 0%, #2dd4bf 25%, #10b981 50%, #d97706 75%, #b45309 100%)',
                    }}
                  />

                  <div className="flex justify-between text-[10px] text-white/45 font-mono">
                    <span>0.05x (초투명 / Minimal Scatter)</span>
                    <span>1.0x (표준 해양)</span>
                    <span>3.0x (짙은 탁도 / Heavy In-Scatter)</span>
                  </div>

                  {/* Quick Preset Chips */}
                  <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pt-0.5">
                    {[
                      { v: 0.15, l: '0.15x 수정 투명' },
                      { v: 0.5, l: '0.50x 청명 바다' },
                      { v: 1.0, l: '1.00x 표준 해양' },
                      { v: 1.7, l: '1.70x 산란 탁도' },
                      { v: 2.5, l: '2.50x 짙은 부유' },
                    ].map((chip) => (
                      <button
                        key={chip.v}
                        onClick={() => updateParam('turbidity', chip.v)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors whitespace-nowrap ${
                          Math.abs((config.turbidity ?? 1.0) - chip.v) < 0.15
                            ? 'bg-emerald-500/30 border-emerald-400/50 text-white font-medium'
                            : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {chip.l}
                      </button>
                    ))}
                  </div>

                  <p className="text-[10px] text-white/50 leading-relaxed">
                    빛이 수심 깊이 침투할 때 발생하는 체적 산란(Volumetric Scattering)과 물의 탁도(Turbidity)를 조절합니다. 0에 가깝게 낮추면 빛이 산란 없이 바닥 자갈과 코스틱스까지 선명하게 꿰뚫는 초투명 수질이 되며, 값을 높이면 수중 부유 미립자로 인해 빛이 산란되어 깊은 곳일수록 우윳빛/에메랄드 안개처럼 신비롭게 번지는 탁도가 형성됩니다.
                  </p>
                </div>

                <p className="text-[11px] text-white/60">
                  Beer-Lambert 법칙에 따른 파장별 수중 흡수 계수(Sigma A). 붉은 파장이 먼저 감쇠될수록 푸른빛이 감돕니다.
                </p>

                <div>
                  <div className="flex justify-between text-white/80 mb-1">
                    <span className="text-red-300">적색광 흡수 (Red Absorption)</span>
                    <span className="font-mono text-red-300">{config.absorption[0].toFixed(3)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.9"
                    step="0.02"
                    value={config.absorption[0]}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      updateParam('absorption', [v, config.absorption[1], config.absorption[2]]);
                    }}
                    className="w-full accent-red-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-white/80 mb-1">
                    <span className="text-emerald-300">녹색광 흡수 (Green Absorption)</span>
                    <span className="font-mono text-emerald-300">{config.absorption[1].toFixed(3)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="0.35"
                    step="0.01"
                    value={config.absorption[1]}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      updateParam('absorption', [config.absorption[0], v, config.absorption[2]]);
                    }}
                    className="w-full accent-emerald-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-white/80 mb-1">
                    <span className="text-blue-300">청색광 흡수 (Blue Absorption)</span>
                    <span className="font-mono text-blue-300">{config.absorption[2].toFixed(3)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="0.35"
                    step="0.01"
                    value={config.absorption[2]}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      updateParam('absorption', [config.absorption[0], config.absorption[1], v]);
                    }}
                    className="w-full accent-blue-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* 4.25 Water Environment Preset Selector (연못, 강, 바다) */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-slate-900/60 via-black/40 to-slate-900/60 border border-white/15 space-y-2.5 shadow-lg">
                  <div className="flex items-center justify-between text-white/90">
                    <div className="flex items-center gap-1.5 font-medium text-xs">
                      <span>🌊</span>
                      <span>수역 환경 및 생태계 (Water Environments)</span>
                    </div>
                    <span className="text-[10px] text-cyan-300 font-mono">연못 · 강 · 바다</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {WATER_ENVIRONMENTS.map((env) => {
                      const isSelected = (config.waterEnvironment ?? 'river') === env.id;
                      return (
                        <button
                          key={env.id}
                          onClick={() => applyEnvironment(env.id)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? env.id === 'pond'
                                ? 'bg-emerald-950/40 border-emerald-400 text-emerald-100 shadow-md ring-1 ring-emerald-400/40'
                                : env.id === 'river'
                                ? 'bg-sky-950/40 border-sky-400 text-sky-100 shadow-md ring-1 ring-sky-400/40'
                                : 'bg-blue-950/40 border-blue-400 text-blue-100 shadow-md ring-1 ring-blue-400/40'
                              : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.08] text-white/80'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5 font-semibold text-xs">
                              <span>{env.icon}</span>
                              <span>{env.nameKo}</span>
                              <span className="text-[10px] opacity-70 font-mono font-normal">({env.nameEn})</span>
                            </div>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/10">
                              {env.badge}
                            </span>
                          </div>
                          <p className="text-[10px] text-white/60 leading-relaxed mb-1">{env.description}</p>
                          <div className="text-[10px] text-cyan-300/90 font-medium flex items-center gap-1">
                            <span>🐟 서식 어류:</span>
                            <span className="text-white/70">{env.fishSummary}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4.3 3D Fish School Simulation (WebGPU threejs-fish 기반 고도화 Boids) */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-cyan-950/40 via-black/40 to-emerald-950/40 border border-cyan-500/25 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between text-white/90">
                    <div className="flex items-center gap-1.5 font-medium text-xs">
                      <Fish className="w-4 h-4 text-cyan-400" />
                      <span>3D 어류 표시 옵션 (Fish ON/OFF)</span>
                    </div>
                    <button
                      onClick={() => updateParam('fishEnabled', !config.fishEnabled)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        config.fishEnabled !== false ? 'bg-cyan-500' : 'bg-white/20'
                      }`}
                      title={config.fishEnabled !== false ? '물고기 끄기 (수면 전용)' : '물고기 켜기'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          config.fishEnabled !== false ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <p className="text-[11px] text-white/70 leading-normal">
                    {config.fishEnabled !== false ? (
                      <>
                        <span className="text-cyan-300 font-semibold">어류 유영 활성화 상태:</span> 척추 스플라인 S-자 바디 커브 곡선과 나풀거리는 실크 멤브레인 지느러미 파동이 유유자적한 생체 리듬(0.6~1.0Hz)으로 작동 중입니다.
                      </>
                    ) : (
                      <>
                        <span className="text-amber-300 font-semibold">순수 수면 감상 모드 (어류 OFF):</span> 물고기 렌더링이 비활성화되어 맑고 깨끗한 수면 파동, 코스틱스, 반사광의 잔잔한 아름다움만을 온전히 감상하실 수 있습니다.
                      </>
                    )}
                  </p>

                  {config.fishEnabled !== false && (
                    <div className="space-y-3 pt-1">
                      {/* Boids 군영 형태 선택 */}
                      <div>
                        <div className="text-[11px] text-white/80 mb-1.5 flex items-center justify-between">
                          <span>Boids 군집 형태 (Formation)</span>
                          <span className="text-[10px] text-cyan-300 font-mono">threejs-fish Formations</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { id: 'swarm', label: '🌊 자유 군영 (Swarm)', desc: '자연스러운 분군 및 순항' },
                            { id: 'ball', label: '🌀 피시볼 (Bait Ball)', desc: '포식자 회피 구형 소용돌이' },
                            { id: 'tornado', label: '🌪️ 피시 토네이도', desc: '수면을 향해 상승하는 나선' },
                            { id: 'ring', label: '⭕ 환형 (Ring)', desc: '외곽을 순환하는 도넛 대열' },
                          ].map((form) => (
                            <button
                              key={form.id}
                              onClick={() => updateParam('fishFormation', form.id as any)}
                              className={`p-1.5 rounded-lg border text-left transition-all ${
                                (config.fishFormation ?? 'swarm') === form.id
                                  ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-sm'
                                  : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                              }`}
                            >
                              <div className="text-xs font-semibold">{form.label}</div>
                              <div className="text-[9px] text-white/40">{form.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 어종 스타일 및 수중 생태계 구성 (Ecosystem Composition) */}
                      <div>
                        <div className="text-[11px] text-white/80 mb-1.5 flex items-center justify-between">
                          <span>{config.waterEnvironment === 'pond' ? '연못 수중 생태계 구성 (Pond Ecosystem)' : '어종 스타일 (Species Style)'}</span>
                          {config.waterEnvironment === 'pond' && (
                            <span className="text-[10px] text-amber-300 font-medium">비단잉어 5대 품종 & 붕어</span>
                          )}
                        </div>
                        {config.waterEnvironment === 'pond' ? (
                          <div className="space-y-2">
                            <div className="p-2.5 rounded-lg bg-black/40 border border-amber-500/30 text-xs text-white/80 space-y-1.5 backdrop-blur-sm">
                              <div className="flex items-center justify-between text-amber-300 font-semibold text-[11px]">
                                <span>🌿 은각사 연못 수중 공생 생태계</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40">생체 비늘 셰이더 적용</span>
                              </div>
                              <ul className="text-[10px] text-white/70 space-y-1">
                                <li className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                  <span><strong className="text-amber-200">야마부키 오곤 (황금잉어):</strong> 24K 순금 메탈릭 복륜(覆輪) 다이아몬드 망목 비늘 & 순금빛 투구(머리)</span>
                                </li>
                                <li className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                  <span><strong className="text-red-300">홍백 (Kohaku) & 대정삼색 (Taisho):</strong> 백자 백지(白地) 위 면도날 기와 주홍 Hi & 칠흑 먹빛 Sumi</span>
                                </li>
                                <li className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-600" />
                                  <span><strong className="text-yellow-200">토종 붕어 (Crucian Carp):</strong> 높은 체고, 청동·황금 비늘 기저부 & 뚜렷한 측선 감각공</span>
                                </li>
                                <li className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  <span><strong className="text-emerald-300">송사리 / 피라미 떼 (Schooling Minnows):</strong> 수련 잎 그늘 아래 군영하는 14마리 은빛 송사리</span>
                                </li>
                                <li className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-lime-400" />
                                  <span><strong className="text-lime-300">수초 & 바닥 생태계:</strong> 붕어마름, 나사말, 이끼 낀 침목 유목, 우렁이/다슬기, 침수 단풍잎</span>
                                </li>
                              </ul>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              { id: 'sardine_silver', label: '🐟 은빛 정어리', desc: '메탈릭 은린 & 아가미' },
                              { id: 'tropical_reef', label: '🐠 열대 산호초', desc: '블루탱·엔젤·니모' },
                              { id: 'mixed', label: '🎨 혼합 군집', desc: '다양한 해양 어류' },
                            ].map((st) => (
                              <button
                                key={st.id}
                                onClick={() => updateParam('fishSpeciesType', st.id as any)}
                                className={`p-1.5 rounded-lg border text-center transition-all ${
                                  (config.fishSpeciesType ?? 'mixed') === st.id
                                    ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-sm'
                                    : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                                }`}
                              >
                                <div className="text-xs font-semibold">{st.label}</div>
                                <div className="text-[9px] text-white/40">{st.desc}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 개체수 슬라이더 */}
                      <div>
                        <div className="flex justify-between text-white/80 mb-1 text-xs">
                          <span>어류 개체수 (Fish Count)</span>
                          <span className="font-mono text-cyan-300">{config.fishCount ?? 10}마리</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="12"
                          step="1"
                          value={config.fishCount ?? 10}
                          onChange={(e) => updateParam('fishCount', parseInt(e.target.value, 10))}
                          className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>

                      {/* 유영 애니메이션 속도 제어 슬라이더 */}
                      <div>
                        <div className="flex justify-between text-white/80 mb-1 text-xs">
                          <span>유영 애니메이션 속도 (Anim Speed)</span>
                          <span className="font-mono text-cyan-300">{(config.fishAnimSpeed ?? 1.0).toFixed(2)}x</span>
                        </div>
                        <input
                          type="range"
                          min="0.3"
                          max="2.2"
                          step="0.05"
                          value={config.fishAnimSpeed ?? 1.0}
                          onChange={(e) => updateParam('fishAnimSpeed', parseFloat(e.target.value))}
                          className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-[9px] text-white/40 mt-0.5">
                          <span>0.3x (느긋한 글라이딩)</span>
                          <span>1.0x (생체 리듬)</span>
                          <span>2.2x (경쾌)</span>
                        </div>
                      </div>

                      {/* 꼬리 및 지느러미 위상 지연 제어 슬라이더 */}
                      <div>
                        <div className="flex justify-between text-white/80 mb-1 text-xs">
                          <span>꼬리 · 지느러미 위상 지연 (Phase Delay)</span>
                          <span className="font-mono text-emerald-300">{(config.fishPhaseDelay ?? 1.0).toFixed(2)}x</span>
                        </div>
                        <input
                          type="range"
                          min="0.2"
                          max="2.0"
                          step="0.05"
                          value={config.fishPhaseDelay ?? 1.0}
                          onChange={(e) => updateParam('fishPhaseDelay', parseFloat(e.target.value))}
                          className="w-full accent-emerald-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-[9px] text-white/40 mt-0.5">
                          <span>0.2x (약함)</span>
                          <span>1.0x (비단결 나풀거림)</span>
                          <span>2.0x (풍성한 실크 너울)</span>
                        </div>
                      </div>

                      {/* 사인 함수 보간 및 위상 지연 생체 유영 안내 */}
                      <div className="p-2.5 rounded-lg bg-black/40 border border-emerald-500/20 text-[10px] space-y-1">
                        <div className="flex items-center gap-1.5 text-emerald-300 font-medium">
                          <span>🐟</span>
                          <span>사인 함수 보간(Sine Lerp) & 위상 지연(Phase Delay)</span>
                        </div>
                        <p className="text-white/60 leading-relaxed">
                          반코사인 S-커브 보간으로 급작스런 속도 변화 없이 자연스러운 가속과 감속 유영을 수행하며, 꼬리와 지느러미에 위상 지연을 적용해 유체 저항에 의한 물결치는 나풀거림을 연출합니다.
                        </p>
                      </div>

                      {/* 수중 바닥 어류 그림자 강도 슬라이더 */}
                      <div>
                        <div className="flex justify-between text-white/80 mb-1 text-xs">
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            <span>수중 바닥 어류 그림자 (Seabed Shadow)</span>
                          </span>
                          <span className="font-mono text-amber-300">{(config.underwaterShadowIntensity ?? 1.0).toFixed(2)}x</span>
                        </div>
                        <input
                          type="range"
                          min="0.0"
                          max="2.0"
                          step="0.05"
                          value={config.underwaterShadowIntensity ?? 1.0}
                          onChange={(e) => updateParam('underwaterShadowIntensity', parseFloat(e.target.value))}
                          className="w-full accent-amber-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-[9px] text-white/40 mt-0.5">
                          <span>0.0x (그림자 끔)</span>
                          <span>1.0x (생체 투영 표준)</span>
                          <span>2.0x (짙은 명암)</span>
                        </div>
                      </div>

                      {/* 인터랙션 토글들 */}
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-white/80">포인터 위협 & 충격파 분산 (Panic Wave)</span>
                          <button
                            onClick={() => updateParam('fishPanicReaction', !config.fishPanicReaction)}
                            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                              config.fishPanicReaction !== false ? 'bg-cyan-500' : 'bg-white/20'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                config.fishPanicReaction !== false ? 'translate-x-3' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-white/80">해양설 미립자 부유 (Marine Snow)</span>
                          <button
                            onClick={() => updateParam('marineSnowEnabled', !config.marineSnowEnabled)}
                            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                              config.marineSnowEnabled !== false ? 'bg-cyan-500' : 'bg-white/20'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                config.marineSnowEnabled !== false ? 'translate-x-3' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-white/80">해저 조약돌 기포 스트림 (Rising Bubbles)</span>
                          <button
                            onClick={() => updateParam('bubbleStreamEnabled', !config.bubbleStreamEnabled)}
                            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                              config.bubbleStreamEnabled !== false ? 'bg-cyan-500' : 'bg-white/20'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                config.bubbleStreamEnabled !== false ? 'translate-x-3' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                          <div>
                            <span className="text-white/90 font-medium">🐢 푸른바다거북 유영 (Green Sea Turtle)</span>
                            <div className="text-[10px] text-white/50">황갈색/올리브 Scute 방사무늬 등갑 & 크림색 배</div>
                          </div>
                          <button
                            onClick={() => updateParam('turtleEnabled', !config.turtleEnabled)}
                            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                              config.turtleEnabled !== false ? 'bg-emerald-500' : 'bg-white/20'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                config.turtleEnabled !== false ? 'translate-x-3' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Reference Badge */}
                      <div className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-1 text-[10px] text-white/70">
                        <div className="flex items-center justify-between text-cyan-300">
                          <div className="flex items-center gap-1">
                            <span>🐟</span>
                            <span className="font-medium">WebGPU threejs-fish 원작 알고리즘:</span>
                          </div>
                          <a
                            href="https://threejs-fish.vercel.app/"
                            target="_blank"
                            rel="noreferrer"
                            className="text-[9px] underline text-cyan-400/90 hover:text-cyan-200"
                          >
                            데모 보기 ↗
                          </a>
                        </div>
                        <p className="text-white/60 pl-3">
                          • 마우스나 터치로 화면을 누르면 충격파가 발생하여 어군이 즉시 사방으로 흩어졌다가 다시 뭉칩니다.
                        </p>
                        <p className="text-white/60 pl-3">
                          • 어류 몸통의 등-배 역음영(Countershading), 체측 흑색 점박이, 무지갯빛 린편, 아가미 반사광이 수면 코스틱스와 함께 실시간 렌더링됩니다.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4.4 Floating Marine Debris (FFT 연동 수면 부유물) */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-950/35 via-black/40 to-slate-900/40 border border-amber-500/25 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between text-white/90">
                    <div className="flex items-center gap-1.5 font-medium text-xs">
                      <Anchor className="w-4 h-4 text-amber-400" />
                      <span>수면 부유물 시뮬레이션 (Floating Debris)</span>
                    </div>
                    <button
                      onClick={() => updateParam('debrisEnabled', !config.debrisEnabled)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        config.debrisEnabled === true ? 'bg-amber-500' : 'bg-white/20'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          config.debrisEnabled === true ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <p className="text-[11px] text-white/60 leading-normal">
                    FFT 해양 스펙트럼의 표면 파동 높이(Displacement)와 법선 벡터에 결합되어, 너울과 파도 정점을 타고 오르내리며 자연스럽게 표류합니다.
                  </p>

                  {config.debrisEnabled === true && (
                    <div className="space-y-2 pt-1">
                      <div className="text-xs text-white/80">부유물 종류 선택</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'both', label: '모두 (혼합)' },
                          { id: 'driftwood', label: '🪵 유목 (나무)' },
                          { id: 'seaweed', label: '🌿 해초 군락' },
                        ].map((dt) => (
                          <button
                            key={dt.id}
                            onClick={() => updateParam('debrisType', dt.id as any)}
                            className={`px-2 py-1 text-xs rounded-lg border text-center transition-colors ${
                              (config.debrisType ?? 'both') === dt.id
                                ? 'bg-amber-500/25 border-amber-400/50 text-amber-200 font-medium'
                                : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                            }`}
                          >
                            {dt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5. CAMERA & VIEW TAB */}
            {activeTab === 'cam' && (
              <div className="space-y-4">
                <div>
                  <span className="text-white/80 block mb-1.5">렌더 뷰 모드</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'final', label: '완성 렌더' },
                      { id: 'caus', label: '코스틱 맵' },
                      { id: 'glare', label: '회절 글레어' },
                      { id: 'nopost', label: '원시 렌더' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => updateParam('viewMode', m.id as WaterConfig['viewMode'])}
                        className={`py-1.5 px-2 rounded-md border text-xs font-medium transition-all ${
                          config.viewMode === m.id
                            ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-sm'
                            : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5.1 Cinematic Auto-Orbit Card */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-950/30 via-black/40 to-slate-900/40 border border-amber-500/25 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg border transition-all ${
                        config.autoOrbit
                          ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                          : 'bg-white/5 border-white/10 text-white/50'
                      }`}>
                        <Film className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-white/95 block">
                          시네마틱 모드 (Cinematic Auto-Orbit)
                        </span>
                        <span className="text-[10px] text-white/50">
                          수면 주위를 360° 천천히 자동 선회
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => updateParam('autoOrbit', !config.autoOrbit)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        config.autoOrbit
                          ? 'bg-amber-500 text-black border-amber-400 font-semibold shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                          : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'
                      }`}
                    >
                      {config.autoOrbit ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Orbit Speed Slider */}
                  <div className="space-y-1.5 pt-1 border-t border-white/10">
                    <div className="flex justify-between text-xs text-white/80">
                      <span className="text-[11px]">카메라 선회 속도 (Orbit Speed)</span>
                      <span className="font-mono text-amber-300 font-semibold">
                        {(config.cinematicSpeed ?? 1.0).toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="2.5"
                      step="0.1"
                      value={config.cinematicSpeed ?? 1.0}
                      onChange={(e) => updateParam('cinematicSpeed', parseFloat(e.target.value))}
                      className="w-full accent-amber-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />

                    {/* Speed Preset Chips */}
                    <div className="flex items-center gap-1 pt-0.5">
                      {[
                        { s: 0.5, l: '0.5x 슬로우' },
                        { s: 1.0, l: '1.0x 표준' },
                        { s: 1.8, l: '1.8x 패스트' },
                      ].map((chip) => (
                        <button
                          key={chip.s}
                          onClick={() => updateParam('cinematicSpeed', chip.s)}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                            Math.abs((config.cinematicSpeed ?? 1.0) - chip.s) < 0.15
                              ? 'bg-amber-500/30 border-amber-400/50 text-amber-200'
                              : 'bg-black/30 border-white/10 text-white/50 hover:text-white'
                          }`}
                        >
                          {chip.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dynamic Undulation Toggle */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
                    <div>
                      <span className="text-white/85 block text-[11px]">다이내믹 각도 호흡 (Dynamic Breathing)</span>
                      <span className="text-[10px] text-white/40">회전 시 고도와 각도를 유기적으로 변화</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.cinematicUndulate !== false}
                      onChange={(e) => updateParam('cinematicUndulate', e.target.checked)}
                      className="w-4 h-4 rounded accent-amber-400 bg-white/10 border-white/20 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 5.2 Quick Perspective Presets */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-white/80 block">카메라 앵글 프리셋</span>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {[
                      { name: '수평선 노을', pitch: -0.25, h: 1.25, fov: 68 },
                      { name: '표준 부감', pitch: -0.72, h: 1.55, fov: 64 },
                      { name: '버드아이 수직', pitch: -1.35, h: 2.3, fov: 70 },
                      { name: '초근접 윤슬', pitch: -0.45, h: 0.8, fov: 62 },
                    ].map((camPreset) => (
                      <button
                        key={camPreset.name}
                        onClick={() => {
                          onChangeConfig({
                            ...config,
                            cameraHeight: camPreset.h,
                            cameraFov: camPreset.fov,
                          });
                          // Apply cam pitch smoothly if simRef is available via camera reset event
                          onResetCamera();
                        }}
                        className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-left transition-colors"
                      >
                        <span className="text-white/90 block font-medium text-[11px]">{camPreset.name}</span>
                        <span className="text-[10px] text-cyan-300/80 font-mono">h: {camPreset.h}m · {camPreset.fov}°</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-white/80 mb-1">
                    <span>카메라 높이 (Height)</span>
                    <span className="font-mono text-cyan-300">{config.cameraHeight.toFixed(2)} m</span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="2.8"
                    step="0.05"
                    value={config.cameraHeight}
                    onChange={(e) => updateParam('cameraHeight', parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-white/80 mb-1">
                    <span>화각 FOV</span>
                    <span className="font-mono text-cyan-300">{config.cameraFov}°</span>
                  </div>
                  <input
                    type="range"
                    min="45"
                    max="85"
                    step="1"
                    value={config.cameraFov}
                    onChange={(e) => updateParam('cameraFov', parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <button
                  onClick={onResetCamera}
                  className="w-full py-2 px-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 transition-colors flex items-center justify-center gap-1.5 text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>카메라 시점 초기화</span>
                </button>
              </div>
            )}

            {/* 6. AUDIO TAB */}
            {activeTab === 'audio' && (
              <div className="space-y-4">
                {/* 6.1 Soundscape Master Card */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-cyan-950/30 via-black/40 to-slate-900/40 border border-cyan-500/25 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg border transition-all ${
                        isAudioActive
                          ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                          : 'bg-white/5 border-white/10 text-white/40'
                      }`}>
                        {isAudioActive ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-white/95 block">
                          엠비언트 수면 음향 (Ambient Soundscape)
                        </span>
                        <span className="text-[10px] text-white/50">
                          {isAudioActive ? '실시간 절차적 수면 사운드 재생 중' : '음소거 상태'}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={handleAudioToggle}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                        isAudioActive
                          ? 'bg-cyan-500 text-black border-cyan-400 font-semibold shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                          : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'
                      }`}
                    >
                      {isAudioActive ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Equalizer animation indicator */}
                  {isAudioActive && (
                    <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-[11px] font-mono text-cyan-300">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                        <span>SYNTHESIZING AMBIENCE</span>
                      </div>
                      <div className="flex items-end gap-1 h-3.5">
                        <span className="w-1 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.3s] h-3" />
                        <span className="w-1 bg-cyan-300 rounded-full animate-bounce [animation-delay:-0.15s] h-2" />
                        <span className="w-1 bg-cyan-200 rounded-full animate-bounce [animation-delay:-0.45s] h-3.5" />
                        <span className="w-1 bg-cyan-400 rounded-full animate-bounce h-2.5" />
                      </div>
                    </div>
                  )}

                  {/* Master Volume Slider */}
                  <div className="space-y-1.5 pt-1 border-t border-white/10">
                    <div className="flex justify-between text-xs text-white/80">
                      <span className="font-medium text-[11px]">마스터 볼륨 (Master Volume)</span>
                      <span className="font-mono text-cyan-300 font-semibold">
                        {isAudioActive ? `${Math.round(masterVolume * 100)}%` : '0% (Muted)'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.02"
                      value={isAudioActive ? masterVolume : 0}
                      onChange={(e) => handleMasterVolumeChange(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />

                    {/* Volume Preset Chips */}
                    <div className="flex items-center gap-1 pt-0.5">
                      {[
                        { v: 0.0, l: '0% 음소거' },
                        { v: 0.25, l: '25% 은은함' },
                        { v: 0.5, l: '50% 표준' },
                        { v: 0.75, l: '75% 생생함' },
                        { v: 1.0, l: '100% 최대' },
                      ].map((chip) => (
                        <button
                          key={chip.v}
                          onClick={() => handleMasterVolumeChange(chip.v)}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                            isAudioActive && Math.abs(masterVolume - chip.v) < 0.1
                              ? 'bg-cyan-500/30 border-cyan-400/50 text-cyan-200 font-semibold'
                              : 'bg-black/30 border-white/10 text-white/50 hover:text-white'
                          }`}
                        >
                          {chip.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ambient Water Volume Slider */}
                  <div className="space-y-1.5 pt-2 border-t border-white/10">
                    <div className="flex justify-between text-xs text-white/80">
                      <span className="font-medium text-[11px]">물결 엠비언트 배경음 볼륨</span>
                      <span className="font-mono text-sky-300 font-semibold">
                        {Math.round(ambientVolume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.02"
                      value={ambientVolume}
                      onChange={(e) => handleAmbientVolumeChange(parseFloat(e.target.value))}
                      className="w-full accent-sky-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                {/* 6.2 Ambient Soundscape Themes */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-white/90 block">
                    사운드스케이프 테마 (Soundscape Theme)
                  </span>

                  <div className="grid grid-cols-1 gap-2">
                    {[
                      {
                        id: 'waves',
                        title: '🌊 잔잔한 바다 파도 (Gentle Waves)',
                        desc: '지중해 해변의 자연스러운 파도소리. 바람 세기(Wind Speed)에 따라 파도 주기가 유기적으로 조절됩니다.',
                      },
                      {
                        id: 'rain',
                        title: '🌧️ 포근한 빗소리 (Light Rain)',
                        desc: '마음을 편안하게 해주는 부드러운 아날로그 빗소리 세례.',
                      },
                      {
                        id: 'both',
                        title: '🌊+🌧️ 파도 & 빗소리 (Waves + Rain)',
                        desc: '해안가에 내리는 서정적인 빗소리와 파도소리의 조화로운 하모니.',
                      },
                      {
                        id: 'calm',
                        title: '🍃 고요한 호수 (Tranquil Lake)',
                        desc: '바람 한 점 없이 맑고 투명한 수면의 은은한 정적과 미세한 잔물결.',
                      },
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleAmbientModeChange(item.id as any)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          ambientMode === item.id
                            ? 'bg-cyan-500/20 border-cyan-400/50 shadow-md ring-1 ring-cyan-400/30'
                            : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07] text-white/70'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-medium text-xs ${ambientMode === item.id ? 'text-cyan-200' : 'text-white/90'}`}>
                            {item.title}
                          </span>
                          {ambientMode === item.id && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300 font-semibold">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/50 leading-relaxed">
                          {item.desc}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 6.3 SFX Test & Droplet Ripple */}
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-white/90 block font-medium text-[11px]">인터랙티브 물방울 공명 효과음</span>
                      <span className="text-[10px] text-white/40">수면 터치 및 비 내릴 때 공명 액체음 합성</span>
                    </div>
                    <button
                      onClick={() => {
                        if (!isAudioActive) handleAudioToggle();
                        waterAudio.playDrop(0.85);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-200 text-[11px] font-medium transition-colors flex items-center gap-1"
                    >
                      <Droplets className="w-3.5 h-3.5" />
                      <span>소리 테스트</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Drawer Footer Reset */}
          <div className="p-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
            <button
              onClick={() => onChangeConfig({ ...DEFAULT_CONFIG })}
              className="text-xs text-white/50 hover:text-white transition-colors"
            >
              기본 설정값 복원
            </button>
            <button
              onClick={() => setDrawerOpen(false)}
              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-xs font-medium transition-colors"
            >
              완료
            </button>
          </div>
        </aside>
      )}

      {/* Tech Architecture Modal */}
      {infoOpen && (
        <div className="fixed inset-0 pointer-events-auto bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/15 rounded-2xl p-6 max-w-lg w-full shadow-2xl relative text-slate-200 max-h-[85vh] overflow-y-auto font-sans">
            <button
              onClick={() => setInfoOpen(false)}
              className="absolute top-4 right-4 text-white/50 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-1">ClearWater 3D 기술 사양</h3>
            <p className="text-xs text-cyan-400 mb-4 font-mono">
              WebGL2 Shallow Water Simulation Engine Architecture
            </p>

            <div className="space-y-3.5 text-xs text-white/80 leading-relaxed">
              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <span className="font-semibold text-white block mb-0.5">1. 2D FFT Ocean Spectrum & 풍속 · 첨두성(Choppiness) 역학</span>
                <span>
                  Phillips/Tessendorf 기반의 256x256 해양 스펙트럼. 바람 세기(Wind Speed)와 첨두성(Choppiness) 파라미터가 파고(진폭)와 주파수 분산 관계(ω = √(gk + γk³)), 첨두 파장(kp) 및 수평 변위 벡터(Trochoidal Displacement)를 물리적으로 제어합니다. Choppiness 슬라이더를 통해 완만한 둥근 너울(Rolling Swells)부터 뾰족하고 날카롭게 부서지는 쇄파(Sharp, Breaking Waves)까지 실시간으로 전환할 수 있습니다.
                </span>
              </div>

              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <span className="font-semibold text-white block mb-0.5">2. 굴절 격자 코스틱 (Refracted-Grid Caustics)</span>
                <span>
                  인스턴스드 메쉬 격자를 통해 태양광선이 물결 표면에서 굴절되어 해저면에 도달하는 위치를 추적하며, 면적 미분 압축률(dFdx × dFdy)을 통해 빛의 집광 패턴을 물리적으로 렌더링합니다. R/G/B 3대역 굴절률(IOR)로 자연스러운 프리즘 무지개 분산을 실현합니다.
                </span>
              </div>

              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <span className="font-semibold text-white block mb-0.5">3. 인터랙티브 파동 방정식 (2D Shallow Wave)</span>
                <span>
                  사용자의 마우스 드래그와 클릭에 즉각 반응하는 2차 파동 편미분 방정식 시뮬레이션입니다. 수면 곡률(Laplacian)을 계산하여 코스틱 렌징 효과를 실시간으로 결합합니다.
                </span>
              </div>

              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <span className="font-semibold text-white block mb-0.5">4. Beer-Lambert 흡수, 탁도(Turbidity) 및 체적 산란(Volumetric Scattering)</span>
                <span>
                  깊이에 따른 파장별 빛 감쇠(exp(-σ_t · d))와 Henyey-Greenstein 위상 함수를 결합합니다. 탁도(Turbidity) 슬라이더를 통해 빛이 수중 깊이 침투할 때 발생하는 체적 산란(Volumetric In-scattering) 강도를 조절하여, 바닥 자갈과 코스틱스가 선명한 초투명 수질부터 깊을수록 신비롭게 번지는 짙은 해양 탁도까지 자유롭게 제어할 수 있습니다.
                </span>
              </div>

              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <span className="font-semibold text-white block mb-0.5">5. 2D FFT 렌즈 회절 글레어 (Lens Glare)</span>
                <span>
                  스마트폰 카메라의 6각형 조리개, 미세 스크래치, 먼지 입자의 푸리에 변환 회절 패턴(PSF)을 실시간 2D FFT로 고속 콘볼루션하여 빛망울 갈라짐을 사실적으로 표현합니다.
                </span>
              </div>

              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <span className="font-semibold text-white block mb-0.5">6. HDR (ACES Filmic) vs 표준 (Reinhard SDR) 톤 매핑</span>
                <span>
                  수면 위 태양광 스펙큘러 반사(Solar Specular Glints)는 일반 씬 대비 1000배 이상의 피크 휘도를 갖습니다. HDR 모드는 헐리우드 표준 ACES Filmic 곡선을 적용하여 태양의 고휘도 중심핵과 물결 가장자리의 색채 포화를 온전히 보존하며, 표준(Reinhard SDR) 모드는 명부를 균일하게 압축하여 차분한 톤을 제공합니다.
                </span>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-white/10 flex justify-between items-center text-[11px] text-white/50">
              <span>Code source: Aureliengmz/clearwater</span>
              <button
                onClick={() => setInfoOpen(false)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors font-medium"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌊 Underwater Environment Presets Modal */}
      {underwaterModalOpen && (
        <div className="fixed inset-0 pointer-events-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900/95 border border-emerald-500/40 rounded-2xl max-w-4xl w-full shadow-2xl relative text-slate-200 max-h-[90vh] flex flex-col font-sans overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex items-start justify-between bg-black/40">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🌊</span>
                  <h3 className="text-lg font-bold text-white tracking-tight">수중환경 프리셋 (Underwater Environment Presets)</h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[11px] font-mono font-semibold">
                    6 UNDERWATER ECOSYSTEMS
                  </span>
                </div>
                <p className="text-xs text-white/60 mt-1 max-w-2xl leading-relaxed">
                  최근 1개월(2026년 9월) 공개된 <span className="text-emerald-300 font-semibold">koi-pond-garden</span> (일본 정원 연못 + 잉어 + 연잎), <span className="text-cyan-300 font-semibold">clearwater</span> (극사실 얕은 물 + 역추적 코스틱스), <span className="text-amber-300 font-semibold">caustic-volume</span> 역설계 요소를 완벽 반영한 물리 기반 6대 수중환경입니다.
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-emerald-300/80 font-mono">
                  <span>핵심 기술: Beer-Lambert 흡수 · FBM/Gerstner 파도 · Schlick 프레넬 · 수중 굴절 역추적 코스틱스 · 비단잉어 Catmull-Rom 몸체 굴곡</span>
                </div>
              </div>
              <button
                onClick={() => setUnderwaterModalOpen(false)}
                className="text-white/50 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Presets Grid */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 max-h-[calc(90vh-140px)] scrollbar-thin scrollbar-thumb-white/10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {UNDERWATER_PRESETS.map((preset, index) => {
                  const isActive = config.selectedUnderwaterPresetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                        isActive
                          ? 'bg-emerald-950/40 border-emerald-400/60 shadow-lg ring-1 ring-emerald-400/40'
                          : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
                      }`}
                    >
                      <div>
                        {/* Title Row */}
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{preset.icon}</span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-mono text-emerald-300/80">#{index + 1}</span>
                                <h4 className="text-sm font-bold text-white">{preset.nameKo}</h4>
                              </div>
                              <span className="text-[11px] text-white/50 font-mono">
                                {preset.nameEn} · {preset.badge}
                              </span>
                            </div>
                          </div>
                          {isActive && (
                            <span className="px-2 py-0.5 rounded bg-emerald-400/25 border border-emerald-400/40 text-[10px] font-mono font-bold text-emerald-200">
                              ACTIVE
                            </span>
                          )}
                        </div>

                        {/* Tagline */}
                        <div className="text-xs font-medium text-emerald-200/90 mb-2">
                          "{preset.tagline}"
                        </div>

                        {/* Description */}
                        <p className="text-xs text-white/70 leading-relaxed mb-3">
                          {preset.description}
                        </p>

                        {/* Inspiration Badge */}
                        {preset.inspiration && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/40 border border-emerald-500/25 text-[10px] text-cyan-300 font-mono mb-3">
                            <span>⚡ 역설계 출처:</span>
                            <span className="text-white/80">{preset.inspiration}</span>
                          </div>
                        )}

                        {/* Optical Physics Spec */}
                        <div className="p-2.5 rounded-lg bg-black/40 border border-emerald-500/20 text-[11px] mb-3 space-y-1 font-mono">
                          <div className="flex items-center gap-1 text-emerald-300 font-semibold text-[11px]">
                            <span>🔬</span>
                            <span>물리 광학 시뮬레이션 사양:</span>
                          </div>
                          <div className="text-white/75 text-[10px] space-y-0.5 pl-1 border-l border-emerald-500/30">
                            <div>• {preset.opticalDetails.absorptionDesc}</div>
                            <div>• {preset.opticalDetails.scatteringDesc}</div>
                            <div>• {preset.opticalDetails.causticsDesc}</div>
                            <div>• {preset.opticalDetails.shadowDesc}</div>
                            <div>• {preset.opticalDetails.depthTurbidity}</div>
                          </div>
                        </div>
                      </div>

                      {/* Footer & Action Button */}
                      <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-[10px] text-white/50 font-mono">
                          <span>수심 {preset.config.waterDepth}m</span>
                          <span>·</span>
                          <span>탁도 {preset.config.turbidity}x</span>
                          <span>·</span>
                          <span>파고 {preset.config.waveScale}</span>
                        </div>
                        <button
                          onClick={() => {
                            applyUnderwaterPreset(preset.id);
                            setUnderwaterModalOpen(false);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                            isActive
                              ? 'bg-emerald-500 text-slate-950 shadow-md hover:bg-emerald-400 font-bold'
                              : 'bg-white/10 hover:bg-emerald-500/30 text-white hover:text-emerald-200 border border-white/15'
                          }`}
                        >
                          {isActive ? '적용 중' : '이 수중환경 적용하기'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 12 Crystal Clear Beaches Showcase Modal */}
      {beachModalOpen && (
        <div className="fixed inset-0 pointer-events-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900/95 border border-teal-500/30 rounded-2xl max-w-4xl w-full shadow-2xl relative text-slate-200 max-h-[90vh] flex flex-col font-sans overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex items-start justify-between bg-black/40">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🏖️</span>
                  <h3 className="text-lg font-bold text-white tracking-tight">전세계 수정같이 투명한 12대 바다 해변</h3>
                  <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30 text-[11px] font-mono font-semibold">
                    12 WORLD CRYSTAL BEACHES
                  </span>
                </div>
                <p className="text-xs text-white/60 mt-1 max-w-2xl leading-relaxed">
                  자연 석회석 암반 여과, 고반사 탄산칼슘 산호 모래, 화산 현무암 대비, 포시도니아 해초의 천연 수질 정화 등 광학 과학 원리를 분석하여 정밀 시뮬레이션으로 재현한 세계 최고의 청정 해변 12곳입니다.
                </p>
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-teal-300/80 font-mono">
                  <span>연구 출처:</span>
                  <a
                    href="https://ngroovy.tistory.com/2542"
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-teal-200"
                  >
                    ngroovy.tistory.com/2542
                  </a>
                </div>
              </div>
              <button
                onClick={() => setBeachModalOpen(false)}
                className="text-white/50 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Beach Grid */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 max-h-[calc(90vh-140px)] scrollbar-thin scrollbar-thumb-white/10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {CRYSTAL_BEACH_PRESETS.map((beach, index) => {
                  const isActive = config.selectedBeachId === beach.id;
                  return (
                    <div
                      key={beach.id}
                      className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                        isActive
                          ? 'bg-teal-950/40 border-teal-400/60 shadow-lg ring-1 ring-teal-400/30'
                          : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
                      }`}
                    >
                      <div>
                        {/* Title Row */}
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{beach.flag}</span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-mono text-teal-300/80">#{index + 1}</span>
                                <h4 className="text-sm font-bold text-white">{beach.nameKo}</h4>
                              </div>
                              <span className="text-[11px] text-white/50 font-mono">
                                {beach.nameEn} · {beach.country} ({beach.region})
                              </span>
                            </div>
                          </div>
                          {isActive && (
                            <span className="px-2 py-0.5 rounded bg-teal-400/25 border border-teal-400/40 text-[10px] font-mono font-bold text-teal-200">
                              ACTIVE
                            </span>
                          )}
                        </div>

                        {/* Tagline */}
                        <div className="text-xs font-medium text-teal-200/90 mb-2">
                          "{beach.tagline}"
                        </div>

                        {/* Description */}
                        <p className="text-xs text-white/70 leading-relaxed mb-3">
                          {beach.description}
                        </p>

                        {/* Why Crystal Clear (Optical Science) */}
                        <div className="p-2.5 rounded-lg bg-black/40 border border-teal-500/20 text-[11px] mb-3 space-y-1">
                          <div className="flex items-center gap-1 text-teal-300 font-semibold">
                            <span>🔬</span>
                            <span>수정같은 투명도의 광학 원인:</span>
                          </div>
                          <p className="text-white/75 leading-relaxed">
                            {beach.whyCrystalClear}
                          </p>
                        </div>

                        {/* Seabed Info */}
                        <div className="flex items-center gap-1.5 text-[11px] text-white/60 mb-3 font-mono">
                          <span className="text-amber-400">🪨 해저 지질:</span>
                          <span className="text-white/80">{beach.seabedType}</span>
                        </div>
                      </div>

                      {/* Footer & Action Button */}
                      <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-[10px] text-white/50 font-mono">
                          <span>수심 {beach.config.waterDepth}m</span>
                          <span>·</span>
                          <span>탁도 {beach.config.turbidity}x</span>
                          <span>·</span>
                          <span>파고 {beach.config.waveScale}</span>
                        </div>
                        <button
                          onClick={() => {
                            applyBeachPreset(beach.id);
                            setBeachModalOpen(false);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                            isActive
                              ? 'bg-teal-500 text-slate-950 shadow-md hover:bg-teal-400'
                              : 'bg-white/10 hover:bg-teal-500/30 text-white hover:text-teal-200 border border-white/15'
                          }`}
                        >
                          {isActive ? '적용 중' : '이 해변 체험하기'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cinematic Mode Floating Status Banner & Controller */}
      {config.autoOrbit && (
        <div className="pointer-events-auto fixed bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/80 border border-amber-400/40 backdrop-blur-xl shadow-2xl flex items-center gap-3 text-xs text-white z-30 animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <span className="font-semibold text-amber-300 tracking-wide text-[11px] sm:text-xs">
              CINEMATIC AUTO-ORBIT
            </span>
            <span className="text-white/40 hidden sm:inline">· 360° 다이내믹 뷰</span>
          </div>

          <div className="flex items-center gap-1.5 pl-2 border-l border-white/15">
            <button
              onClick={() => {
                const speeds = [0.5, 1.0, 1.8];
                const cur = config.cinematicSpeed ?? 1.0;
                const next = speeds[(speeds.indexOf(cur) + 1) % speeds.length] ?? 1.0;
                updateParam('cinematicSpeed', next);
              }}
              title="회전 속도 변경"
              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/90 font-mono text-[10px] transition-colors"
            >
              {(config.cinematicSpeed ?? 1.0).toFixed(1)}x 속도
            </button>

            <button
              onClick={() => updateParam('autoOrbit', false)}
              className="px-2.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/30 font-medium text-[11px] transition-colors"
            >
              종료
            </button>
          </div>
        </div>
      )}

      {/* Bottom Status & Hint */}
      <footer className="flex flex-col sm:flex-row items-center justify-between gap-2 w-full text-xs text-white/60 pointer-events-auto">
        {/* Onboarding hint */}
        {showHint ? (
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-white/80 animate-in fade-in slide-in-from-bottom-2">
            <span className="text-cyan-400 font-bold">💡 Tip</span>
            <span>수면을 클릭하여 파동을 일으키거나, 드래그하여 시점을 360° 자유롭게 회전해 보세요.</span>
            <button
              onClick={() => setShowHint(false)}
              className="text-white/40 hover:text-white ml-1 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div />
        )}

        {/* Real-time Performance Metrics */}
        {stats && (
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/10 font-mono text-[11px] text-white/60">
            <span className="text-cyan-400 font-semibold">{stats.fps} FPS</span>
            <span className="text-white/20">·</span>
            <span>
              {stats.width}×{stats.height}
            </span>
            <span className="text-white/20">·</span>
            <span>Q {stats.quality}%</span>
          </div>
        )}
      </footer>
    </div>
  );
};
