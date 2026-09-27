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
  dispersionStrength: number; // Chromatic aberration in caustics (0.5 ~ 2.5)

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
  timeOfDay: 12.5,
  colorTemperature: 5800,
  sunAzimuth: 175,
  sunElevation: 56,
  sunIntensity: 7.2,
  sunColor: [1.0, 0.94, 0.84],
  waveScale: 0.078,
  waveSpeed: 1.0,
  choppiness: 1.1,
  waterDepth: 1.6,
  windSpeed: 6.0,
  absorption: [0.40, 0.074, 0.088],
  scattering: [0.028, 0.052, 0.068],
  turbidity: 1.0,
  depthMarkerEnabled: true,
  causticsIntensity: 1.0,
  dispersionStrength: 1.0,
  cameraHeight: 1.55,
  cameraFov: 64,
  exposure: 0.63,
  toneMappingMode: 'hdr',
  hdrExposureBoost: 1.0,
  bloomIntensity: 1.0,
  diffractionIntensity: 1.0,
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
  ambientMode: 'waves',
  weather: 'calm',
};

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
