/**
 * Presets and configuration types for ClearWater 3D Simulation
 */

export interface WaterConfig {
  // Lighting & Sun
  timeOfDay: number; // Hour of day: 6.0 (06:00 Sunrise) ~ 19.5 (19:30 Sunset)
  colorTemperature: number; // Correlated Color Temperature in Kelvin (2000K ~ 8000K)
  sunAzimuth: number; // degrees (0 ~ 360)
  sunElevation: number; // degrees (2 ~ 85)
  sunIntensity: number; // scale multiplier (0.5 ~ 10.0)
  sunColor: [number, number, number]; // RGB color multiplier

  // Wave Spectrum
  waveScale: number; // Target wave slope (0.02 ~ 0.15)
  waveSpeed: number; // Time progression speed (0.0 ~ 2.0)
  choppiness: number; // FFT wave choppiness / crest peaking factor (0.0 ~ 2.5, 0 = rolling swells, 2+ = sharp breaking waves)
  waterDepth: number; // Mean depth in meters (0.5 ~ 4.0)
  windSpeed: number; // Wind speed in m/s (1.0 ~ 25.0)

  // Optical & Underwater
  absorption: [number, number, number]; // sigma_a (Beer-Lambert attenuation)
  scattering: [number, number, number]; // sigma_s
  turbidity: number; // Water turbidity / clarity factor (0.05 ~ 3.0, 0.1 = crystal clear / gin clear, 1.0 = standard ocean water, 2.5+ = murky with heavy volumetric scattering)
  depthMarkerEnabled?: boolean; // Visual 3D floating depth marker / buoy in simulation
  causticsIntensity: number; // Caustics brightness (0.0 ~ 3.0)
  underwaterCausticsIntensity?: number; // '수중 광원(Underwater Caustics intensity)' 조절 파라미터 (0.0 ~ 3.0)
  underwaterShadowIntensity?: number; // 광원 각도 연동 동적 수중 그림자 강도 (0.0 ~ 2.5, 기본 1.0)
  underwaterShadowSoftness?: number; // 수중 산란에 의한 그림자 분산 및 부드러움 (0.2 ~ 3.0, 기본 1.0)
  causticBloomIntensity?: number; // Post-processing ethereal bloom & light scattering specifically on caustic patterns (0.0 ~ 3.0)
  causticFlareIntensity?: number; // Anamorphic streaks and starburst lens flares specifically on caustic focal points (0.0 ~ 3.0)
  dispersionStrength: number; // Chromatic aberration in caustics (0.5 ~ 2.5)
  godRayIntensity: number; // Volumetric God Ray light shafts penetrating water surface (0.0 ~ 3.0)

  // Water Environment (연못 Pond, 강 River, 바다 Ocean)
  waterEnvironment: 'pond' | 'river' | 'ocean'; // 수역 환경 유형
  pondBorderMode?: 'fullscreen' | 'framed'; // 연못 수면 뷰: 'fullscreen' = 화면 가득 찬 광활한 자연 연못(무경계 고화질 실사 수면), 'framed' = 3D 정원 수변 테두리 프레임 (기본: 'fullscreen')
  gardenLowAngleTransparency?: boolean; // 카메라 시점이 낮아졌을 때 수면을 가리지 않도록 오브젝트 투명도 동적 조절 (기본: true)
  gardenObjectOpacity?: number; // 정원 요소 기본 불투명도 (0.0 ~ 1.0, 기본: 1.0)

  // Underwater Life & Marine Debris (Enhanced with WebGPU / threejs-fish architecture)
  fishEnabled: boolean; // 3D swimming fish school beneath the surface
  fishCount: number; // Number of swimming fish (1 ~ 12)
  fishAnimSpeed?: number; // 어류 유영 애니메이션 속도 제어 배율 (0.2 ~ 2.5, 기본 1.0)
  fishPhaseDelay?: number; // 꼬리 및 지느러미 유체역학 위상 지연 제어 배율 (0.2 ~ 2.0, 기본 1.0)
  fishFormation: 'swarm' | 'ball' | 'tornado' | 'ring'; // Boids swarm formation (자유 군영, 피시볼, 피시 토네이도, 환형)
  fishSpeciesType: 'sardine_silver' | 'tropical_reef' | 'mixed'; // Species style (은빛 정어리떼, 열대 산호초, 혼합)
  fishPanicReaction: boolean; // Pointer scare & shockwave scatter reaction
  turtleEnabled: boolean; // Majestic green sea turtle gliding underwater
  marineSnowEnabled: boolean; // Marine snow / plankton particulate drift (부유 유기물)
  bubbleStreamEnabled: boolean; // Rising micro-bubble streams from seabed (해저 기포)
  debrisEnabled: boolean; // Floating driftwood and seaweed moving with waves
  debrisType: 'driftwood' | 'seaweed' | 'both';

  // Procedural Aquatic Vegetation & Lotus Ecosystem (절차적 수생식물 및 연꽃 군락)
  vegetationSeed?: number; // Random seed for procedural generation (default: 42)
  vegetationDensity?: 'sparse' | 'natural' | 'lush' | 'sanctuary'; // Pad and plant density (default: 'natural')
  lotusFlowerBloomRate?: number; // Blooming flower ratio: 0.0 ~ 1.0 (default: 0.55)
  emergentLeavesEnabled?: boolean; // Tall cupped lotus leaves rising above water surface (default: true)
  aquaticGrassDensity?: number; // Hornwort & Vallisneria underwater density: 0.5 ~ 2.0 (default: 1.0)

  // Interactive Ripples
  rippleDisturbanceRadius: number; // Click/drag ripple size (0.01 ~ 0.06)
  rippleDisturbanceStrength: number; // Click/drag ripple intensity (0.02 ~ 0.20)
  rippleDragWake: boolean; // Continuous circular ripples when dragging pointer
  selectedBeachId?: string; // Active beach preset ID
  selectedUnderwaterPresetId?: string; // Active underwater environment preset ID

  // Camera & Post Process
  cameraHeight: number; // Camera elevation (0.5 ~ 3.0)
  cameraFov: number; // Field of view in degrees (45 ~ 85)
  exposure: number; // Post tonemapping exposure (0.2 ~ 1.5)
  toneMappingMode: 'hdr' | 'standard'; // 'hdr' (ACES Filmic HDR) vs 'standard' (Reinhard SDR)
  hdrExposureBoost?: number; // Dynamic range headroom multiplier for sunlight specular reflections in HDR mode (0.6 ~ 2.0)
  bloomIntensity: number; // Bloom glow (0.0 ~ 3.0)
  diffractionIntensity: number; // Hexagonal lens diffraction / glare starburst intensity (0.0 ~ 3.0)
  glareEnabled: boolean; // Hexagonal lens diffraction glare
  viewMode: 'final' | 'caus' | 'glare' | 'nopost';

  // Interaction
  rainMode: boolean; // Auto rain droplets
  rainIntensity: number; // Drops per second (1 ~ 8)
  autoOrbit: boolean; // Slow cinematic camera orbit (Cinematic Mode)
  cinematicSpeed?: number; // Orbit rotation speed multiplier (0.2 ~ 2.5)
  cinematicUndulate?: boolean; // Smooth dynamic pitch & height breathing

  // Audio Soundscape
  soundEnabled: boolean; // Audio active / unmuted
  masterVolume: number; // 0.0 ~ 1.0 (default 0.6)
  ambientVolume: number; // Ambient water sound volume (0.0 ~ 1.0, default 0.5)
  ambientMode: 'waves' | 'rain' | 'both' | 'calm'; // Soundscape preset

  // Weather Preset ID
  weather?: string; // 'calm' | 'stormy' | 'tropical_rain' | 'sunset' | 'misty_dawn'
}

export interface PresetInfo {
  id: string;
  name: string;
  tagline: string;
  description: string;
  config: Partial<WaterConfig>;
}

export const WATER_PRESETS: PresetInfo[] = [
  {
    id: 'kyoto_pond',
    name: '교토 은각사 연못 (Kyoto Koi Pond)',
    tagline: '수련 잎 사이로 유영하는 비단잉어와 이끼 낀 호안석 둘레의 평온한 연못',
    description: '최신 koi-pond-garden 역설계 기법이 집약된 극사실적 일본 정원 연못. 호안석과 단풍나무 정원 그늘에 둘러싸인 고요한 연못 수면 위로 연잎(수련)과 연꽃이 피어있고, 어두운 강자갈 바닥 위로 홍백·대정삼색·황금 비단잉어가 우아하게 유영합니다.',
    config: {
      waterEnvironment: 'pond',
      selectedUnderwaterPresetId: 'kyoto_pond',
      timeOfDay: 13.0,
      colorTemperature: 5500,
      sunAzimuth: 165,
      sunElevation: 52,
      sunIntensity: 5.8,
      sunColor: [0.98, 0.95, 0.88],
      waveScale: 0.030,
      waveSpeed: 0.60,
      choppiness: 0.35,
      waterDepth: 1.2,
      windSpeed: 2.2,
      absorption: [0.080, 0.045, 0.040], // Calibrated low absorption preserving vivid scarlet Hi, gold, and white koi colors
      scattering: [0.010, 0.012, 0.015],
      turbidity: 0.14,
      causticsIntensity: 1.15,
      underwaterCausticsIntensity: 1.15,
      underwaterShadowIntensity: 1.40,
      underwaterShadowSoftness: 0.85,
      dispersionStrength: 1.05,
      godRayIntensity: 0.90,
      fishEnabled: true,
      fishCount: 10,
      fishAnimSpeed: 0.85,
      fishPhaseDelay: 1.25,
      fishFormation: 'swarm',
      turtleEnabled: false,
      marineSnowEnabled: false,
      bubbleStreamEnabled: false,
      debrisEnabled: true,
      debrisType: 'seaweed', // Triggers water lily pads & blooming lotus flowers on water surface
      ambientMode: 'calm',
      rainMode: false,
      cameraHeight: 1.45,
      cameraFov: 62,
      exposure: 0.64,
    },
  },
  {
    id: 'lagoon',
    name: '크리스탈 라군 (Crystal Lagoon)',
    tagline: '맑은 한낮의 에메랄드 지중해 연안',
    description: '눈부신 정오 햇살 아래 바닥의 조약돌과 물결이 교차하며 찬란한 무지갯빛 코스틱 망을 수놓는 시원한 청정 해역.',
    config: {
      timeOfDay: 12.0,
      colorTemperature: 5800,
      sunAzimuth: 15,
      sunElevation: 42,
      sunIntensity: 6.2,
      sunColor: [1.0, 0.92, 0.80],
      waveScale: 0.078,
      waveSpeed: 1.0,
      choppiness: 1.1,
      waterDepth: 1.6,
      windSpeed: 5.5,
      absorption: [0.40, 0.074, 0.088],
      scattering: [0.028, 0.052, 0.068],
      turbidity: 0.35,
      causticsIntensity: 1.0,
      dispersionStrength: 1.0,
      cameraHeight: 1.55,
      cameraFov: 64,
      exposure: 0.63,
      bloomIntensity: 1.0,
      diffractionIntensity: 1.0,
      glareEnabled: true,
      viewMode: 'final',
    },
  },
  {
    id: 'sunset',
    name: '황혼의 해변 (Sunset Glow)',
    tagline: '붉게 물드는 석양과 황금빛 윤슬',
    description: '수평선 너머로 저물어가는 낮은 태양빛이 잔잔한 수면에 길게 반사되며 따스한 호박색과 분홍빛으로 물드는 고요한 저녁.',
    config: {
      timeOfDay: 18.6,
      colorTemperature: 2800,
      sunAzimuth: 285,
      sunElevation: 12,
      sunIntensity: 7.5,
      sunColor: [1.2, 0.72, 0.42],
      waveScale: 0.062,
      waveSpeed: 0.85,
      choppiness: 0.85,
      waterDepth: 1.8,
      windSpeed: 4.2,
      absorption: [0.32, 0.12, 0.22],
      scattering: [0.035, 0.048, 0.060],
      turbidity: 0.85,
      causticsIntensity: 0.85,
      dispersionStrength: 1.25,
      cameraHeight: 1.35,
      cameraFov: 66,
      exposure: 0.72,
      bloomIntensity: 1.4,
      diffractionIntensity: 1.5,
      glareEnabled: true,
      viewMode: 'final',
    },
  },
  {
    id: 'emerald',
    name: '에메랄드 딥 (Emerald Deep)',
    tagline: '신비로운 열대 협곡과 깊은 수심',
    description: '풍부한 해조류와 녹빛 광물질이 빚어낸 짙은 청록빛의 깊은 물. 깊어질수록 신비롭게 감쇠하는 수중 광선.',
    config: {
      timeOfDay: 13.0,
      colorTemperature: 6000,
      sunAzimuth: 45,
      sunElevation: 58,
      sunIntensity: 6.8,
      sunColor: [0.95, 1.0, 0.85],
      waveScale: 0.092,
      waveSpeed: 1.1,
      choppiness: 1.25,
      waterDepth: 2.5,
      windSpeed: 8.5,
      absorption: [0.55, 0.052, 0.18],
      scattering: [0.035, 0.075, 0.048],
      turbidity: 1.45,
      causticsIntensity: 1.2,
      dispersionStrength: 1.15,
      cameraHeight: 1.7,
      cameraFov: 62,
      exposure: 0.65,
      bloomIntensity: 0.9,
      diffractionIntensity: 0.85,
      glareEnabled: true,
      viewMode: 'final',
    },
  },
  {
    id: 'moonlit',
    name: '달빛 코브 (Moonlit Cove)',
    tagline: '은은한 은백색 달빛과 밤의 고요',
    description: '어두운 밤바다 위로 은빛 달빛이 떨어지며 물결마다 반짝이는 은하수 같은 파도와 신비로운 인광.',
    config: {
      timeOfDay: 20.0,
      colorTemperature: 7500,
      sunAzimuth: 22,
      sunElevation: 28,
      sunIntensity: 2.8,
      sunColor: [0.65, 0.82, 1.15],
      waveScale: 0.055,
      waveSpeed: 0.75,
      choppiness: 0.7,
      waterDepth: 2.0,
      windSpeed: 3.5,
      absorption: [0.50, 0.18, 0.08],
      scattering: [0.020, 0.040, 0.075],
      turbidity: 0.60,
      causticsIntensity: 0.65,
      dispersionStrength: 0.8,
      cameraHeight: 1.4,
      cameraFov: 65,
      exposure: 0.82,
      bloomIntensity: 1.2,
      diffractionIntensity: 1.15,
      glareEnabled: true,
      viewMode: 'final',
    },
  },
  {
    id: 'pool',
    name: '리조트 풀장 (Resort Pool)',
    tagline: '극도로 투명한 수영장과 선명한 코스틱',
    description: '불순물 없는 초투명 수질로 햇살이 물밑 바닥까지 거침없이 도달하여 선명하고 기하학적인 빛의 그물망을 투사.',
    config: {
      timeOfDay: 12.5,
      colorTemperature: 5800,
      sunAzimuth: 0,
      sunElevation: 52,
      sunIntensity: 6.5,
      sunColor: [1.0, 0.96, 0.88],
      waveScale: 0.048,
      waveSpeed: 0.9,
      choppiness: 0.4,
      waterDepth: 1.2,
      windSpeed: 1.8,
      absorption: [0.28, 0.040, 0.055],
      scattering: [0.015, 0.030, 0.045],
      turbidity: 0.12,
      causticsIntensity: 1.45,
      dispersionStrength: 1.35,
      cameraHeight: 1.6,
      cameraFov: 60,
      exposure: 0.60,
      bloomIntensity: 0.85,
      diffractionIntensity: 0.8,
      glareEnabled: true,
      viewMode: 'final',
    },
  },
];

export const DEFAULT_CONFIG: WaterConfig = {
  timeOfDay: 13.0,
  colorTemperature: 5500,
  sunAzimuth: 165,
  sunElevation: 52,
  sunIntensity: 5.8,
  sunColor: [0.98, 0.95, 0.88],
  waveScale: 0.030,
  waveSpeed: 0.60,
  choppiness: 0.35,
  waterDepth: 1.2,
  windSpeed: 2.2,
  absorption: [0.080, 0.045, 0.040], // Calibrated low absorption preserving vivid scarlet Hi, gold, and white koi colors
  scattering: [0.010, 0.012, 0.015],
  turbidity: 0.14,
  depthMarkerEnabled: false,
  causticsIntensity: 1.15,
  underwaterCausticsIntensity: 1.15,
  underwaterShadowIntensity: 1.40,
  underwaterShadowSoftness: 0.85,
  causticBloomIntensity: 1.10,
  causticFlareIntensity: 1.0,
  dispersionStrength: 1.05,
  godRayIntensity: 0.90,
  waterEnvironment: 'pond',
  pondBorderMode: 'framed',
  gardenLowAngleTransparency: true,
  gardenObjectOpacity: 1.0,
  selectedUnderwaterPresetId: 'kyoto_pond',
  fishEnabled: true,
  fishCount: 10,
  fishAnimSpeed: 0.85,
  fishPhaseDelay: 1.25,
  fishFormation: 'swarm',
  fishSpeciesType: 'mixed',
  fishPanicReaction: true,
  turtleEnabled: false,
  marineSnowEnabled: false,
  bubbleStreamEnabled: false,
  debrisEnabled: true,
  debrisType: 'seaweed', // Triggers water lily pads & blooming lotus flowers on water surface
  vegetationSeed: 42,
  vegetationDensity: 'natural',
  lotusFlowerBloomRate: 0.55,
  emergentLeavesEnabled: true,
  aquaticGrassDensity: 1.0,
  rippleDisturbanceRadius: 0.024,
  rippleDisturbanceStrength: 0.07,
  rippleDragWake: true,
  cameraHeight: 1.45,
  cameraFov: 62,
  exposure: 0.64,
  toneMappingMode: 'hdr',
  hdrExposureBoost: 1.0,
  bloomIntensity: 0.95,
  diffractionIntensity: 0.9,
  glareEnabled: true,
  viewMode: 'final',
  rainMode: false,
  rainIntensity: 3,
  autoOrbit: false,
  cinematicSpeed: 1.0,
  cinematicUndulate: true,
  soundEnabled: false,
  masterVolume: 0.6,
  ambientVolume: 0.5,
  ambientMode: 'calm',
  weather: 'calm',
};

export type WaterEnvironmentType = 'pond' | 'river' | 'ocean';

export interface EnvironmentPreset {
  id: WaterEnvironmentType;
  nameKo: string;
  nameEn: string;
  tagline: string;
  description: string;
  icon: string;
  badge: string;
  fishSummary: string;
  config: Partial<WaterConfig>;
}

export const WATER_ENVIRONMENTS: EnvironmentPreset[] = [
  {
    id: 'pond',
    nameKo: '정원 연못',
    nameEn: 'Garden Pond',
    tagline: '비단잉어가 유영하는 유려한 캣멀-롬 곡선 수로 & 고즈넉한 3D 정원 연못',
    description: '구름송이 조형 흑송(곰솔), 수양 붉은 단풍나무, 사츠키 왜철쭉, 6단 카스가 석등, 쓰쿠바이 물확과 대나무 수구, 10대 호안석 석축, 백사 사문(물결무늬), 비단이끼 언덕이 세밀하게 어우러진 고즈넉한 회유식 일본 정원 수경.',
    icon: '🌿',
    badge: '정원식 연못',
    fishSummary: '비단잉어 (홍백 · 대정삼색 · 황금잉어 · 단정 · 버터플라이 코이)',
    config: {
      waterEnvironment: 'pond',
      pondBorderMode: 'framed',
      waveScale: 0.030,
      waveSpeed: 0.60,
      choppiness: 0.35,
      windSpeed: 2.2,
      waterDepth: 1.2,
      absorption: [0.45, 0.14, 0.42], // Deep tranquil jade-green pond water (absorbs red & blue, rich jade tea hue)
      scattering: [0.035, 0.055, 0.025],
      turbidity: 0.38,
      sunIntensity: 6.5,
      sunColor: [0.98, 0.95, 0.88],
      causticsIntensity: 1.15,
      underwaterCausticsIntensity: 1.15,
      underwaterShadowIntensity: 1.40,
      underwaterShadowSoftness: 0.85,
      dispersionStrength: 1.05,
      godRayIntensity: 0.90,
      turtleEnabled: false,
      debrisEnabled: true,
      debrisType: 'seaweed', // 정원 연못 환경에서 부유 연잎(수련/Water Lily Pads & 연꽃)으로 실시간 렌더링
      marineSnowEnabled: false,
      bubbleStreamEnabled: false,
      ambientMode: 'calm',
      rainMode: false,
    },
  },
  {
    id: 'river',
    nameKo: '청정 강물',
    nameEn: 'Crystal River',
    tagline: '잔잔한 물결과 바람, 비가 어우러진 맑은 강',
    description: '맑은 여울목과 조약돌 바닥 위로 바람결에 부서지는 은빛 잔물결. 은어와 산천어가 맑은 물살을 헤치며 날렵하게 유영하는 최고의 사실적 강물 수면 환경.',
    icon: '🏞️',
    badge: '맑은 강',
    fishSummary: '강 어류 (은어 · 산천어 · 무지개송어 · 피라미 · 갈겨니)',
    config: {
      waterEnvironment: 'river',
      waveScale: 0.055,
      waveSpeed: 0.95,
      choppiness: 0.82,
      windSpeed: 4.8,
      waterDepth: 1.6,
      absorption: [0.42, 0.075, 0.085],
      scattering: [0.028, 0.052, 0.068],
      turbidity: 0.65,
      causticsIntensity: 1.1,
      dispersionStrength: 1.05,
      godRayIntensity: 1.3,
      turtleEnabled: false,
      debrisEnabled: false,
      marineSnowEnabled: false,
      bubbleStreamEnabled: true,
      ambientMode: 'both',
    },
  },
  {
    id: 'ocean',
    nameKo: '푸른 바다',
    nameEn: 'Open Ocean',
    tagline: '세계 12대 크리스탈 해변과 대양의 너울',
    description: '탁 트인 수평선 너머로 밀려오는 웅장한 대양의 너울과 산호초 에메랄드 블루. 바다거북과 화려한 열대 산호초 어류, 마린 스노우가 살아 숨쉬는 바다 생태계.',
    icon: '🌊',
    badge: '대양과 해변',
    fishSummary: '바다 어류 & 바다거북 (참다랑어 · 블루탱 · 클라운피시 · 엔젤피시)',
    config: {
      waterEnvironment: 'ocean',
      waveScale: 0.092,
      waveSpeed: 1.25,
      choppiness: 1.38,
      windSpeed: 8.5,
      waterDepth: 2.2,
      absorption: [0.55, 0.065, 0.12],
      scattering: [0.022, 0.045, 0.075],
      turbidity: 1.05,
      causticsIntensity: 1.35,
      dispersionStrength: 1.25,
      godRayIntensity: 1.5,
      turtleEnabled: true,
      debrisEnabled: false,
      marineSnowEnabled: true,
      bubbleStreamEnabled: true,
      ambientMode: 'waves',
    },
  },
];

export interface WeatherPreset {
  id: string;
  name: string; // Korean name
  englishName: string; // English name
  icon: string; // emoji icon
  tagline: string;
  description: string;
  windSpeed: number; // m/s
  waveScale: number; // Target wave slope
  waveSpeed: number;
  choppiness: number;
  turbidity: number;
  sunIntensity: number;
  sunElevation: number;
  colorTemperature: number;
  sunColor: [number, number, number];
  exposure: number;
  rainMode: boolean;
  rainIntensity: number;
  ambientMode?: 'waves' | 'rain' | 'both' | 'calm';
  config: Partial<WaterConfig>;
}

export const WEATHER_PRESETS: WeatherPreset[] = [
  {
    id: 'calm',
    name: '잔잔한 바다',
    englishName: 'Calm Sea',
    icon: '☀️',
    tagline: '미풍과 잔물결, 맑고 투명한 청명 하늘',
    description: '바람이 잦아들어 잔잔한 수면에 투명한 햇살이 바닥까지 드리우는 평온하고 맑은 바다.',
    windSpeed: 1.8,
    waveScale: 0.038,
    waveSpeed: 0.72,
    choppiness: 0.35,
    turbidity: 0.40,
    sunIntensity: 7.2,
    sunElevation: 58,
    colorTemperature: 5800,
    sunColor: [1.0, 0.95, 0.88],
    exposure: 0.63,
    rainMode: false,
    rainIntensity: 1,
    ambientMode: 'calm',
    config: {
      weather: 'calm',
      windSpeed: 1.8,
      waveScale: 0.038,
      waveSpeed: 0.72,
      choppiness: 0.35,
      turbidity: 0.40,
      sunIntensity: 7.2,
      sunElevation: 58,
      colorTemperature: 5800,
      sunColor: [1.0, 0.95, 0.88],
      exposure: 0.63,
      bloomIntensity: 1.0,
      diffractionIntensity: 1.0,
      rainMode: false,
      rainIntensity: 1,
      ambientMode: 'calm',
      waterDepth: 1.5,
    },
  },
  {
    id: 'stormy',
    name: '폭풍우',
    englishName: 'Stormy Weather',
    icon: '⛈️',
    tagline: '거센 강풍과 높은 파도, 어두운 먹구름',
    description: '강력한 돌풍이 몰아치며 높은 파고의 너울과 백파가 일렁이고 세찬 비가 쏟아지는 거친 바다.',
    windSpeed: 19.5,
    waveScale: 0.142,
    waveSpeed: 1.60,
    choppiness: 2.1,
    turbidity: 2.20,
    sunIntensity: 1.8,
    sunElevation: 32,
    colorTemperature: 7400,
    sunColor: [0.65, 0.72, 0.85],
    exposure: 0.48,
    rainMode: true,
    rainIntensity: 8,
    ambientMode: 'both',
    config: {
      weather: 'stormy',
      windSpeed: 19.5,
      waveScale: 0.142,
      waveSpeed: 1.60,
      choppiness: 2.1,
      turbidity: 2.20,
      sunIntensity: 1.8,
      sunElevation: 32,
      colorTemperature: 7400,
      sunColor: [0.65, 0.72, 0.85],
      exposure: 0.48,
      bloomIntensity: 0.7,
      diffractionIntensity: 0.6,
      rainMode: true,
      rainIntensity: 8,
      soundEnabled: true,
      ambientMode: 'both',
      ambientVolume: 0.85,
      waterDepth: 2.4,
    },
  },
  {
    id: 'tropical_rain',
    name: '열대성 비',
    englishName: 'Tropical Rain',
    icon: '🌴🌧️',
    tagline: '따스한 열대 미풍과 쏟아지는 스콜 소나기',
    description: '구름 사이로 스며드는 온화한 산란광 아래 수면 위로 쉼 없이 빗방울이 파문을 일으키는 서정적인 열대 해변.',
    windSpeed: 7.8,
    waveScale: 0.086,
    waveSpeed: 1.05,
    choppiness: 1.0,
    turbidity: 1.05,
    sunIntensity: 4.6,
    sunElevation: 46,
    colorTemperature: 5200,
    sunColor: [0.90, 0.98, 0.92],
    exposure: 0.58,
    rainMode: true,
    rainIntensity: 5,
    ambientMode: 'rain',
    config: {
      weather: 'tropical_rain',
      windSpeed: 7.8,
      waveScale: 0.086,
      waveSpeed: 1.05,
      choppiness: 1.0,
      turbidity: 1.05,
      sunIntensity: 4.6,
      sunElevation: 46,
      colorTemperature: 5200,
      sunColor: [0.90, 0.98, 0.92],
      exposure: 0.58,
      bloomIntensity: 1.2,
      diffractionIntensity: 1.1,
      rainMode: true,
      rainIntensity: 5,
      soundEnabled: true,
      ambientMode: 'rain',
      ambientVolume: 0.75,
      waterDepth: 1.8,
    },
  },
  {
    id: 'sunset',
    name: '황금빛 노을',
    englishName: 'Golden Sunset',
    icon: '🌅',
    tagline: '낮게 깔리는 황혼빛과 붉은 윤슬 너울',
    description: '수평선 너머로 저물어가는 낮은 태양빛이 온 바다를 호박빛으로 물들이며 긴 반사광을 드리우는 노을.',
    windSpeed: 4.2,
    waveScale: 0.058,
    waveSpeed: 0.85,
    choppiness: 0.75,
    turbidity: 0.80,
    sunIntensity: 8.0,
    sunElevation: 12,
    colorTemperature: 2700,
    sunColor: [1.2, 0.68, 0.38],
    exposure: 0.72,
    rainMode: false,
    rainIntensity: 1,
    ambientMode: 'waves',
    config: {
      weather: 'sunset',
      timeOfDay: 18.6,
      windSpeed: 4.2,
      waveScale: 0.058,
      waveSpeed: 0.85,
      choppiness: 0.75,
      turbidity: 0.80,
      sunIntensity: 8.0,
      sunElevation: 12,
      colorTemperature: 2700,
      sunColor: [1.2, 0.68, 0.38],
      exposure: 0.72,
      bloomIntensity: 1.4,
      diffractionIntensity: 1.5,
      rainMode: false,
      rainIntensity: 1,
      ambientMode: 'waves',
      waterDepth: 1.8,
    },
  },
  {
    id: 'misty_dawn',
    name: '안개 낀 새벽',
    englishName: 'Misty Dawn',
    icon: '🌫️',
    tagline: '고요한 물안개와 은은한 새벽 박명광',
    description: '새벽안개가 자욱하게 감돌며 바람 한 점 없이 유리알처럼 고요한 수면에 차분한 푸른빛이 내려앉는 새벽.',
    windSpeed: 1.2,
    waveScale: 0.026,
    waveSpeed: 0.60,
    choppiness: 0.25,
    turbidity: 0.55,
    sunIntensity: 3.5,
    sunElevation: 18,
    colorTemperature: 6800,
    sunColor: [0.78, 0.86, 1.05],
    exposure: 0.68,
    rainMode: false,
    rainIntensity: 1,
    ambientMode: 'calm',
    config: {
      weather: 'misty_dawn',
      timeOfDay: 6.8,
      windSpeed: 1.2,
      waveScale: 0.026,
      waveSpeed: 0.60,
      choppiness: 0.25,
      turbidity: 0.55,
      sunIntensity: 3.5,
      sunElevation: 18,
      colorTemperature: 6800,
      sunColor: [0.78, 0.86, 1.05],
      exposure: 0.68,
      bloomIntensity: 0.9,
      diffractionIntensity: 0.7,
      rainMode: false,
      rainIntensity: 1,
      ambientMode: 'calm',
      waterDepth: 1.6,
    },
  },
];

export interface BeaufortInfo {
  scale: number;
  nameKo: string;
  nameEn: string;
  desc: string;
  icon: string;
}

export function getBeaufortInfo(windSpeed: number): BeaufortInfo {
  if (windSpeed < 1.5) {
    return { scale: 1, nameKo: '실바람', nameEn: 'Light Air', desc: '잔잔하고 매끄러운 유리 같은 수면', icon: '🍃' };
  } else if (windSpeed < 3.3) {
    return { scale: 2, nameKo: '남실바람', nameEn: 'Light Breeze', desc: '작은 잔물결이 일어나는 평온한 바다', icon: '💨' };
  } else if (windSpeed < 5.5) {
    return { scale: 3, nameKo: '산들바람', nameEn: 'Gentle Breeze', desc: '물결이 일기 시작하는 산뜻한 해풍', icon: '🌊' };
  } else if (windSpeed < 8.0) {
    return { scale: 4, nameKo: '건들바람', nameEn: 'Moderate Breeze', desc: '파도가 뚜렷해지고 물결이 일렁임', icon: '🌊' };
  } else if (windSpeed < 10.8) {
    return { scale: 5, nameKo: '흔들바람', nameEn: 'Fresh Breeze', desc: '백파(Whitecaps)가 나타나는 역동적 파도', icon: '💨' };
  } else if (windSpeed < 13.9) {
    return { scale: 6, nameKo: '된바람', nameEn: 'Strong Breeze', desc: '큰 파도가 치며 하얀 물보라가 흩날림', icon: '🌪️' };
  } else if (windSpeed < 17.2) {
    return { scale: 7, nameKo: '센바람', nameEn: 'Near Gale', desc: '바다가 거칠어지고 파고가 급격히 상승', icon: '⚡' };
  } else {
    return { scale: 8, nameKo: '큰바람/폭풍', nameEn: 'Gale/Storm', desc: '거센 파도가 일렁이는 격렬한 폭풍우', icon: '⛈️' };
  }
}

/**
 * Physical Kelvin to RGB conversion (Tanner Helland / Planckian blackbody approximation)
 */
export function kelvinToRGB(kelvin: number): [number, number, number] {
  const temp = Math.max(1500, Math.min(12000, kelvin)) / 100;
  let r: number, g: number, b: number;

  // Red
  if (temp <= 66) {
    r = 255;
  } else {
    const v = temp - 60;
    r = 329.698727446 * Math.pow(Math.max(0.1, v), -0.1332047592);
  }

  // Green
  if (temp <= 66) {
    g = 99.4708025861 * Math.log(Math.max(0.1, temp)) - 161.1195681661;
  } else {
    const v = temp - 60;
    g = 288.1221695283 * Math.pow(Math.max(0.1, v), -0.0755148492);
  }

  // Blue
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(Math.max(0.1, temp - 10)) - 305.0447927307;
  }

  r = Math.max(0, Math.min(255, r)) / 255;
  g = Math.max(0, Math.min(255, g)) / 255;
  b = Math.max(0, Math.min(255, b)) / 255;

  return [r, g, b];
}

/**
 * Calculates sun elevation, azimuth, physical atmospheric light intensity,
 * and correlated color temperature across a continuous day cycle from sunrise to sunset.
 */
export function getTimeOfDayLighting(time: number) {
  // Support time range 5.5 (dawn) to 20.0 (dusk)
  const t = Math.max(5.5, Math.min(20.0, time));
  const sunrise = 6.0;
  const sunset = 19.25;
  const tNorm = (t - sunrise) / (sunset - sunrise);

  // Solar elevation: rises in an arch from ~3.5 deg at sunrise to ~68 deg at solar noon, descends to ~3.5 deg at sunset
  const arch = Math.sin(Math.max(0, Math.min(1, tNorm)) * Math.PI);
  const sunElevation = Math.max(3.0, 3.5 + 64.5 * Math.pow(arch, 0.92));

  // Solar azimuth: travels from East (approx 70 deg) at morning -> South (180 deg) at noon -> West (290 deg) at sunset
  const sunAzimuth = (70.0 + tNorm * 220.0 + 360) % 360;

  // Light intensity: atmospheric airmass attenuation model
  // At low sun angles (sunrise/sunset), light travels through ~10x more atmosphere, reducing direct intensity and softening caustics
  // Peak midday sun reaches ~8.0x
  const sunIntensity = 2.8 + 5.2 * Math.pow(arch, 0.7);

  // Color temperature (Kelvin):
  // Sunrise/Sunset: ~2150K - 2400K (warm orange/amber)
  // Golden hour: ~3000K - 3600K
  // Midday: ~6000K - 6200K
  const colorTemperature = Math.round(2150 + 4050 * Math.pow(arch, 0.85));

  // Compute base RGB from Kelvin
  const baseRgb = kelvinToRGB(colorTemperature);

  // Atmospheric warm enhancement for low sun (Rayleigh scattering)
  const warmShift = Math.max(0, 1.0 - arch * 1.35);
  const sunColor: [number, number, number] = [
    Math.min(1.45, baseRgb[0] * (1.0 + warmShift * 0.28)),
    baseRgb[1] * (1.0 - warmShift * 0.12),
    baseRgb[2] * (1.0 - warmShift * 0.38),
  ];

  return {
    timeOfDay: t,
    sunElevation,
    sunAzimuth,
    sunIntensity,
    colorTemperature,
    sunColor,
  };
}

export interface TimeOfDayInfo {
  timeStr: string;
  period: string;
  nameKo: string;
  nameEn: string;
  icon: string;
}

export function formatTimeOfDay(hours: number): TimeOfDayInfo {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const safeH = m === 60 ? h + 1 : h;
  const safeM = m === 60 ? 0 : m;
  const mStr = safeM < 10 ? `0${safeM}` : `${safeM}`;
  const isPM = safeH >= 12;
  const displayH = safeH > 12 ? safeH - 12 : safeH === 0 ? 12 : safeH;
  const timeStr = `${safeH < 10 ? '0' : ''}${safeH}:${mStr}`;
  const period = `${displayH}:${mStr} ${isPM ? 'PM' : 'AM'}`;

  if (hours < 6.75) {
    return { timeStr, period, nameKo: '일출', nameEn: 'Sunrise', icon: '🌅' };
  } else if (hours < 9.0) {
    return { timeStr, period, nameKo: '이른 아침', nameEn: 'Early Morning', icon: '🌤️' };
  } else if (hours < 11.5) {
    return { timeStr, period, nameKo: '오전', nameEn: 'Mid Morning', icon: '☀️' };
  } else if (hours < 14.0) {
    return { timeStr, period, nameKo: '정오', nameEn: 'Solar Noon', icon: '🌞' };
  } else if (hours < 17.0) {
    return { timeStr, period, nameKo: '오후', nameEn: 'Afternoon', icon: '🌤️' };
  } else if (hours < 18.75) {
    return { timeStr, period, nameKo: '골든아워', nameEn: 'Golden Hour', icon: '🌇' };
  } else {
    return { timeStr, period, nameKo: '일몰', nameEn: 'Sunset', icon: '🌆' };
  }
}

export const TIME_OF_DAY_PRESETS = [
  { time: 6.25, label: '일출', icon: '🌅', sub: '06:15' },
  { time: 9.5, label: '오전', icon: '🌤️', sub: '09:30' },
  { time: 12.5, label: '정오', icon: '☀️', sub: '12:30' },
  { time: 15.5, label: '오후', icon: '🌤️', sub: '15:30' },
  { time: 17.75, label: '골든아워', icon: '🌇', sub: '17:45' },
  { time: 19.2, label: '일몰', icon: '🌆', sub: '19:12' },
];

export interface BeachPreset {
  id: string;
  nameKo: string;
  nameEn: string;
  country: string;
  region: string;
  flag: string;
  tagline: string;
  description: string;
  whyCrystalClear: string;
  seabedType: string;
  config: Partial<WaterConfig>;
}

export const CRYSTAL_BEACH_PRESETS: BeachPreset[] = [
  {
    id: 'mariolu',
    nameKo: '칼라 마리올루',
    nameEn: 'Cala Mariolu',
    country: '이탈리아',
    region: '사르데냐 오로세이만',
    flag: '🇮🇹',
    tagline: '하얀 석회석 조약돌과 티없이 맑은 지중해 블루',
    description: '사르데냐 동부의 비경. 웅장한 석회암 절벽 아래 새하얀 백색 조약돌이 깔려 있어 20m 수심의 바닥까지 크리스탈처럼 투명하게 투영됩니다.',
    whyCrystalClear: '모래 대신 침식된 순백색 석회석 자갈(Pebbles)로 해저가 구성되어 부유 물질이 거의 발생하지 않으며, 강한 태양광이 백색 바닥에서 반사되어 환상적인 형광 청록빛을 발합니다.',
    seabedType: '순백색 석회암 조약돌 & 대리석 자갈',
    config: {
      absorption: [0.44, 0.065, 0.080],
      scattering: [0.016, 0.040, 0.068],
      turbidity: 0.12,
      waterDepth: 1.8,
      waveScale: 0.052,
      choppiness: 0.85,
      windSpeed: 4.2,
      sunElevation: 58,
      sunIntensity: 7.6,
      sunColor: [1.0, 0.94, 0.86],
      causticsIntensity: 1.5,
      dispersionStrength: 1.15,
      godRayIntensity: 1.4,
      cameraHeight: 1.55,
      exposure: 0.64,
    },
  },
  {
    id: 'aitutaki',
    nameKo: '아이투타키 라군',
    nameEn: 'Aitutaki Lagoon',
    country: '쿡 제도',
    region: '남태평양 환초',
    flag: '🇨🇰',
    tagline: '남태평양 환초가 빚어낸 눈부신 에메랄드 시안',
    description: '환초 산호초가 거친 외해의 파도를 완벽히 차단하여 마치 거대한 천연 인피니티 풀처럼 잔잔하고 투명한 옥빛 수면을 유지합니다.',
    whyCrystalClear: '외해 파도가 차단된 얕은 라군 수심(0.8~1.3m)과 고운 산호 탄산칼슘 모래의 높은 반사율로 인해 수면 아래가 거울처럼 반사광을 발산합니다.',
    seabedType: '초미세 산호가루 백사장 & 얕은 사주',
    config: {
      absorption: [0.32, 0.046, 0.092],
      scattering: [0.018, 0.060, 0.062],
      turbidity: 0.08,
      waterDepth: 1.1,
      waveScale: 0.032,
      choppiness: 0.28,
      windSpeed: 2.2,
      sunElevation: 68,
      sunIntensity: 8.2,
      sunColor: [1.02, 0.96, 0.88],
      causticsIntensity: 1.7,
      dispersionStrength: 1.25,
      godRayIntensity: 1.5,
      cameraHeight: 1.45,
      exposure: 0.65,
    },
  },
  {
    id: 'kua_bay',
    nameKo: '마니니오왈리 비치 (쿠아 베이)',
    nameEn: "Manini'owali Beach (Kua Bay)",
    country: '미국',
    region: '하와이 빅아일랜드',
    flag: '🇺🇸',
    tagline: '검은 화산암 현무암과 대비되는 찬란한 코발트',
    description: '화산섬 특유의 검은 현무암 암반과 순백의 모래사장이 만나는 곳. 태평양의 맑고 거대한 롤링 스웰이 부서지며 빚어내는 청량한 투명도.',
    whyCrystalClear: '화학적으로 안정된 현무암 지층과 태평양 심해에서 밀려오는 청정 해류의 순환으로 유기 오염 물질이 전무하며 높은 명암 대비를 선사합니다.',
    seabedType: '화산 현무암 암초 & 백색 석영 모래',
    config: {
      absorption: [0.42, 0.070, 0.072],
      scattering: [0.024, 0.048, 0.070],
      turbidity: 0.16,
      waterDepth: 2.1,
      waveScale: 0.088,
      choppiness: 1.35,
      windSpeed: 7.2,
      sunElevation: 54,
      sunIntensity: 7.4,
      sunColor: [0.98, 0.94, 0.88],
      causticsIntensity: 1.2,
      dispersionStrength: 1.1,
      godRayIntensity: 1.3,
      cameraHeight: 1.65,
      exposure: 0.62,
    },
  },
  {
    id: 'flamenco',
    nameKo: '플라멩코 비치',
    nameEn: 'Playa Flamenco',
    country: '푸에르토리코',
    region: '쿨레브라 섬',
    flag: '🇵🇷',
    tagline: '말굽형 만의 잔잔함과 형광빛 민트 터콰이즈',
    description: '카리브해를 대표하는 파라다이스. 말굽형 지형이 파도를 막아주어 바람 없는 날에는 물이 없는 듯 바닥이 드러나는 수정 같은 바다.',
    whyCrystalClear: '조류의 유입이 완만한 천연 만 구조와 탄산칼슘 함량이 90% 이상인 산호 모래가 태양 직사광선을 굴절 및 난반사시킵니다.',
    seabedType: '탄산칼슘 산호 백모래 & 잔잔한 모래톱',
    config: {
      absorption: [0.35, 0.052, 0.108],
      scattering: [0.018, 0.054, 0.062],
      turbidity: 0.11,
      waterDepth: 1.4,
      waveScale: 0.044,
      choppiness: 0.42,
      windSpeed: 3.5,
      sunElevation: 62,
      sunIntensity: 7.8,
      sunColor: [1.0, 0.95, 0.86],
      causticsIntensity: 1.4,
      dispersionStrength: 1.2,
      godRayIntensity: 1.35,
      cameraHeight: 1.5,
      exposure: 0.63,
    },
  },
  {
    id: 'francis_bay',
    nameKo: '프란시스 베이',
    nameEn: 'Francis Bay',
    country: '미국령 버진 아일랜드',
    region: '세인트 존 국립공원',
    flag: '🇻🇮',
    tagline: '해양 국립공원의 보호구역과 바다거북의 유리알 안식처',
    description: '버진 아일랜드 국립공원으로 엄격히 보호받는 해역. 녹색 바다거북과 가오리가 수영하는 모습을 물 위에서도 선명히 볼 수 있습니다.',
    whyCrystalClear: '개발이 전면 금지된 국립공원 생태계와 맹그로브의 자연 정화 필터링, 그리고 풍부한 해초 군락이 바닥 침전물을 고정해 탁도를 극도로 낮춥니다.',
    seabedType: '천연 해초 군락 & 부드러운 산호 백사장',
    config: {
      absorption: [0.38, 0.056, 0.090],
      scattering: [0.022, 0.052, 0.058],
      turbidity: 0.14,
      waterDepth: 1.6,
      waveScale: 0.040,
      choppiness: 0.36,
      windSpeed: 2.8,
      sunElevation: 54,
      sunIntensity: 7.1,
      sunColor: [1.0, 0.93, 0.84],
      causticsIntensity: 1.3,
      dispersionStrength: 1.05,
      godRayIntensity: 1.25,
      cameraHeight: 1.5,
      exposure: 0.63,
    },
  },
  {
    id: 'porto_katsiki',
    nameKo: '포르토 카치키',
    nameEn: 'Porto Katsiki',
    country: '그리스',
    region: '레프카다 이오니아해',
    flag: '🇬🇷',
    tagline: '거대한 백색 석회암 절벽과 신비로운 일렉트릭 밀키 블루',
    description: '이오니아해의 전설적인 해변. 깎아지른 백색 절벽 아래 물감을 풀어놓은 듯 비현실적인 네온 블루빛 바다가 펼쳐집니다.',
    whyCrystalClear: '석회암 절벽에서 지속적으로 공급되는 미세한 방해석(Calcite) 입자가 물속에서 레일리 산란(Rayleigh Scattering)을 유발해 특유의 밀키 네온 블루 광학 특성을 띱니다.',
    seabedType: '미세 석회석 분말 & 연백색 굵은 자갈',
    config: {
      absorption: [0.48, 0.060, 0.055],
      scattering: [0.038, 0.070, 0.095],
      turbidity: 0.35,
      waterDepth: 2.4,
      waveScale: 0.074,
      choppiness: 0.95,
      windSpeed: 5.8,
      sunElevation: 60,
      sunIntensity: 7.9,
      sunColor: [0.96, 0.94, 0.90],
      causticsIntensity: 1.25,
      dispersionStrength: 1.3,
      godRayIntensity: 1.6,
      cameraHeight: 1.7,
      exposure: 0.66,
    },
  },
  {
    id: 'yapak',
    nameKo: '야팍 비치 (푸카 쉘 비치)',
    nameEn: 'Yapak Beach (Puka Shell Beach)',
    country: '필리핀',
    region: '보라카이 북단',
    flag: '🇵🇭',
    tagline: '푸카 조개껍데기 해저와 깊고 짙은 에메랄드 파도',
    description: '화이트 비치의 번잡함에서 벗어난 보라카이 북단. 파도에 갈린 천연 푸카 쉘 조개껍질 모래와 깊은 수심의 에메랄드 물결이 매혹적입니다.',
    whyCrystalClear: '조개껍질이 잘게 부서진 굵은 입자의 푸카 쉘 해저는 조류에 쉽게 떠오르지 않아 거센 파도 속에서도 수중 가시거리가 탁월하게 유지됩니다.',
    seabedType: '푸카 조개껍데기 파편 & 거친 백색 모래',
    config: {
      absorption: [0.40, 0.066, 0.088],
      scattering: [0.024, 0.050, 0.062],
      turbidity: 0.20,
      waterDepth: 2.2,
      waveScale: 0.078,
      choppiness: 1.10,
      windSpeed: 6.2,
      sunElevation: 65,
      sunIntensity: 7.7,
      sunColor: [1.0, 0.94, 0.85],
      causticsIntensity: 1.35,
      dispersionStrength: 1.15,
      godRayIntensity: 1.4,
      cameraHeight: 1.6,
      exposure: 0.64,
    },
  },
  {
    id: 'porthcurno',
    nameKo: '포스쿠로',
    nameEn: 'Porthcurno',
    country: '영국',
    region: '콘월 남서단',
    flag: '🇬🇧',
    tagline: '화강암 협곡 사이 대서양의 차갑고 투명한 청록색 보석',
    description: '영국 남서단 콘월의 지상낙원. 미나크 극장 아래 화강암 절벽 사이에 숨겨진 청록색 바다로 영국이라는 사실이 믿기지 않을 만큼 맑습니다.',
    whyCrystalClear: '조개껍데기가 부서져 융기한 조개화강암 모래와 북대서양의 한랭 청정 해류, 그리고 높은 색온도(6500K)의 북유럽 채광이 어우러져 청량한 에메랄드를 발산합니다.',
    seabedType: '화강암 자갈 & 연노랑 조개껍질 분말',
    config: {
      absorption: [0.46, 0.072, 0.120],
      scattering: [0.030, 0.058, 0.054],
      turbidity: 0.24,
      waterDepth: 1.9,
      waveScale: 0.082,
      choppiness: 1.22,
      windSpeed: 6.8,
      colorTemperature: 6400,
      sunElevation: 46,
      sunIntensity: 6.8,
      sunColor: [0.94, 0.96, 1.0],
      causticsIntensity: 1.15,
      dispersionStrength: 1.2,
      godRayIntensity: 1.3,
      cameraHeight: 1.6,
      exposure: 0.68,
    },
  },
  {
    id: 'anse_source',
    nameKo: "앙세 소스 다종",
    nameEn: "Anse Source d'Argent",
    country: '세이셸',
    region: '라 디게 섬',
    flag: '🇸🇨',
    tagline: '태고의 핑크빛 화강암 거석과 무릎 높이의 얕은 라군',
    description: '지구상에서 가장 많은 사진이 찍힌 해변. 수억 년 풍화된 거대한 화강암 바위들과 산호초로 둘러싸인 잔잔한 크리스탈 바다의 환상적인 조화.',
    whyCrystalClear: '외해 파도를 완벽히 흡수하는 거초(Fringing Reef)와 0.9m 미만의 얕은 라군 수심, 그리고 화강암 바위들의 차폐 효과로 물결이 거의 일지 않는 유리판 같은 정온도.',
    seabedType: '핑크빛 화강암 암반 & 미세 산호사',
    config: {
      absorption: [0.34, 0.058, 0.102],
      scattering: [0.018, 0.046, 0.056],
      turbidity: 0.10,
      waterDepth: 0.9,
      waveScale: 0.036,
      choppiness: 0.30,
      windSpeed: 2.4,
      sunElevation: 56,
      sunIntensity: 7.5,
      sunColor: [1.02, 0.95, 0.86],
      causticsIntensity: 1.6,
      dispersionStrength: 1.25,
      godRayIntensity: 1.3,
      cameraHeight: 1.4,
      exposure: 0.64,
    },
  },
  {
    id: 'macarelleta',
    nameKo: '칼라 마카렐레타',
    nameEn: 'Cala Macarelleta',
    country: '스페인',
    region: '발레아레스 제도 미노르카',
    flag: '🇪🇸',
    tagline: '배가 공중에 뜬 듯한 극치의 투명도와 천연 수영장',
    description: '소나무 숲과 석회암 절벽에 포근히 감싸인 만. 정박한 요트의 그림자가 물 밑 바닥에 너무나 선명히 드리워져 마치 공중에 떠 있는 듯한 착시를 일으킵니다.',
    whyCrystalClear: '극도로 적은 강우량과 육상 유출수 부재, 지중해 포시도니아 오세아니카(해초) 군락의 강력한 산소 공급 및 수질 정화 작용으로 수중 가시거리 30m 이상 달성.',
    seabedType: '순백색 석회석 미세 모래 & 천연 포시도니아 해초',
    config: {
      absorption: [0.38, 0.050, 0.076],
      scattering: [0.015, 0.036, 0.064],
      turbidity: 0.07,
      waterDepth: 1.7,
      waveScale: 0.042,
      choppiness: 0.38,
      windSpeed: 2.6,
      sunElevation: 55,
      sunIntensity: 7.8,
      sunColor: [1.0, 0.96, 0.88],
      causticsIntensity: 1.65,
      dispersionStrength: 1.3,
      godRayIntensity: 1.45,
      cameraHeight: 1.55,
      exposure: 0.63,
    },
  },
  {
    id: 'shoal_bay',
    nameKo: '쇼알 베이',
    nameEn: 'Shoal Bay',
    country: '앵귈라',
    region: '동카리브해',
    flag: '🇦🇮',
    tagline: '은은한 핑크빛 산호 모래와 끝없이 이어지는 네온 터콰이즈',
    description: '카리브해 최고의 해변으로 손꼽히는 3km의 파라다이스. 산호 조각이 섞인 핑크빛 백사장과 태양광 아래 형광으로 빛나는 투명한 아쿠아마린 바다.',
    whyCrystalClear: '섬 전체가 석회암 암반으로 이루어져 강이나 하천이 없으므로 바다로 흙탕물이 흘러들지 않아 연중 변함없는 완벽한 투명도를 자랑합니다.',
    seabedType: '핑크빛 미세 분홍 산호 모래',
    config: {
      absorption: [0.33, 0.044, 0.086],
      scattering: [0.017, 0.050, 0.066],
      turbidity: 0.09,
      waterDepth: 1.5,
      waveScale: 0.048,
      choppiness: 0.52,
      windSpeed: 3.8,
      sunElevation: 64,
      sunIntensity: 8.0,
      sunColor: [1.02, 0.96, 0.88],
      causticsIntensity: 1.5,
      dispersionStrength: 1.2,
      godRayIntensity: 1.4,
      cameraHeight: 1.5,
      exposure: 0.64,
    },
  },
  {
    id: 'baia_dos_porcos',
    nameKo: '바이아 두스 포르코스',
    nameEn: 'Baia dos Porcos',
    country: '브라질',
    region: '페르난도 데 노로냐 군도',
    flag: '🇧🇷',
    tagline: '유네스코 해양보호구역과 쌍둥이 화산암 천연 아쿠아마린 풀',
    description: '대서양 한가운데 고립된 화산 군도. 쌍둥이 바위(Dois Irmãos)를 배경으로 화산암 수영장에 갇힌 수정 바다에서 스노클링을 즐길 수 있습니다.',
    whyCrystalClear: '일일 입도객 수를 엄격히 제한하는 유네스코 세계자연유산으로 자연 그대로의 원생 해양 생태계가 보존되어 맑고 짙은 에메랄드 시안을 유지합니다.',
    seabedType: '어두운 화산 현무암 풀 & 황금빛 산호사',
    config: {
      absorption: [0.43, 0.056, 0.095],
      scattering: [0.026, 0.052, 0.060],
      turbidity: 0.17,
      waterDepth: 2.0,
      waveScale: 0.066,
      choppiness: 0.88,
      windSpeed: 5.2,
      sunElevation: 58,
      sunIntensity: 7.7,
      sunColor: [0.98, 0.95, 0.88],
      causticsIntensity: 1.35,
      dispersionStrength: 1.15,
      godRayIntensity: 1.35,
      cameraHeight: 1.6,
      exposure: 0.64,
    },
  },
];

export interface UnderwaterPreset {
  id: string;
  nameKo: string;
  nameEn: string;
  icon: string;
  badge: string;
  tagline: string;
  description: string;
  inspiration?: string;
  opticalDetails: {
    absorptionDesc: string; // Beer-Lambert σ_a
    scatteringDesc: string; // Volume scattering σ_s
    causticsDesc: string;   // Caustics & underwater light
    shadowDesc: string;     // Dynamic shadow along sun vector
    depthTurbidity: string; // Depth & turbidity
  };
  config: Partial<WaterConfig>;
}

export const UNDERWATER_PRESETS: UnderwaterPreset[] = [
  {
    id: 'kyoto_pond',
    nameKo: '교토 은각사 비단잉어 정원 연못',
    nameEn: 'Kyoto Koi Pond Garden',
    icon: '🌿',
    badge: '일본식 정원 연못',
    tagline: '수련 잎 사이로 유영하는 비단잉어와 이끼 낀 호안석 둘레의 평온한 연못',
    description: '최신 koi-pond-garden 역설계 기법이 집약된 극사실적 일본 정원 연못. 호안석과 단풍나무 정원 그늘에 둘러싸인 고요한 연못 수면 위로 연잎(수련)과 연꽃이 피어있고, 어두운 강자갈 바닥 위로 홍백·대정삼색·황금 비단잉어가 우아하게 유영합니다.',
    inspiration: 'souranyp-stack/koi-pond-garden (2026-09 공개)',
    opticalDetails: {
      absorptionDesc: 'Beer-Lambert σ_a=[0.080, 0.045, 0.040] (잉어 체색 선명도 최적화 저감쇠 청정 수질)',
      scatteringDesc: '미에 용적 산란 σ_s=[0.010, 0.012, 0.015] (은은한 수중 광선과 자연스런 수질)',
      causticsDesc: '수중 집광 1.15x (이끼 낀 조약돌 바닥에 맺히는 부드러운 코스틱스)',
      shadowDesc: '연잎·수련 및 비단잉어 태양광 굴절각 연동 동적 반음영 1.4x (부드러운 반영구 음영)',
      depthTurbidity: '수심 1.2m · 청정 정원 연못 탁도 0.14x',
    },
    config: {
      waterEnvironment: 'pond',
      selectedUnderwaterPresetId: 'kyoto_pond',
      waveScale: 0.030,
      waveSpeed: 0.60,
      choppiness: 0.35,
      windSpeed: 2.2,
      waterDepth: 1.2,
      absorption: [0.080, 0.045, 0.040],
      scattering: [0.010, 0.012, 0.015],
      turbidity: 0.14,
      sunIntensity: 5.8,
      sunColor: [0.98, 0.95, 0.88],
      causticsIntensity: 1.15,
      underwaterCausticsIntensity: 1.15,
      underwaterShadowIntensity: 1.40,
      underwaterShadowSoftness: 0.85,
      causticBloomIntensity: 1.10,
      dispersionStrength: 1.05,
      godRayIntensity: 0.90,
      fishEnabled: true,
      fishCount: 10,
      fishAnimSpeed: 0.85,
      fishPhaseDelay: 1.25,
      fishFormation: 'swarm',
      debrisEnabled: true,
      debrisType: 'seaweed', // In pond environment, this triggers water lily pads (연잎 & 연꽃)
      turtleEnabled: false,
      marineSnowEnabled: false,
      bubbleStreamEnabled: false,
      ambientMode: 'calm',
      rainMode: false,
      timeOfDay: 13.0,
      exposure: 0.64,
    },
  },
  {
    id: 'clearwater_stream',
    nameKo: '알프스 에메랄드 빙하 계곡',
    nameEn: 'Alpine Glacial Stream',
    icon: '💎',
    badge: '초투명 얕은 물',
    tagline: '순수 WebGL2 물리 기반 극사실 얕은 물과 찬란한 코스틱스',
    description: 'Aureliengmz/clearwater의 얕은 물 역설계 광학을 극한으로 끌어올린 초청정 계곡 여울. 탁도 0.08의 극한 투명도 속에서 태양광이 굴절·집중되어 해저 자갈 바닥에 눈부신 그물망 코스틱스를 역추적 투영합니다.',
    inspiration: 'Aureliengmz/clearwater (2026-09 공개)',
    opticalDetails: {
      absorptionDesc: 'Beer-Lambert σ_a=[0.28, 0.042, 0.058] (초고투과율 빙하수)',
      scatteringDesc: '레일리 산란 우세 σ_s=[0.012, 0.030, 0.045] (티없이 맑은 수질)',
      causticsDesc: '수중 광원 배율 1.70x · 색수차 분산 1.45x (눈부신 프리즘 무지개 광채)',
      shadowDesc: '날렵한 강 어류들의 선명하고 정교한 바닥 그림자 투영 1.15x',
      depthTurbidity: '수심 1.1m · 극초투명 탁도 0.08x',
    },
    config: {
      waterEnvironment: 'river',
      selectedUnderwaterPresetId: 'clearwater_stream',
      waveScale: 0.042,
      waveSpeed: 0.88,
      choppiness: 0.55,
      windSpeed: 2.8,
      waterDepth: 1.1,
      absorption: [0.28, 0.042, 0.058],
      scattering: [0.012, 0.030, 0.045],
      turbidity: 0.08,
      causticsIntensity: 1.70,
      underwaterCausticsIntensity: 1.70,
      underwaterShadowIntensity: 1.15,
      underwaterShadowSoftness: 0.90,
      causticBloomIntensity: 1.35,
      dispersionStrength: 1.45,
      godRayIntensity: 1.35,
      fishEnabled: true,
      fishCount: 12,
      fishAnimSpeed: 1.10,
      fishPhaseDelay: 1.0,
      fishFormation: 'swarm',
      debrisEnabled: false,
      turtleEnabled: false,
      marineSnowEnabled: false,
      bubbleStreamEnabled: true,
      ambientMode: 'calm',
      timeOfDay: 12.2,
      exposure: 0.63,
    },
  },
  {
    id: 'maldives_reef',
    nameKo: '몰디브 산호초 라군',
    nameEn: 'Maldives Coral Reef Lagoon',
    icon: '🪸',
    badge: '열대 산호초 해양',
    tagline: '바다거북과 화려한 열대어, 쏟아지는 수중 갓레이 광선',
    description: '남태평양과 인도양의 환상적인 에메랄드 시안 라군. 거대한 녹색 바다거북이 수중을 우아하게 활공하고, 화려한 산호초 어류 떼와 마린 스노우, 상승 기포가 어우러져 웅장한 수중 광원을 연출합니다.',
    opticalDetails: {
      absorptionDesc: 'Beer-Lambert σ_a=[0.38, 0.052, 0.090] (에메랄드 터콰이즈)',
      scatteringDesc: '미에 산란 σ_s=[0.018, 0.048, 0.065] (풍부한 체적 광선)',
      causticsDesc: '수중 광원 배율 1.50x · 갓레이 샤프트 1.65x (환상적인 수중 빛기둥)',
      shadowDesc: '거대한 바다거북 등갑 및 지느러미 날개짓 동적 그림자 1.35x',
      depthTurbidity: '수심 1.8m · 맑은 라군 탁도 0.14x',
    },
    config: {
      waterEnvironment: 'ocean',
      selectedUnderwaterPresetId: 'maldives_reef',
      waveScale: 0.068,
      waveSpeed: 1.05,
      choppiness: 0.95,
      windSpeed: 5.2,
      waterDepth: 1.8,
      absorption: [0.38, 0.052, 0.090],
      scattering: [0.018, 0.048, 0.065],
      turbidity: 0.14,
      causticsIntensity: 1.50,
      underwaterCausticsIntensity: 1.50,
      underwaterShadowIntensity: 1.35,
      underwaterShadowSoftness: 1.05,
      causticBloomIntensity: 1.45,
      dispersionStrength: 1.25,
      godRayIntensity: 1.65,
      fishEnabled: true,
      fishCount: 10,
      fishSpeciesType: 'mixed',
      turtleEnabled: true,
      marineSnowEnabled: true,
      bubbleStreamEnabled: true,
      debrisEnabled: false,
      ambientMode: 'waves',
      timeOfDay: 12.8,
      exposure: 0.65,
    },
  },
  {
    id: 'tahiti_moonlit',
    nameKo: '타히티 신비로운 달빛 라군',
    nameEn: 'Tahiti Moonlit Phosphor',
    icon: '🌌',
    badge: '은은한 밤의 인광',
    tagline: '차분한 밤하늘 은빛 달빛과 푸른빛으로 반짝이는 야간 수중원',
    description: '고요한 밤바다 위로 은빛 달빛이 떨어지며 물결마다 반사되는 밤의 서정. 깊고 짙은 코발트 블루 물속에서 은빛 어류들의 비늘이 달빛 코스틱스에 비쳐 신비로운 푸른 빛을 발산합니다.',
    opticalDetails: {
      absorptionDesc: 'Beer-Lambert σ_a=[0.50, 0.18, 0.08] (깊은 심야 블루)',
      scatteringDesc: '은은한 야간 산란 σ_s=[0.020, 0.040, 0.075]',
      causticsDesc: '수중 달빛 코스틱스 0.90x (부드럽고 몽환적인 밤의 윤슬 투영)',
      shadowDesc: '낮은 달빛 각도에 맞춰 길게 늘어나는 신비로운 달빛 그림자 1.20x',
      depthTurbidity: '수심 2.0m · 탁도 0.50x',
    },
    config: {
      waterEnvironment: 'ocean',
      selectedUnderwaterPresetId: 'tahiti_moonlit',
      timeOfDay: 19.8,
      colorTemperature: 7600,
      sunAzimuth: 30,
      sunElevation: 25,
      sunIntensity: 3.2,
      sunColor: [0.65, 0.82, 1.18],
      waveScale: 0.048,
      waveSpeed: 0.70,
      choppiness: 0.60,
      windSpeed: 3.2,
      waterDepth: 2.0,
      absorption: [0.50, 0.18, 0.08],
      scattering: [0.020, 0.040, 0.075],
      turbidity: 0.50,
      causticsIntensity: 0.90,
      underwaterCausticsIntensity: 0.90,
      underwaterShadowIntensity: 1.20,
      underwaterShadowSoftness: 1.25,
      causticBloomIntensity: 1.30,
      dispersionStrength: 0.90,
      godRayIntensity: 0.85,
      fishEnabled: true,
      fishCount: 8,
      fishSpeciesType: 'sardine_silver',
      turtleEnabled: true,
      marineSnowEnabled: true,
      bubbleStreamEnabled: true,
      debrisEnabled: false,
      ambientMode: 'calm',
      exposure: 0.78,
    },
  },
  {
    id: 'amazon_amber',
    nameKo: '열대 아마존 황금 호박빛 수중원',
    nameEn: 'Amazon Amber Basin',
    icon: '🍃',
    badge: '풍부한 식물성 탄닌',
    tagline: '부식산과 탄닌이 빚어낸 따스한 골든 앰버 빛 수중 생태계',
    description: '열대 우림의 낙엽과 유기물에서 용출된 천연 탄닌산이 만들어낸 황금빛 호박색 수중 세계. 떠다니는 유목(Driftwood)과 부드럽게 산란되는 따스한 빛줄기가 원시 자연의 신비로움을 선사합니다.',
    opticalDetails: {
      absorptionDesc: 'Beer-Lambert σ_a=[0.58, 0.28, 0.08] (짙은 황금빛 호박색 광학 흡수)',
      scatteringDesc: '풍부한 유기물 산란 σ_s=[0.050, 0.080, 0.028] (온화한 광선 번짐)',
      causticsDesc: '수중 광원 배율 1.10x (부드럽고 몽환적인 확산형 코스틱스)',
      shadowDesc: '떠다니는 유목과 어류가 빚어내는 깊고 온화한 연갈색 그림자 1.25x',
      depthTurbidity: '수심 1.6m · 탄닌 수역 탁도 1.60x',
    },
    config: {
      waterEnvironment: 'river',
      selectedUnderwaterPresetId: 'amazon_amber',
      waveScale: 0.038,
      waveSpeed: 0.75,
      choppiness: 0.40,
      windSpeed: 2.2,
      waterDepth: 1.6,
      absorption: [0.58, 0.28, 0.08],
      scattering: [0.050, 0.080, 0.028],
      turbidity: 1.60,
      causticsIntensity: 1.10,
      underwaterCausticsIntensity: 1.10,
      underwaterShadowIntensity: 1.25,
      underwaterShadowSoftness: 1.55,
      causticBloomIntensity: 1.25,
      dispersionStrength: 1.05,
      godRayIntensity: 1.35,
      fishEnabled: true,
      fishCount: 10,
      fishSpeciesType: 'tropical_reef',
      debrisEnabled: true,
      debrisType: 'driftwood',
      turtleEnabled: false,
      marineSnowEnabled: true,
      bubbleStreamEnabled: false,
      ambientMode: 'rain',
      timeOfDay: 14.5,
      exposure: 0.65,
    },
  },
  {
    id: 'resort_infinity',
    nameKo: '청정 리조트 인피니티 풀',
    nameEn: 'Resort Crystal Pool',
    icon: '🏊',
    badge: '초투명 인피니티 풀',
    tagline: '불순물 없는 초투명 수질과 극도로 선명한 기하학적 코스틱스',
    description: '청정하게 정화된 최고급 리조트의 인피니티 풀장. 불순물이 전혀 없는 수질로 정오의 강렬한 햇살이 바닥의 조약돌 타일에 날카롭고 선명한 코스틱 무늬와 또렷한 그림자를 그립니다.',
    opticalDetails: {
      absorptionDesc: 'Beer-Lambert σ_a=[0.24, 0.032, 0.048] (순수 청정수 투과율)',
      scatteringDesc: '산란 물질 극소화 σ_s=[0.010, 0.025, 0.040] (크리스탈 투명도)',
      causticsDesc: '수중 광원 배율 1.85x · 색수차 1.55x (선명하고 기하학적인 빛의 망)',
      shadowDesc: '바닥에 정밀하게 맺히는 초고화질 수중 그림자 1.45x',
      depthTurbidity: '수심 1.3m · 순수 수질 탁도 0.05x',
    },
    config: {
      waterEnvironment: 'pond',
      selectedUnderwaterPresetId: 'resort_infinity',
      waveScale: 0.032,
      waveSpeed: 0.85,
      choppiness: 0.25,
      windSpeed: 1.5,
      waterDepth: 1.3,
      absorption: [0.24, 0.032, 0.048],
      scattering: [0.010, 0.025, 0.040],
      turbidity: 0.05,
      causticsIntensity: 1.85,
      underwaterCausticsIntensity: 1.85,
      underwaterShadowIntensity: 1.45,
      underwaterShadowSoftness: 0.75,
      causticBloomIntensity: 1.10,
      dispersionStrength: 1.55,
      godRayIntensity: 1.10,
      fishEnabled: false,
      debrisEnabled: false,
      turtleEnabled: false,
      marineSnowEnabled: false,
      bubbleStreamEnabled: false,
      ambientMode: 'calm',
      timeOfDay: 12.5,
      exposure: 0.60,
    },
  },
];
