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
  Info,
  RotateCcw,
  Palette,
  Aperture,
  Wind,
  Film,
  CloudSun,
  CloudLightning,
  ChevronDown,
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
}

export const ControlOverlay: React.FC<ControlOverlayProps> = ({
  config,
  onChangeConfig,
  interactionMode,
  onChangeInteractionMode,
  stats,
  onSnapshot,
  onResetCamera,
}) => {
  const [activeTab, setActiveTab] = useState<'light' | 'wave' | 'optics' | 'water' | 'cam' | 'audio'>('light');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [volumeMenuOpen, setVolumeMenuOpen] = useState(false);
  const [weatherDropdownOpen, setWeatherDropdownOpen] = useState(false);
  const [weatherToast, setWeatherToast] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(waterAudio.getMuted());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHint, setShowHint] = useState(true);

  // Audio parameters from config
  const isAudioActive = config.soundEnabled ?? false;
  const masterVolume = config.masterVolume ?? 0.6;
  const ambientVolume = config.ambientVolume ?? 0.5;
  const ambientMode = config.ambientMode ?? 'waves';

  const currentWeather =
    WEATHER_PRESETS.find((w) => w.id === config.weather) || WEATHER_PRESETS[0];

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

      {/* Preset Bar & Interaction Mode Bar (Center-Top) */}
      <div className="flex flex-col items-center gap-2 w-full max-w-xl mx-auto pointer-events-auto">
        {/* Preset & Weather Selector */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/60 border border-white/10 backdrop-blur-xl shadow-2xl overflow-x-auto max-w-full scrollbar-none">
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
        <div className="w-full max-w-lg px-3 py-2 rounded-xl bg-black/65 border border-white/15 backdrop-blur-xl shadow-2xl flex items-center gap-2.5 text-xs text-white/90">
          <button
            onClick={toggleGlowMute}
            title={currentGlow > 0.05 ? '윤슬 회절 & 블룸 효과 끄기' : '윤슬 회절 & 블룸 효과 켜기 (1.0x)'}
            className={`p-1.5 rounded-lg border transition-all shrink-0 flex items-center justify-center ${
              currentGlow > 0.05
                ? 'bg-amber-500/25 border-amber-400/50 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
                : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${currentGlow > 1.2 ? 'animate-pulse' : ''}`} />
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-semibold text-white/95 text-xs tracking-tight">윤슬 광채</span>
            <span className="text-[11px] text-amber-300/80 font-mono hidden sm:inline">
              (Glow)
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-0.5">
            <input
              type="range"
              min="0.0"
              max="3.0"
              step="0.05"
              value={currentGlow}
              onChange={(e) => handleGlowChange(parseFloat(e.target.value))}
              aria-label="Lens Diffraction and Bloom Glow Intensity"
              title="태양광 윤슬 렌즈 회절 및 블룸 광휘 조절"
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-white"
              style={{
                background:
                  'linear-gradient(to right, #334155 0%, #0284c7 25%, #f59e0b 65%, #f43f5e 100%)',
              }}
            />
          </div>

          {/* Quick Preset Buttons for Glow */}
          <div className="hidden sm:flex items-center gap-1 shrink-0 font-mono text-[10px]">
            {[
              { val: 0.0, label: '0x' },
              { val: 1.0, label: '1x' },
              { val: 2.0, label: '2x' },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => handleGlowChange(p.val)}
                className={`px-1.5 py-0.5 rounded border transition-colors ${
                  Math.abs(currentGlow - p.val) < 0.15
                    ? 'bg-amber-500/30 border-amber-400/50 text-amber-200'
                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full border border-white/40 shrink-0 transition-all"
              style={{
                backgroundColor: currentGlow > 0.05 ? '#fcd34d' : '#64748b',
                boxShadow: currentGlow > 0.05 ? `0 0 ${Math.min(12, currentGlow * 5)}px rgba(251,191,36,0.9)` : 'none',
              }}
              title="현재 윤슬 광휘 상태"
            />
            <span className="text-amber-300 font-semibold min-w-[2.6rem] text-right">
              {currentGlow.toFixed(2)}x
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
              </div>
            )}

            {/* 3. OPTICS TAB */}
            {activeTab === 'optics' && (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-white/80 mb-1">
                    <span>굴절 코스틱스 강도 (Caustics)</span>
                    <span className="font-mono text-cyan-300">{config.causticsIntensity.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="2.5"
                    step="0.05"
                    value={config.causticsIntensity}
                    onChange={(e) => updateParam('causticsIntensity', parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
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
