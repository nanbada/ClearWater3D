/**
 * ClearWater 3D Simulation Engine
 * Based on Aureliengmz/clearwater
 * Full WebGL2 implementation with FFT Ocean Spectrum, Interactive Wave Equation Ripples,
 * Refracted-Grid Caustics with Chromatic Dispersion, Physically Based Underwater Shading,
 * and 2D FFT Lens Diffraction Glare.
 */

import { WaterConfig, DEFAULT_CONFIG } from './presets';
import { waterAudio } from './audio';
import pebblesAsset from './pebbles.jpg';
import {
  constrainAngularVelocity,
  computeBoundarySteering,
  applyHydrodynamicLocomotion,
  computeAquaticObstacleAvoidance,
  computeTerrainAwarePathfinding,
  AquaticObstacle,
} from './steering';
import { FishAgent } from './FishAgent';
import { generateProceduralEcosystem, ProceduralEcosystem } from './proceduralVegetation';

export interface SimStats {
  fps: number;
  width: number;
  height: number;
  quality: number;
  causticsTimeMs?: number;
}

export class WaterSimulation {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private animId: number | null = null;
  private disposed = false;

  // Config
  public config: WaterConfig;
  public onStats?: (stats: SimStats) => void;

  // Extensions
  private extF32: unknown;
  private extF16: unknown;
  private extAniso: EXT_texture_filter_anisotropic | null = null;
  private FFT_FMT: number;

  // GL Helpers & Objects
  private triVAO: WebGLVertexArrayObject | null = null;
  private gridVAO: WebGLVertexArrayObject | null = null;

  // FFT Ocean
  private N = 256;
  private LOGN = 8;
  private L = 4.6; // patch size in meters
  private h0Tex: WebGLTexture | null = null;
  private fftA: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;
  private fftB: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;
  private surfRT: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;

  // Ripples
  private RN = 256;
  private RSIZE = 7.0;
  private rip: Array<{ t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }> = [];
  private ripN: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;
  private ripIdx = 0;
  private ripCenter: [number, number] = [0, 0];
  private drops: Array<[number, number, number, number]> = [];
  private ripActive = 0;

  // Caustics
  private G = 256;
  private C = 1024;
  private causRT: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;
  private causShift: [number, number] = [0, 0];
  private IORS = [1.3315, 1.3335, 1.3365];

  // Pebbles
  private pebTex: WebGLTexture | null = null;
  private pebReady = false;

  // Render Targets
  private W = 0;
  private H = 0;
  private quality = 0.85;
  private hdrRT: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;
  private qA: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;
  private qB: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;
  private streakRT: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;
  private b1: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;
  private b2: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;
  private b2t: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;

  // Post-processing Caustic Bloom & Lens Flare RTs
  private causBloomA: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;
  private causBloomB: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;
  private causBloomWide: { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;

  // Lens Diffraction Glare
  private GLARE_ON = true;
  private glareTick = 0;
  private gX = 0;
  private gY = 0;
  private gSW = 0;
  private gSH = 0;
  private gA: Array<{ t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }> = [];
  private gB: Array<{ t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }> = [];
  private gK1: WebGLTexture | null = null;
  private gK2: WebGLTexture | null = null;
  private PSF: { n: number; rgb: Float32Array } | null = null;

  // Camera & Input State with 3D Stroll Navigation
  public cam = {
    x: 0,
    y: 1.35,
    z: 0.50,
    targetX: 0,
    targetY: 1.35,
    targetZ: 0.50,
    yaw: 0,
    pitch: -0.30,
    targetYaw: 0,
    targetPitch: -0.30,
    vy: 0,
    vp: 0,
    h: 1.35,
  };
  public currentGardenViewpoint: 'deck' | 'pond' | 'stepping' | 'pine' | 'lantern' | 'bamboo' = 'deck';

  public setGardenViewpoint(preset: 'deck' | 'pond' | 'stepping' | 'pine' | 'lantern' | 'bamboo') {
    this.currentGardenViewpoint = preset;
    switch (preset) {
      case 'deck': // 🍵 툇마루 관람석 (전통 삼나무 툇마루에서 연못과 정원 전체 조망)
        this.cam.targetX = 0.0;
        this.cam.targetY = 1.35;
        this.cam.targetZ = 0.50;
        this.cam.targetPitch = -0.30;
        this.cam.targetYaw = 0.0;
        break;
      case 'pond': // 🌊 연못 수면 밀착 (물결, 비단잉어, 부유 수련 연잎 초근접 시점)
        this.cam.targetX = 0.0;
        this.cam.targetY = 0.38;
        this.cam.targetZ = -1.65;
        this.cam.targetPitch = -0.16;
        this.cam.targetYaw = 0.0;
        break;
      case 'stepping': // 🪨 디딤돌 산책로 (연못 수로를 가로지르는 징검다리 시점)
        this.cam.targetX = 1.25;
        this.cam.targetY = 0.65;
        this.cam.targetZ = -1.85;
        this.cam.targetPitch = -0.22;
        this.cam.targetYaw = -0.45;
        break;
      case 'pine': // 🌲 조형 흑송 & 호안석 (용트림 흑송 고목과 호안석 석축 클로즈업)
        this.cam.targetX = -1.80;
        this.cam.targetY = 0.85;
        this.cam.targetZ = -3.35;
        this.cam.targetPitch = -0.12;
        this.cam.targetYaw = 0.85;
        break;
      case 'lantern': // 🏮 카스가 석등 & 붉은 단풍 (등불과 수양 단풍 비경)
        this.cam.targetX = 1.85;
        this.cam.targetY = 0.95;
        this.cam.targetZ = -3.80;
        this.cam.targetPitch = -0.15;
        this.cam.targetYaw = -1.25;
        break;
      case 'bamboo': // 🎋 대나무숲 산책길 (건인지 대나무 담장과 비단이끼 언덕길 산책)
        this.cam.targetX = -2.85;
        this.cam.targetY = 1.05;
        this.cam.targetZ = -5.20;
        this.cam.targetPitch = -0.10;
        this.cam.targetYaw = 0.40;
        break;
    }
  }

  // 🚶‍♂️ Interactive 3D Garden & Pond Stroll Movement (자유 이동)
  public moveCameraLocal(forward: number, strafe: number, elevation: number = 0) {
    const yaw = this.cam.yaw;
    const fx = Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = Math.sin(yaw);

    this.cam.targetX += (fx * forward + rx * strafe);
    this.cam.targetZ += (fz * forward + rz * strafe);
    this.cam.targetY = Math.max(0.20, Math.min(3.20, this.cam.targetY + elevation));

    // Keep camera within garden & pond walking boundaries
    this.cam.targetX = Math.max(-4.8, Math.min(4.8, this.cam.targetX));
    this.cam.targetZ = Math.max(-9.5, Math.min(1.2, this.cam.targetZ));
  }

  public isDragging = false;
  private dragStart = { x: 0, y: 0, t: 0 };
  private lastDragRipplePos = { x: 0, y: 0, t: 0 };
  private lastTapPos: [number, number] | null = null;
  private rainTimer = 0;

  // 3D Fish School with Spline-Interpolated Body Curves
  private fishes: FishAgent[] = [];
  private fishPosBuffer = new Float32Array(48); // 12 fish * 4 floats
  private fishDirBuffer = new Float32Array(48);
  private fishColBuffer = new Float32Array(48);
  private pointerWorldPos: [number, number, number] | null = null;
  private shockwaveTimer = 0;
  private shockwaveOrigin: [number, number] = [0, 0];

  // Procedural Aquatic Vegetation & Lotus Ecosystem (절차적 수생식물 및 연꽃 군락)
  public proceduralEco!: ProceduralEcosystem;
  public pondLilyObstacles: AquaticObstacle[] = [];

  public regenerateVegetation(seed?: number, density?: 'sparse' | 'natural' | 'lush' | 'sanctuary', bloomRate?: number) {
    const newSeed = seed ?? Math.floor(Math.random() * 100000);
    this.config.vegetationSeed = newSeed;
    if (density) this.config.vegetationDensity = density;
    if (typeof bloomRate === 'number') this.config.lotusFlowerBloomRate = bloomRate;
    this.proceduralEco = generateProceduralEcosystem(
      newSeed,
      this.config.vegetationDensity ?? 'natural',
      this.config.lotusFlowerBloomRate ?? 0.55,
      (x, z) => this.getPondWaterDist(x, z)
    );
    this.pondLilyObstacles = this.proceduralEco.obstacles;
    for (const pad of this.proceduralEco.pads) {
      this.addDisturbance(pad.x, pad.z, 0.04, 0.07);
    }
  }

  // 🌿 16-Point Closed Catmull-Rom Spline Control Radii for Expansive Japanese Pond Basin
  // Cartesian orientation: Index 0: East (+x), Index 4: South (+z, viewing deck), Index 8: West (-x), Index 12: North (-z, garden vista)
  private static readonly POND_BASIN_RADII: number[] = [
    4.50, // 0: East shore (graceful pebble bank)
    4.00, // 1: ESE
    3.55, // 2: SE (smooth curve towards deck)
    3.15, // 3: SSE
    2.90, // 4: South (viewing deck shore at z ≈ +0.30, gentle curve!)
    3.15, // 5: SSW
    3.55, // 6: SW (curved bank with rocks)
    4.10, // 7: WSW
    4.55, // 8: West (velvet moss slope)
    5.20, // 9: WNW (tranquil cove)
    5.80, // 10: NW (rocky promontory with weathered boulders)
    6.40, // 11: NNW (North-West outlet stream opening)
    6.80, // 12: North (deep garden vista, distant moss knolls)
    6.40, // 13: NNE (opening to North-East winding waterway)
    5.60, // 14: NE (stone lantern scenic promontory)
    4.90, // 15: ENE (stepping stones path margin)
  ];

  // 🌿 North-East Winding Yarimizu Stream Catmull-Rom Control Points
  private static readonly STREAM1_X: number[] = [1.85, 2.45, 2.95, 2.50, 3.10, 3.40];
  private static readonly STREAM1_W: number[] = [1.45, 1.25, 1.10, 0.95, 0.85, 0.75];

  // 🌿 North-West Outlet Yarimizu Stream Catmull-Rom Control Points
  private static readonly STREAM2_X: number[] = [-1.70, -2.40, -2.85, -2.35, -2.75, -2.95];
  private static readonly STREAM2_W: number[] = [1.35, 1.15, 1.05, 0.90, 0.80, 0.70];

  public static evalCatmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  public getPondWaterDist(x: number, z: number): number {
    const dx = x - 0.0;
    const dz = z - (-2.6);
    const distBasinCenter = Math.hypot(dx, dz);
    let a = Math.atan2(dz, dx);
    const TAU = Math.PI * 2;
    if (a < 0) a += TAU;

    // 1. Evaluate Closed Catmull-Rom Spline Basin Radius
    const uRaw = a * (16 / TAU);
    const idx = Math.floor(uRaw);
    const t = uRaw - idx;
    const R = WaterSimulation.POND_BASIN_RADII;
    const i0 = (idx + 15) % 16;
    const i1 = idx % 16;
    const i2 = (idx + 1) % 16;
    const i3 = (idx + 2) % 16;
    const rBasin = WaterSimulation.evalCatmullRom(R[i0], R[i1], R[i2], R[i3], t);
    const dBasin = distBasinCenter - rBasin;

    // 2. Evaluate North-East Winding Stream (Catmull-Rom Spline)
    let dStream1 = 99.0;
    if (z <= -3.0 && z >= -16.5) {
      const uS1 = (-z - 3.5) / 2.5;
      const k1 = Math.max(0, Math.min(4, Math.floor(uS1)));
      const t1 = Math.max(0, Math.min(1, uS1 - k1));
      const X1 = WaterSimulation.STREAM1_X;
      const W1 = WaterSimulation.STREAM1_W;
      const k0 = Math.max(0, k1 - 1);
      const k2 = Math.min(5, k1 + 1);
      const k3 = Math.min(5, k1 + 2);
      const cx1 = WaterSimulation.evalCatmullRom(X1[k0], X1[k1], X1[k2], X1[k3], t1);
      const cw1 = WaterSimulation.evalCatmullRom(W1[k0], W1[k1], W1[k2], W1[k3], t1);
      dStream1 = Math.abs(x - cx1) - cw1;
      if (z < -13.5) {
        const tFade = Math.max(0, Math.min(1, (-z - 13.5) / 2.5));
        dStream1 += tFade * tFade * 1.8;
      }
    }

    // 3. Evaluate North-West Outlet Stream (Catmull-Rom Spline)
    let dStream2 = 99.0;
    if (z <= -3.0 && z >= -16.5) {
      const uS2 = (-z - 3.5) / 2.5;
      const k2Seg = Math.max(0, Math.min(4, Math.floor(uS2)));
      const t2 = Math.max(0, Math.min(1, uS2 - k2Seg));
      const X2 = WaterSimulation.STREAM2_X;
      const W2 = WaterSimulation.STREAM2_W;
      const k0 = Math.max(0, k2Seg - 1);
      const k2 = Math.min(5, k2Seg + 1);
      const k3 = Math.min(5, k2Seg + 2);
      const cx2 = WaterSimulation.evalCatmullRom(X2[k0], X2[k2Seg], X2[k2], X2[k3], t2);
      const cw2 = WaterSimulation.evalCatmullRom(W2[k0], W2[k2Seg], W2[k2], W2[k3], t2);
      dStream2 = Math.abs(x - cx2) - cw2;
      if (z < -13.5) {
        const tFade = Math.max(0, Math.min(1, (-z - 13.5) / 2.5));
        dStream2 += tFade * tFade * 1.8;
      }
    }

    // 4. Smooth Union with C^2 Polynomial Minimum (Zero linear cuts or clamps)
    const smin = (v1: number, v2: number, k: number) => {
      const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (v2 - v1) / k));
      return (v2 * (1 - h) + v1 * h) - k * h * (1 - h);
    };

    let dWater = smin(dBasin, smin(dStream1, dStream2, 0.80), 0.85);
    return dWater;
  }

  public getPondFloorDepth(x: number, z: number): number {
    // 🌊 Expansive Flowing Winding Garden Waterway & Pond Basin (Catmull-Rom Spline)
    const dWater = this.getPondWaterDist(x, z);
    const baseDepth = 1.18 + 0.15 * Math.sin(x * 0.25 + 0.8) * Math.cos(z * 0.20 + 0.4);
    // Smooth transition from shore (0.15) to deep (-1.25)
    const t = Math.max(0, Math.min(1, (0.15 - dWater) / (0.15 - (-1.25))));
    const shoreSlope = t * t * (3 - 2 * t);
    const depth = 0.10 * (1 - shoreSlope) + baseDepth * shoreSlope;

    // Submerged stepping stones along the eastern Catmull-Rom watercourse
    const stoneDist1 = Math.hypot(x - 0.96, z - (-0.68));
    const stoneDist2 = Math.hypot(x - 1.28, z - (-1.26));
    const stoneDist3 = Math.hypot(x - 1.56, z - (-1.88));
    let stoneBump = 0;
    if (stoneDist1 < 0.35) stoneBump = Math.max(stoneBump, (0.35 - stoneDist1) * 0.32);
    if (stoneDist2 < 0.35) stoneBump = Math.max(stoneBump, (0.35 - stoneDist2) * 0.32);
    if (stoneDist3 < 0.35) stoneBump = Math.max(stoneBump, (0.35 - stoneDist3) * 0.32);

    return Math.max(0.08, Math.min(1.45, depth - stoneBump));
  }

  // 3D Green Sea Turtle (Chelonia mydas)
  private turtle = {
    x: 0.65,
    y: -0.62,
    z: 0.35,
    vx: -0.16,
    vy: 0,
    vz: -0.12,
    dirX: -0.80,
    dirY: 0,
    dirZ: -0.60,
    bank: 0,
    pitch: 0,
    flipperPhase: 0,
    speed: 0.22,
    strokeTimer: 0,
    wanderAngle: 2.4,
    scale: 0.95,
  };
  private turtlePosBuffer = new Float32Array(4); // x, y, z, scale
  private turtleDirBuffer = new Float32Array(4); // dirX, dirY, dirZ, flipperPhase
  private turtleColBuffer = new Float32Array(4); // bank, pitch, species, unused

  // Floating Marine Debris
  private debrisList: Array<{
    x: number;
    y: number;
    z: number;
    dirX: number;
    dirZ: number;
    size: number;
    type: number;
  }> = [];
  private debrisPosBuffer = new Float32Array(16);
  private debrisRotBuffer = new Float32Array(16);

  // Programs
  private pSpec!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pFFT!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pResolve!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pRipple!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pRipN!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pCaus!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pMain!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pBright!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pBlur!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pCopy!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pRaw!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pFinal!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pCausExtract!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pCausScatterBlur!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pFFTg!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pGSrc!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pGMul!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
  private pGOut!: { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };

  // Performance metrics
  private lastTime = 0;
  private tSim = 0;
  private frames = 0;
  private ftAvg = 16.6;

  constructor(canvas: HTMLCanvasElement, initialConfig: Partial<WaterConfig> = {}) {
    this.canvas = canvas;
    this.config = { ...DEFAULT_CONFIG, ...initialConfig };

    // Initialize procedural aquatic vegetation & lotus ecosystem
    this.proceduralEco = generateProceduralEcosystem(
      this.config.vegetationSeed ?? 42,
      this.config.vegetationDensity ?? 'natural',
      this.config.lotusFlowerBloomRate ?? 0.55,
      (x, z) => this.getPondWaterDist(x, z)
    );
    this.pondLilyObstacles = this.proceduralEco.obstacles;

    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      throw new Error('WebGL2 is not supported on this device/browser.');
    }
    this.gl = gl;

    this.extF32 = gl.getExtension('EXT_color_buffer_float');
    this.extF16 = gl.getExtension('EXT_color_buffer_half_float');
    this.extAniso = gl.getExtension('EXT_texture_filter_anisotropic') as EXT_texture_filter_anisotropic | null;

    if (!this.extF32 && !this.extF16) {
      throw new Error('Floating point textures not supported (EXT_color_buffer_float missing).');
    }
    this.FFT_FMT = this.extF32 ? gl.RGBA32F : gl.RGBA16F;
    this.GLARE_ON = !!this.extF32;

    this.initVAOs();
    this.initPrograms();
    this.h0Tex = this.buildH0(this.config.waveScale, this.config.windSpeed ?? 6.0);
    this.fftA = this.createRT(this.N, this.N, this.FFT_FMT, { filter: gl.NEAREST, wrap: gl.REPEAT });
    this.fftB = this.createRT(this.N, this.N, this.FFT_FMT, { filter: gl.NEAREST, wrap: gl.REPEAT });
    this.surfRT = this.createRT(this.N, this.N, gl.RGBA16F, { wrap: gl.REPEAT, mip: true, aniso: 8 });

    // Ripple RTs
    this.rip = [0, 1].map(() => this.createRT(this.RN, this.RN, gl.RGBA16F, { wrap: gl.CLAMP_TO_EDGE }));
    this.ripN = this.createRT(this.RN, this.RN, gl.RGBA16F, { wrap: gl.CLAMP_TO_EDGE });
    for (const r of [...this.rip, this.ripN]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, r.fb);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // Caustics RT
    this.causRT = this.createRT(this.C, this.C, gl.RGBA16F, { wrap: gl.REPEAT, mip: true, aniso: 8 });

    // Texture setup
    this.initPebbleTexture();

    // Initialize 3D fish school and floating debris
    this.initFish();
    this.initDebris();

    // Initial resize
    this.handleResize();

    // Start loop
    this.lastTime = performance.now();
    this.animId = requestAnimationFrame(this.renderLoop);
  }

  /* ---------------- Shaders & Program Helpers ---------------- */
  private compileShader(type: number, src: string, name: string): WebGLShader {
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      throw new Error(`Shader compilation error [${name}]: ${log}`);
    }
    return s;
  }

  private createProgram(vs: string, fs: string, name: string): { p: WebGLProgram; u: Record<string, WebGLUniformLocation> } {
    const gl = this.gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, this.compileShader(gl.VERTEX_SHADER, vs, name + '.vs'));
    gl.attachShader(p, this.compileShader(gl.FRAGMENT_SHADER, fs, name + '.fs'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Program link error [${name}]: ${gl.getProgramInfoLog(p)}`);
    }
    const u: Record<string, WebGLUniformLocation> = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i)!;
      const cleanName = info.name.replace(/\[0\]$/, '');
      const loc = gl.getUniformLocation(p, info.name);
      if (loc) u[cleanName] = loc;
    }
    return { p, u };
  }

  private createTexture(
    w: number,
    h: number,
    fmt: number,
    opts: { filter?: number; wrap?: number; mip?: boolean; aniso?: number } = {}
  ): WebGLTexture {
    const gl = this.gl;
    const filter = opts.filter ?? gl.LINEAR;
    const wrap = opts.wrap ?? gl.CLAMP_TO_EDGE;
    const mip = opts.mip ?? false;
    const aniso = opts.aniso ?? 0;

    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    const levels = mip ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
    gl.texStorage2D(gl.TEXTURE_2D, levels, fmt, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    if (aniso && this.extAniso) {
      const maxAniso = gl.getParameter(this.extAniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(this.gl.TEXTURE_2D, this.extAniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(aniso, maxAniso));
    }
    return t;
  }

  private createRT(
    w: number,
    h: number,
    fmt: number,
    opts?: { filter?: number; wrap?: number; mip?: boolean; aniso?: number }
  ): { t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } {
    const gl = this.gl;
    const t = this.createTexture(w, h, fmt, opts);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Incomplete framebuffer (${st}) ${w}x${h}`);
    }
    return { t, fb, w, h };
  }

  private bindT(unit: number, t: WebGLTexture | null) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
  }

  private setTarget(r: { fb: WebGLFramebuffer; w: number; h: number } | null) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, r ? r.fb : null);
    gl.viewport(0, 0, r ? r.w : this.canvas.width, r ? r.h : this.canvas.height);
  }

  private drawFullscreen() {
    const gl = this.gl;
    gl.bindVertexArray(this.triVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ---------------- Geometry & Initialization ---------------- */
  private initVAOs() {
    const gl = this.gl;
    // Fullscreen Triangle
    this.triVAO = gl.createVertexArray();
    gl.bindVertexArray(this.triVAO);
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Caustics Grid
    this.gridVAO = gl.createVertexArray();
    gl.bindVertexArray(this.gridVAO);
    const G = this.G;
    const v = new Float32Array((G + 1) * (G + 1) * 2);
    let o = 0;
    for (let j = 0; j <= G; j++) {
      for (let i = 0; i <= G; i++) {
        v[o++] = i / G;
        v[o++] = j / G;
      }
    }
    const idx = new Uint32Array(G * G * 6);
    o = 0;
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        const a = j * (G + 1) + i;
        const b = a + 1;
        const c = a + G + 1;
        const d = c + 1;
        idx[o++] = a;
        idx[o++] = b;
        idx[o++] = c;
        idx[o++] = b;
        idx[o++] = d;
        idx[o++] = c;
      }
    }
    const vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  private initPrograms() {
    const VS = `#version 300 es
layout(location=0) in vec2 p; out vec2 vUv;
void main(){ vUv = p*.5+.5; gl_Position = vec4(p,0.,1.); }`;

    const HEAD = `#version 300 es
precision highp float; precision highp sampler2D; precision highp int;
in vec2 vUv; out vec4 o;
`;

    // 1. Spectrum
    this.pSpec = this.createProgram(
      VS,
      HEAD +
        `
uniform sampler2D uH0; uniform float uT, uL, uFreqMult, uAmpMult;
vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x-a.y*b.y, a.x*b.y+a.y*b.x); }
void main(){
  ivec2 id = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(uH0, id, 0);
  vec2 n = vec2(id); n -= step(${this.N / 2}.0, n) * ${this.N}.0;
  vec2 k = 6.28318530718*n/uL; float kl = length(k);
  float w = sqrt(9.81*kl + 7.4e-5*kl*kl*kl) * uFreqMult;
  float w0 = 6.28318530718/60.0; w = floor(w/w0)*w0;
  float c = cos(w*uT), sn = sin(w*uT);
  vec2 H = (cmul(s.xy, vec2(c,sn)) + cmul(s.zw, vec2(c,-sn))) * uAmpMult;
  vec2 C1 = H - k.x*H;
  vec2 C2 = vec2(-k.y*H.y, k.y*H.x);
  o = vec4(C1, C2);
}`,
      'spectrum'
    );

    // 2. FFT
    this.pFFT = this.createProgram(
      VS,
      HEAD +
        `
uniform sampler2D uSrc; uniform int uP, uHoriz;
vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x-a.y*b.y, a.x*b.y+a.y*b.x); }
void main(){
  ivec2 id = ivec2(gl_FragCoord.xy);
  int j = uHoriz==1 ? id.x : id.y;
  int k = j & (uP-1);
  int i = ((j - (j & (2*uP-1))) >> 1) + k;
  bool y1 = (j & uP) != 0;
  ivec2 a = uHoriz==1 ? ivec2(i, id.y) : ivec2(id.x, i);
  ivec2 b = uHoriz==1 ? ivec2(i+${this.N / 2}, id.y) : ivec2(id.x, i+${this.N / 2});
  vec4 x0 = texelFetch(uSrc, a, 0), x1 = texelFetch(uSrc, b, 0);
  float ang = 3.14159265359*float(k)/float(uP);
  vec2 w = vec2(cos(ang), sin(ang));
  vec4 wx = vec4(cmul(w,x1.xy), cmul(w,x1.zw));
  o = y1 ? x0-wx : x0+wx;
}`,
      'fft'
    );

    // 3. Resolve
    this.pResolve = this.createProgram(
      VS,
      HEAD +
        `
uniform sampler2D uSrc; uniform float uChoppiness;
void main(){
  vec4 s = texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0);
  float h = s.x;
  vec2 sl = vec2(s.y, s.z);

  // Trochoidal / Stokes crest peaking & trough broadening based on choppiness
  // uChoppiness = 0.0: pure linear rolling swells (smooth sinusoidal profile)
  // uChoppiness = 1.0+: sharp peaked cusps and breaking wave crests
  float chop = clamp(uChoppiness, 0.0, 2.5);
  float hPeaked = h + chop * 0.35 * (h * abs(h) * 2.0);
  float hFinal = mix(h, hPeaked, clamp(chop * 0.65, 0.0, 1.0));

  // Slopes steepen sharply at the peaked wave crests as waves approach breaking
  float steepness = mix(0.85, 1.0 + chop * 0.55, smoothstep(-0.15, 0.45, hFinal));
  vec2 slFinal = sl * steepness;

  o = vec4(hFinal, slFinal, dot(slFinal, slFinal));
}`,
      'resolve'
    );

    // 4. Ripple
    this.pRipple = this.createProgram(
      VS,
      HEAD +
        `
uniform sampler2D uSrc; uniform vec2 uShift; uniform vec4 uDrop;
void main(){
  vec2 px = 1.0/vec2(textureSize(uSrc,0));
  vec2 uv = vUv + uShift;
  vec4 c = texture(uSrc, uv);
  float avg = 0.25*(texture(uSrc, uv+vec2(px.x,0)).r + texture(uSrc, uv-vec2(px.x,0)).r + texture(uSrc, uv+vec2(0,px.y)).r + texture(uSrc, uv-vec2(0,px.y)).r);
  float v = c.g + (avg - c.r)*0.9;
  v *= 0.9955;
  float h = c.r + v;
  h *= 0.9985;
  if (uDrop.w != 0.0){
    float d = length(vUv - uDrop.xy);
    float r = uDrop.z;
    if (d < r){
      float f = 0.5 + 0.5*cos(3.14159*d/r);
      h -= uDrop.w*f;
    }
  }
  vec2 e = min(vUv, 1.0-vUv);
  float edge = smoothstep(0.0, 0.06, min(e.x,e.y));
  h *= mix(0.9, 1.0, edge);
  v *= mix(0.9, 1.0, edge);
  if (uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.) { h=0.; v=0.; }
  o = vec4(h, v, 0, 1);
}`,
      'ripple'
    );

    // 5. Ripple Normals
    this.pRipN = this.createProgram(
      VS,
      HEAD +
        `
uniform sampler2D uSrc; uniform float uTexel;
void main(){
  vec2 px = 1.0/vec2(textureSize(uSrc,0));
  float hx = texture(uSrc, vUv+vec2(px.x,0)).r - texture(uSrc, vUv-vec2(px.x,0)).r;
  float hz = texture(uSrc, vUv+vec2(0,px.y)).r - texture(uSrc, vUv-vec2(0,px.y)).r;
  float h = texture(uSrc,vUv).r;
  float lap = (texture(uSrc, vUv+vec2(px.x,0)).r + texture(uSrc, vUv-vec2(px.x,0)).r + texture(uSrc, vUv+vec2(0,px.y)).r + texture(uSrc, vUv-vec2(0,px.y)).r - 4.0*h)/(uTexel*uTexel);
  o = vec4(h, hx/(2.0*uTexel), hz/(2.0*uTexel), lap);
}`,
      'rippleNormals'
    );

    // 6. Caustics
    this.pCaus = this.createProgram(
      `#version 300 es
precision highp float; precision highp sampler2D;
layout(location=0) in vec2 aUV;
uniform sampler2D uSurf; uniform float uL, uDepth, uIor; uniform vec3 uSun; uniform vec2 uShift;
out vec2 vSrc;
out float vWaveH;
out float vCurv;
void main(){
  ivec2 off = ivec2(gl_InstanceID % 3 - 1, gl_InstanceID / 3 - 1);
  vec4 s = textureLod(uSurf, aUV, 0.0);
  vec3 n = normalize(vec3(-s.y, 1.0, -s.z));
  vec3 r = refract(-uSun, n, 1.0/uIor);
  vec3 P = vec3(aUV.x*uL, s.x, aUV.y*uL);
  vec3 F = P + r*((-uDepth - s.x)/r.y);
  vSrc = aUV*uL;
  vWaveH = s.x;
  vCurv = s.w;
  vec2 c = (F.xz - uShift)/uL + vec2(off);
  gl_Position = vec4(c*2.0-1.0, 0.0, 1.0);
}`,
      `#version 300 es
precision highp float;
in vec2 vSrc;
in float vWaveH;
in float vCurv;
out vec4 o;
uniform float uNorm;
void main(){
  vec2 a = dFdx(vSrc), b = dFdy(vSrc);
  float area = abs(a.x*b.y - a.y*b.x);
  // Physically account for wave height optical concentration: wave crests act as convergent lenses
  float waveFocus = 1.0 + clamp(vWaveH * 2.5, -0.6, 2.8) + clamp(vCurv * 0.7, 0.0, 1.5);
  float I = min(area*uNorm * waveFocus, 48.0);
  o = vec4(I);
}`,
      'caustics'
    );

    // 7. Main Water Shader
    this.pMain = this.createProgram(
      VS,
      HEAD +
        `
uniform sampler2D uSurf, uCaus, uPeb, uRip;
uniform vec3 uCam, uR, uU, uF, uSun;
uniform vec3 uSunColor, uSigA, uSigS;
uniform float uTanF, uAspect, uL, uDepth, uTime, uRipSize, uChoppiness, uTurbidity;
uniform float uCausticsIntensity, uGodRayIntensity;
uniform float uFishPhaseDelay, uUnderwaterShadowIntensity, uUnderwaterShadowSoftness;
uniform vec2 uCausShift, uRipCenter;
uniform int uFishEnabled, uFishCount, uTurtleEnabled, uDebrisEnabled, uMarineSnowEnabled, uBubbleEnabled, uEnvironment, uPondBorderMode;
uniform float uGardenOpacity;
uniform int uGardenLowAngleTransparency;
uniform vec4 uFishPos[12];
uniform vec4 uFishDir[12];
uniform vec4 uFishCol[12];
uniform vec4 uTurtlePos;
uniform vec4 uTurtleDir;
uniform vec4 uTurtleCol;
uniform vec4 uDebrisPos[4];
uniform vec4 uDebrisRot[4];

// Procedural Aquatic Vegetation Uniforms
uniform int uLilyCount;
uniform vec4 uLilyData[16]; // xy = pad position, z = radius, w = cleft angle
uniform vec4 uLilyMeta[16]; // x = flower type, y = flower scale, zw = root anchor on pond floor
uniform int uPlantCount;
uniform vec4 uPlantData[12]; // xy = cluster position, z = type (0: Hornwort, 1: Vallisneria), w = radius

const float IOR = 1.3335;
const float PI = 3.14159265359;

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float hash13(vec3 p){
  vec3 p3 = fract(p * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
    u.z
  );
}

float ridge(float a){
  return 0.040 + 0.016*sin(a*2.0+0.7) + 0.011*sin(a*5.0+2.1) + 0.006*sin(a*11.0+0.3) + 0.003*sin(a*23.0+1.7);
}
float fbm2(vec2 p){ float v=0., a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p=p*2.03 + vec2(17.1); a*=0.5; } return v; }

vec3 sky(vec3 d){
  float e = d.y;
  float mu = dot(d, uSun);
  // Sky base colors adjust gracefully for lower sun (sunset/moonlit)
  float dayMix = clamp(uSun.y*1.8, 0.05, 1.0);
  vec3 zen = mix(vec3(0.02, 0.04, 0.12), vec3(0.11, 0.27, 0.62), dayMix);
  vec3 hor = mix(vec3(0.72, 0.40, 0.22), vec3(0.66, 0.78, 0.90), dayMix);
  vec3 c = mix(hor, zen, pow(clamp(e,0.,1.), 0.42));

  // Sun flare in sky
  vec3 flareCol = mix(vec3(1.2, 0.55, 0.2), normalize(uSunColor + 1e-4)*1.5, dayMix);
  c += flareCol * (0.22*pow(max(mu,0.),6.) + 0.30*pow(max(mu,0.),64.) + 1.6*pow(max(mu,0.),2400.));

  // Safe azimuthal angle: strictly prevents atan(0,0) NaN on vertical vectors
  float a = (abs(d.x) < 1e-5 && abs(d.z) < 1e-5) ? 0.0 : atan(d.z, d.x);

  if (uEnvironment == 0) {
    // 🌿 Authentic Kyoto Zen Garden Panorama & Reflection (Reference image.png):
    // 1. Serene Soft Daylight Atmosphere
    vec3 gardenSkyZen = mix(vec3(0.04, 0.10, 0.24), vec3(0.12, 0.28, 0.58), dayMix);
    vec3 gardenSkyHor = mix(vec3(0.55, 0.45, 0.32), vec3(0.72, 0.78, 0.84), dayMix);
    vec3 col = mix(gardenSkyHor, gardenSkyZen, pow(clamp(e, 0.0, 1.0), 0.45));

    // Sun flare & golden Komorebi morning rays
    vec3 flareCol = mix(vec3(1.2, 0.55, 0.2), normalize(uSunColor + 1e-4) * 1.5, dayMix);
    col += flareCol * (0.22 * pow(max(mu, 0.0), 6.0) + 0.35 * pow(max(mu, 0.0), 64.0) + 1.8 * pow(max(mu, 0.0), 2400.0));

    // 2. Distant Soft Mountain Ridgeline (Kyoto Higashiyama)
    float rMtn = 0.075 + 0.030 * sin(a * 2.0 + 0.6) + 0.018 * cos(a * 5.0 + 1.2);
    if (e < rMtn + 0.02 && e > -0.05) {
      float mtnGrad = smoothstep(rMtn + 0.015, rMtn - 0.005, e);
      vec3 mtnCol = mix(vec3(0.08, 0.16, 0.10), vec3(0.14, 0.24, 0.14), fbm2(vec2(a * 120.0, e * 120.0))) * dayMix;
      mtnCol = mix(mtnCol, gardenSkyHor, 0.45);
      col = mix(col, mtnCol, mtnGrad);
    }

    // 3. Volumetric Sculpted Garden Trees & Cloud Pines (구름송이 전정 수목 & 소나무)
    // 8 distinct 3D organic foliage lobes encircling the garden perimeter
    float treeBackdrop = 0.0;
    vec3 treeColorAcc = vec3(0.0);

    for (int ti = 0; ti < 8; ti++) {
      float tAng = -2.9 + float(ti) * 0.75 + sin(float(ti) * 1.7) * 0.15;
      float tElev = 0.14 + 0.08 * sin(float(ti) * 2.3 + 1.2);
      float tRad = 0.38 + 0.10 * cos(float(ti) * 3.1);

      float dAng = a - tAng;
      float dElev = (e - tElev) * 1.5;
      float distLobe = length(vec2(dAng, dElev)) / tRad;

      if (distLobe < 1.15) {
        float leafNoise = vnoise(vec3(a * 45.0, e * 45.0, float(ti) * 2.3));
        float leafNoise2 = vnoise(vec3(a * 95.0, e * 95.0, float(ti) * 4.7));
        float roughDist = distLobe + 0.16 * (leafNoise - 0.5) + 0.08 * (leafNoise2 - 0.5);

        if (roughDist < 1.0) {
          float lobeAlpha = smoothstep(1.0, 0.75, roughDist);
          // Normal of the 3D foliage puff
          vec3 nPuff = normalize(vec3(dAng, dElev, 0.65 * sqrt(max(0.0, 1.0 - distLobe * distLobe))));
          float pNdotL = max(dot(nPuff, uSun), 0.0);

          vec3 mossDeep = vec3(0.035, 0.095, 0.040);
          vec3 emeraldLush = vec3(0.085, 0.220, 0.075);
          vec3 chartreuseTip = vec3(0.240, 0.340, 0.085);
          vec3 lobeCol = mix(mossDeep, emeraldLush, leafNoise);
          lobeCol = mix(lobeCol, chartreuseTip, smoothstep(0.45, 0.90, pNdotL * leafNoise2));

          // Komorebi sunlit highlight on foliage crowns
          lobeCol += uSunColor * 0.30 * pow(max(dot(nPuff, uSun), 0.0), 3.0);

          treeColorAcc = mix(treeColorAcc, lobeCol * dayMix, lobeAlpha * (1.0 - treeBackdrop));
          treeBackdrop = max(treeBackdrop, lobeAlpha);
        }
      }
    }
    col = mix(col, treeColorAcc, treeBackdrop);

    // 4. Volumetric Brilliant Japanese Red Autumn Maple (단풍나무 / Momiji - image.png 참조)
    // 5 multi-tier spreading foliage lobes arching gracefully over the upper right
    float mapleAcc = 0.0;
    vec3 mapleColorAcc = vec3(0.0);

    for (int mi = 0; mi < 5; mi++) {
      float mAng = -1.35 + float(mi) * 0.26;
      float mElev = 0.28 + 0.12 * sin(float(mi) * 1.4 + 0.6);
      float mRad = 0.32 + 0.08 * cos(float(mi) * 2.1);

      float dAngM = a - mAng;
      float dElevM = (e - mElev) * 1.4;
      float distM = length(vec2(dAngM, dElevM)) / mRad;

      if (distM < 1.18) {
        float mNoise1 = vnoise(vec3(a * 48.0, e * 52.0, float(mi) * 3.7));
        float mNoise2 = vnoise(vec3(a * 115.0, e * 120.0, float(mi) * 5.3));
        float roughM = distM + 0.18 * (mNoise1 - 0.5) + 0.09 * (mNoise2 - 0.5);

        if (roughM < 1.0) {
          float mAlpha = smoothstep(1.0, 0.70, roughM);
          vec3 nMaple = normalize(vec3(dAngM, dElevM, 0.60 * sqrt(max(0.0, 1.0 - distM * distM))));
          float mNdotL = max(dot(nMaple, uSun), 0.0);

          // Vivid multi-hue scarlet, crimson, and golden-orange red maple foliage
          vec3 crimsonBase = vec3(0.65, 0.04, 0.06);
          vec3 vermilionMid = vec3(0.92, 0.12, 0.05);
          vec3 scarletSunlit = vec3(0.98, 0.28, 0.06);
          vec3 orangeGold = vec3(1.0, 0.55, 0.08);

          vec3 mCol = mix(crimsonBase, vermilionMid, mNoise1);
          mCol = mix(mCol, scarletSunlit, smoothstep(0.35, 0.85, mNdotL));
          mCol = mix(mCol, orangeGold, smoothstep(0.65, 0.95, mNoise2 * mNdotL));

          // Translucent leaf forward scattering (Komorebi sunlight shining through maple leaves)
          float sssLeaf = pow(max(dot(d, uSun), 0.0), 3.5);
          mCol += vec3(1.0, 0.70, 0.20) * sssLeaf * 0.75;

          // Twig and branch shadows in crevices
          mCol *= (0.72 + 0.48 * mNoise2);

          mapleColorAcc = mix(mapleColorAcc, mCol, mAlpha * (1.0 - mapleAcc));
          mapleAcc = max(mapleAcc, mAlpha);
        }
      }
    }
    col = mix(col, mapleColorAcc, mapleAcc * 0.98);

    // 5. Traditional Japanese Wooden Pavilion / Gazebo (목조 정자 / 아즈마야 / 四阿 - image.png 참조)
    // Standing across the pond on the northwest bank (a in [-2.40, -1.75])
    float pavCenterA = -2.08;
    float pavSpanA = 0.30;
    float dPavA = abs(a - pavCenterA);
    if (dPavA < pavSpanA) {
      float pNormA = dPavA / pavSpanA;

      // Authentic Sweeping Curved Pagoda Roof with flared eaves (처마 곡선)
      float roofCurve = 0.35 - 0.16 * pow(pNormA, 1.45) + 0.015 * sin(pNormA * PI);
      float roofEaves = 0.165;
      float roofFinial = 0.41;

      // Jewel Finial (보주 / 宝珠)
      if (pNormA < 0.07 && e >= 0.35 && e <= roofFinial) {
        vec3 finialCol = vec3(0.26, 0.26, 0.25) * (uSun.y * 0.8 + 0.2);
        col = mix(col, finialCol, smoothstep(0.07, 0.03, pNormA));
      }
      // Flared Pagoda Tile Roof with weathered dark shingles
      else if (e <= roofCurve && e >= roofEaves) {
        float roofMask = smoothstep(roofCurve, roofCurve - 0.012, e);
        float shingleRow = sin(e * 190.0) * 0.5 + 0.5;
        float ridgeLine = sin(pNormA * 30.0) * 0.5 + 0.5;
        vec3 roofTile = mix(vec3(0.16, 0.17, 0.18), vec3(0.24, 0.25, 0.26), shingleRow * 0.6 + ridgeLine * 0.4);
        roofTile *= (0.80 + 0.40 * max(mu, 0.0));
        col = mix(col, roofTile, roofMask);
      }
      // Round Wooden Pillars with cylindrical lighting, Deck & Balustrade
      else if (e < roofEaves && e >= 0.035) {
        float post1 = smoothstep(0.032, 0.012, abs(pNormA - 0.70));
        float post2 = smoothstep(0.032, 0.012, abs(pNormA - 0.26));
        float isPost = max(post1, post2);

        // Cylindrical post normal lighting
        float postCenter = (pNormA > 0.5) ? 0.70 : 0.26;
        float postLocalX = (pNormA - postCenter) / 0.032;
        float postNormZ = sqrt(max(0.0, 1.0 - postLocalX * postLocalX));
        vec3 postN = normalize(vec3(postLocalX, 0.0, postNormZ));
        float postLight = max(dot(postN, uSun), 0.15);

        vec3 woodCedar = vec3(0.36, 0.22, 0.13) * (0.80 + 0.35 * postLight);
        vec3 interiorShadow = vec3(0.07, 0.06, 0.05);
        vec3 woodenBench = mix(woodCedar * 0.85, vec3(0.42, 0.26, 0.16), smoothstep(0.06, 0.08, e));

        vec3 pavBody = mix(interiorShadow, woodCedar, isPost);
        if (e < 0.08) pavBody = mix(woodenBench, woodCedar, isPost);
        col = mix(col, pavBody, smoothstep(roofEaves, roofEaves - 0.01, e));
      }
      // Rugged Stone Foundation & Cascading Waterfall into pond
      else if (e < 0.035 && e >= -0.04) {
        float stoneMask = smoothstep(0.035, 0.015, e);
        vec3 baseStone = vec3(0.22, 0.23, 0.24) * (0.8 + 0.4 * vnoise(vec2(a * 45.0, e * 45.0)));
        // Water cascade spillway in the middle of stone base
        if (pNormA < 0.24) {
          float waterFall = sin(a * 140.0 + uTime * 16.0) * 0.5 + 0.5;
          baseStone = mix(baseStone, vec3(0.88, 0.94, 0.98), waterFall * 0.82);
        }
        col = mix(col, baseStone, stoneMask);
      }
    }

    return col;
  }

  // Distant headlands for River / Ocean
  float r = ridge(a) + 0.0045*(vnoise(vec2(a*260.0, 0.0))-0.5) + 0.002*(vnoise(vec2(a*900.0, 3.0))-0.5);
  float back = smoothstep(-0.3, 0.95, dot(normalize(vec2(d.x,d.z)+1e-5), normalize(vec2(uSun.x,uSun.z))));
  float u = clamp(e / max(r, 1e-3), 0.0, 1.0);
  vec2 q = vec2(a*420.0, e*420.0);
  float tex = fbm2(q);
  vec3 pine = vec3(0.045, 0.070, 0.042) * (0.6 + 0.8*tex) * dayMix;
  vec3 rock = vec3(0.30, 0.28, 0.23) * (0.55 + 0.7*fbm2(q*1.7 + vec2(5.0))) * dayMix;
  float cliff = smoothstep(0.42, 0.18, u + 0.25*(tex-0.5)) * smoothstep(0.35, 0.75, vnoise(vec2(a*18.0, 1.0)));
  vec3 land = mix(pine, rock, cliff);
  land *= mix(1.0, 0.45, back);
  land = mix(land, hor*0.92, 0.38 + 0.25*back);
  float w = fwidth(e)*1.2 + 2e-4;
  c = mix(c, land, smoothstep(r+w, r-w, e) * step(-0.3, e));
  return c;
}

vec4 texBS(sampler2D t, vec2 uv){
  vec2 ts = vec2(textureSize(t,0)); vec2 p = uv*ts - 0.5; vec2 f = fract(p); p = floor(p);
  vec2 f2 = f*f, f3 = f2*f;
  vec2 w0 = (-f3 + 3.0*f2 - 3.0*f + 1.0)/6.0, w1 = (3.0*f3 - 6.0*f2 + 4.0)/6.0;
  vec2 w2 = (-3.0*f3 + 3.0*f2 + 3.0*f + 1.0)/6.0, w3 = f3/6.0;
  vec2 g0 = w0+w1, g1 = w2+w3; vec2 h0 = (w1/g0 - 0.5 + p)/ts, h1 = (w3/g1 + 1.5 + p)/ts;
  return (texture(t, vec2(h0.x,h0.y))*g0.x + texture(t, vec2(h1.x,h0.y))*g1.x)*g0.y
       + (texture(t, vec2(h0.x,h1.y))*g0.x + texture(t, vec2(h1.x,h1.y))*g1.x)*g1.y;
}

// ---------------- Smooth Catmull-Rom Spline Pond Boundary & Yarimizu Streams ----------------
float catmullRom(float p0, float p1, float p2, float p3, float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return 0.5 * (
    (2.0 * p1) +
    (-p0 + p2) * t +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
  );
}

float sminPoly(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float getCatmullPondRadius(float a) {
  float TAU = 6.28318530718;
  float normA = mod(a, TAU);
  if (normA < 0.0) normA += TAU;
  float u = normA * (16.0 / TAU);
  int idx = int(floor(u));
  float t = fract(u);

  // 16 hand-crafted control radii correctly oriented (South=Index 4, North=Index 12)
  float R[16];
  R[0]  = 4.50; R[1]  = 4.00; R[2]  = 3.55; R[3]  = 3.15;
  R[4]  = 2.90; R[5]  = 3.15; R[6]  = 3.55; R[7]  = 4.10;
  R[8]  = 4.55; R[9]  = 5.20; R[10] = 5.80; R[11] = 6.40;
  R[12] = 6.80; R[13] = 6.40; R[14] = 5.60; R[15] = 4.90;

  int i0 = (idx + 15) % 16;
  int i1 = idx % 16;
  int i2 = (idx + 1) % 16;
  int i3 = (idx + 2) % 16;

  return catmullRom(R[i0], R[i1], R[i2], R[i3], t);
}

float getPondWaterDist(vec2 p) {
  vec2 d = p - vec2(0.0, -2.6);
  float a = atan(d.y, d.x);
  float rPond = getCatmullPondRadius(a);
  float dBasin = length(d) - rPond;

  // Stream 1 (North-East Winding Yarimizu): Catmull-Rom spline stream centerline & width
  float dStream1 = 99.0;
  if (p.y <= -3.0 && p.y >= -16.5) {
    float u1 = (-p.y - 3.5) / 2.5;
    int k1 = clamp(int(floor(u1)), 0, 4);
    float t1 = clamp(fract(u1), 0.0, 1.0);
    float X1[6]; float W1[6];
    X1[0] = 1.85; X1[1] = 2.45; X1[2] = 2.95; X1[3] = 2.50; X1[4] = 3.10; X1[5] = 3.40;
    W1[0] = 1.45; W1[1] = 1.25; W1[2] = 1.10; W1[3] = 0.95; W1[4] = 0.85; W1[5] = 0.75;
    int k0 = max(0, k1 - 1); int k2 = min(5, k1 + 1); int k3 = min(5, k1 + 2);
    float cx1 = catmullRom(X1[k0], X1[k1], X1[k2], X1[k3], t1);
    float cw1 = catmullRom(W1[k0], W1[k1], W1[k2], W1[k3], t1);
    dStream1 = abs(p.x - cx1) - cw1;
    if (p.y < -13.5) {
      float tFade = clamp((-p.y - 13.5) / 2.5, 0.0, 1.0);
      dStream1 += tFade * tFade * 1.8;
    }
  }

  // Stream 2 (North-West Outlet Yarimizu): Catmull-Rom spline stream centerline & width
  float dStream2 = 99.0;
  if (p.y <= -3.0 && p.y >= -16.5) {
    float u2 = (-p.y - 3.5) / 2.5;
    int k2Seg = clamp(int(floor(u2)), 0, 4);
    float t2 = clamp(fract(u2), 0.0, 1.0);
    float X2[6]; float W2[6];
    X2[0] = -1.70; X2[1] = -2.40; X2[2] = -2.85; X2[3] = -2.35; X2[4] = -2.75; X2[5] = -2.95;
    W2[0] =  1.35; W2[1] =  1.15; W2[2] =  1.05; W2[3] =  0.90; W2[4] =  0.80; W2[5] =  0.70;
    int k0 = max(0, k2Seg - 1); int k2 = min(5, k2Seg + 1); int k3 = min(5, k2Seg + 2);
    float cx2 = catmullRom(X2[k0], X2[k2Seg], X2[k2], X2[k3], t2);
    float cw2 = catmullRom(W2[k0], W2[k2Seg], W2[k2], W2[k3], t2);
    dStream2 = abs(p.x - cx2) - cw2;
    if (p.y < -13.5) {
      float tFade = clamp((-p.y - 13.5) / 2.5, 0.0, 1.0);
      dStream2 += tFade * tFade * 1.8;
    }
  }

  float dWater = sminPoly(dBasin, sminPoly(dStream1, dStream2, 0.80), 0.85);
  return dWater;
}

float floorDepth(vec2 xz){
  if (uEnvironment == 0) {
    float dWater = getPondWaterDist(xz);
    float baseDepth = 1.18 + 0.15 * sin(xz.x * 0.25 + 0.8) * cos(xz.y * 0.20 + 0.4);
    float shoreSlope = smoothstep(0.15, -1.25, dWater);
    float depth = mix(0.10, baseDepth, shoreSlope);
    float pebbleBump = 0.035 * (vnoise(xz * 2.5) - 0.5);
    return clamp(depth + pebbleBump, 0.08, 1.45);
  }
  float shelf = 0.95 + 0.17*clamp(-xz.y + 1.5, 0.0, 14.0);
  return shelf + 0.30*(vnoise(xz*0.22)-0.5) + 0.10*(vnoise(xz*0.9 + vec2(7.0))-0.5);
}

vec3 pebbles(vec2 x, float sc, out float hgt){
  vec2 uv = x / (vec2(0.78, 0.78)*sc);
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  float k = vnoise(x*0.85);
  float l = k*8.0; float ia = floor(l), f = fract(l);
  vec2 oa = sin(vec2(3.0,7.0)*ia), ob = sin(vec2(3.0,7.0)*(ia+1.0));
  vec3 a = textureGrad(uPeb, uv+oa, dx, dy).rgb, b = textureGrad(uPeb, uv+ob, dx, dy).rgb;
  float s = dot(a-b, vec3(1));
  float m = smoothstep(0.2, 0.8, f - 0.1*s);
  vec3 ca = textureGrad(uPeb, uv+oa, dx*6.0, dy*6.0).rgb, cb = textureGrad(uPeb, uv+ob, dx*6.0, dy*6.0).rgb;
  hgt = dot(mix(ca,cb,m), vec3(0.3,0.55,0.15));
  return mix(a, b, m);
}

float fresnel(float ci, float n){
  ci = clamp(ci, 0.0, 1.0);
  float st2 = (1.0-ci*ci)/(n*n); if (st2 >= 1.0) return 1.0;
  float ct = sqrt(1.0-st2);
  float rs = (ci - n*ct)/(ci + n*ct), rp = (n*ci - ct)/(n*ci + ct);
  return 0.5*(rs*rs + rp*rp);
}

struct FishHit {
  float t;
  vec3 n;
  vec3 col;
  float spec;
  float roughness;
  float sssAmount;
  vec3 sssCol;
  float irid;
  float thickness;
  vec3 specCol;
};

// ============================================================================
// Spline-Interpolated Body Curve Algorithm (Catmull-Rom Cubic Spine Undulation)
// 1. Gentle traveling S-curve wave with opposing curvature lobes (anterior vs posterior)
// 2. Continuous turning body curvature arching whole trunk into steering arc
// 3. Exact C^1 continuous Catmull-Rom cubic spline evaluation & analytical normal derivative
// ============================================================================
float getFishSpineOffset(float z, float rz, float scale, float tailWave, float tailActivity, float bank, out float dw_dz) {
  float zN = z / rz;
  if (zN >= 0.88) {
    dw_dz = 0.0;
    return 0.0;
  }
  float s = (0.88 - zN) / 1.65;
  float ds_dz = -1.0 / (1.65 * rz);

  // 7 Anatomical Spine Knots:
  // s0 = 0.00: Rostrum / Snout tip (rigid anchor)
  // s1 = 0.22: Cranial hinge (subtle stabilization)
  // s2 = 0.50: Anterior trunk / Pectoral girdle (first S-curve crest)
  // s3 = 0.78: Mid-trunk / Center of mass (dynamic S-curve inflection node)
  // s4 = 1.05: Posterior trunk / Ventral keel (opposing S-curve crest)
  // s5 = 1.30: Caudal peduncle / Tail base (propulsion flex)
  // s6 = 1.60: Caudal fin trailing margin (maximum wave flutter)
  const float s1 = 0.22;
  const float s2 = 0.50;
  const float s3 = 0.78;
  const float s4 = 1.05;
  const float s5 = 1.30;
  const float s6 = 1.60;

  float maxAmp = 0.076 * scale * (0.35 + 0.65 * tailActivity);
  float turnScale = -bank * 0.22 * scale;
  // Authentic sub-carangiform wave: ~0.55 body length per wave, creating a majestic flowing S-curve
  float kWave = (uEnvironment == 0) ? 2.5 : (uEnvironment == 1 ? 2.9 : 2.7);
  float knotPhaseDelay = 0.42 * uFishPhaseDelay;

  // Knot 0: Snout tip (s = 0.00)
  float p0 = 0.0;

  // Knot 1: Cranial hinge (s = 0.22)
  float phi1 = tailWave - s1 * kWave - 0.06 * knotPhaseDelay;
  float turn1 = turnScale * smoothstep(0.10, 0.40, s1) * (0.40 * s1 + 0.60 * s1 * s1);
  float p1 = sin(phi1) * (maxAmp * 0.06) + turn1;

  // Knot 2: Anterior trunk (s = 0.50)
  float phi2 = tailWave - s2 * kWave - 0.35 * knotPhaseDelay;
  float turn2 = turnScale * smoothstep(0.10, 0.40, s2) * (0.40 * s2 + 0.60 * s2 * s2);
  float p2 = sin(phi2) * (maxAmp * 0.35) + turn2;

  // Knot 3: Mid-trunk inflection node (s = 0.78)
  float phi3 = tailWave - s3 * kWave - 0.70 * knotPhaseDelay;
  float turn3 = turnScale * smoothstep(0.10, 0.40, s3) * (0.40 * s3 + 0.60 * s3 * s3);
  float p3 = sin(phi3) * (maxAmp * 0.70) + turn3;

  // Knot 4: Posterior trunk opposing crest (s = 1.05)
  float phi4 = tailWave - s4 * kWave - 1.05 * knotPhaseDelay;
  float turn4 = turnScale * smoothstep(0.10, 0.40, s4) * (0.40 * s4 + 0.60 * s4 * s4);
  float p4 = sin(phi4) * (maxAmp * 1.05) + turn4;

  // Knot 5: Caudal peduncle (s = 1.30)
  float phi5 = tailWave - s5 * kWave - 1.35 * knotPhaseDelay;
  float turn5 = turnScale * smoothstep(0.10, 0.40, s5) * (0.40 * s5 + 0.60 * s5 * s5);
  float p5 = sin(phi5) * (maxAmp * 1.35) + turn5;

  // Knot 6: Caudal fin trailing margin (s = 1.60)
  float phi6 = tailWave - s6 * kWave - 1.60 * knotPhaseDelay;
  float turn6 = turnScale * smoothstep(0.10, 0.40, s6) * (0.40 * s6 + 0.60 * s6 * s6);
  float p6 = sin(phi6) * (maxAmp * 1.60) + turn6;

  // Determine Catmull-Rom cubic spline segment
  float k0, k1, k2, k3;
  float segStart, segSpan;

  if (s < s1) {
    k0 = p0 - (p1 - p0);
    k1 = p0;
    k2 = p1;
    k3 = p2;
    segStart = 0.0;
    segSpan = s1;
  } else if (s < s2) {
    k0 = p0;
    k1 = p1;
    k2 = p2;
    k3 = p3;
    segStart = s1;
    segSpan = s2 - s1;
  } else if (s < s3) {
    k0 = p1;
    k1 = p2;
    k2 = p3;
    k3 = p4;
    segStart = s2;
    segSpan = s3 - s2;
  } else if (s < s4) {
    k0 = p2;
    k1 = p3;
    k2 = p4;
    k3 = p5;
    segStart = s3;
    segSpan = s4 - s3;
  } else if (s < s5) {
    k0 = p3;
    k1 = p4;
    k2 = p5;
    k3 = p6;
    segStart = s4;
    segSpan = s5 - s4;
  } else {
    k0 = p4;
    k1 = p5;
    k2 = p6;
    k3 = p6 + (p6 - p5);
    segStart = s5;
    segSpan = s6 - s5;
  }

  float t = clamp((s - segStart) / segSpan, 0.0, 1.0);
  float t2 = t * t;
  float t3 = t2 * t;

  float c0 = -0.5 * t3 + t2 - 0.5 * t;
  float c1 =  1.5 * t3 - 2.5 * t2 + 1.0;
  float c2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
  float c3 =  0.5 * t3 - 0.5 * t2;

  float w = c0 * k0 + c1 * k1 + c2 * k2 + c3 * k3;

  float d0 = (-1.5 * t2 + 2.0 * t - 0.5) / segSpan;
  float d1 = ( 4.5 * t2 - 5.0 * t) / segSpan;
  float d2 = (-4.5 * t2 + 4.0 * t + 0.5) / segSpan;
  float d3 = ( 1.5 * t2 - 1.0 * t) / segSpan;

  float dw_ds = d0 * k0 + d1 * k1 + d2 * k2 + d3 * k3;
  dw_dz = dw_ds * ds_dz;

  return w;
}

// 1. Procedural Non-Linear Silk-Billowing Deformation for Caudal Fin
// Seamlessly anchored to caudal peduncle with continuous traveling fluid wave (몸통 미병부와 완벽히 일체화된 실크 파동)
float getCaudalFinDeform(float y, float z, float rz, float scale, float tailWave, float tailActivity, float bank, int species, out float dw_dy, out float dw_dz) {
  float dw_dz_spine;
  float spineX = getFishSpineOffset(z, rz, scale, tailWave, tailActivity, bank, dw_dz_spine);

  // Deep structural overlap starting within the caudal peduncle (미병부 내부 깊숙이부터 시작)
  float uTail = clamp((-0.76 * rz - z) / (0.92 * rz), 0.0, 1.0);
  float d_u_dz = -1.0 / (0.92 * rz);

  // Synchronized continuous fluid wave flowing seamlessly from the body spine wave
  float phaseDelayTail = 0.38 * uFishPhaseDelay;
  float chordPhase = tailWave - uTail * 2.85 - phaseDelayTail;

  // Root blend envelope strictly clamps wave displacement to 0 at the peduncle base junction
  // guarantees 100% mathematical and physical continuity with the body peduncle (몸통과의 결합부 분리 방지)
  float rootBlend = smoothstep(0.01, 0.24, uTail);

  // Supple traveling ripple harmonics along fin rays (부드럽게 찰랑거리는 유체 파동)
  float uTailEnv = pow(uTail, 1.25) * rootBlend;
  float flutterAmp = (species == 5 ? 0.068 : 0.052) * scale * uTailEnv * (0.42 + 0.58 * tailActivity);
  float rippleWave = sin(chordPhase) + 0.28 * sin(chordPhase * 2.0 - 0.35) + 0.12 * sin(chordPhase * 3.0);
  float chordWave = flutterAmp * rippleWave;

  float d_uTailEnv_dz = (1.25 * pow(max(uTail, 0.01), 0.25) * rootBlend + pow(uTail, 1.25) * (uTail > 0.01 && uTail < 0.24 ? 1.0 / 0.23 : 0.0)) * d_u_dz;
  float d_ripple_dz = (cos(chordPhase) * (-2.85 * d_u_dz) + 0.56 * cos(chordPhase * 2.0 - 0.35) * (-2.85 * d_u_dz) + 0.36 * cos(chordPhase * 3.0) * (-2.85 * d_u_dz));
  float d_chord_dz = (d_uTailEnv_dz * (species == 5 ? 0.068 : 0.052) * scale * (0.42 + 0.58 * tailActivity)) * rippleWave + flutterAmp * d_ripple_dz;

  // Spanwise out-of-phase billowing: upper and lower lobes undulate with soft fluid delay
  float spanDist = abs(y) / max(0.12 * scale, 0.01);
  float spanSign = (y >= 0.0) ? 1.0 : -1.0;
  float spanPhase = chordPhase + spanSign * spanDist * 1.15;
  float spanAmp = (species == 5 ? 0.038 : 0.028) * scale * pow(uTail, 1.15) * rootBlend * spanDist * (0.40 + 0.60 * tailActivity);
  float spanWave = spanAmp * (sin(spanPhase) + 0.22 * sin(spanPhase * 2.0));

  float d_span_dy = spanSign / max(0.12 * scale, 0.01);
  dw_dy = spanAmp * (d_span_dy * sin(spanPhase) + spanDist * cos(spanPhase) * (spanSign * d_span_dy * 1.15));
  dw_dz = dw_dz_spine + d_chord_dz + spanAmp * cos(spanPhase) * (-2.85 * d_u_dz);

  return spineX + chordWave + spanWave;
}

// 2. Procedural Supple Traveling Ripple for Dorsal Fin
float getDorsalFinDeform(float y, float z, float rz, float scale, float tailWave, float tailActivity, float bank, int species, out float dw_dy, out float dw_dz) {
  float dw_dz_spine;
  float spineX = getFishSpineOffset(z, rz, scale, tailWave, tailActivity, bank, dw_dz_spine);

  float dZStart = (species == 4) ? -0.55 * rz : -0.38 * rz;
  float dZEnd = (species == 4) ? 0.35 * rz : 0.22 * rz;
  float uDor = clamp((z - dZStart) / (dZEnd - dZStart), 0.0, 1.0);
  float d_u_dz = 1.0 / (dZEnd - dZStart);

  float phaseDelayDor = 0.42 * uFishPhaseDelay;
  float dorPhase = tailWave * 0.92 - uDor * 2.6 - phaseDelayDor;

  float dorAmp = (species == 4 ? 0.045 : (species == 5 ? 0.038 : 0.028)) * scale * pow(uDor, 1.15) * (0.42 + 0.58 * tailActivity);
  float w = dorAmp * (sin(dorPhase) + 0.25 * sin(dorPhase * 2.0 - 0.3));
  dw_dz = dw_dz_spine + dorAmp * (cos(dorPhase) * (-2.6 * d_u_dz) + 0.50 * cos(dorPhase * 2.0 - 0.3) * (-2.6 * d_u_dz));
  dw_dy = 0.0;
  return spineX + w;
}

// 3. Procedural Supple Traveling Ripple for Anal Fin
float getAnalFinDeform(float y, float z, float rz, float scale, float tailWave, float tailActivity, float bank, out float dw_dy, out float dw_dz) {
  float dw_dz_spine;
  float spineX = getFishSpineOffset(z, rz, scale, tailWave, tailActivity, bank, dw_dz_spine);

  float uAnal = clamp((z + 0.75 * rz) / (0.48 * rz), 0.0, 1.0);
  float d_u_dz = 1.0 / (0.48 * rz);

  float phaseDelayAnal = 0.45 * uFishPhaseDelay;
  float analPhase = tailWave * 0.90 - uAnal * 2.5 - phaseDelayAnal;

  float analAmp = 0.026 * scale * pow(uAnal, 1.15) * (0.42 + 0.58 * tailActivity);
  float w = analAmp * (sin(analPhase) + 0.25 * sin(analPhase * 2.0 - 0.3));
  dw_dz = dw_dz_spine + analAmp * (cos(analPhase) * (-2.5 * d_u_dz) + 0.50 * cos(analPhase * 2.0 - 0.3) * (-2.5 * d_u_dz));
  dw_dy = 0.0;
  return spineX + w;
}

// 4. Procedural Flexible Radial & Spanwise Silk Billowing for Pectoral Fin (자연스러운 실크 찰랑거림)
float getPecFinDeform(float rP, float theta, float lenPec, float scale, float tailWave, float tailActivity, out float d_disp_dr) {
  float rNorm = clamp(rP / lenPec, 0.0, 1.0);
  float phaseDelayPec = 0.55 * uFishPhaseDelay;
  float pecPhase = tailWave * 0.88 - phaseDelayPec - rNorm * 2.8 + theta * 0.65;

  float pecAmp = 0.046 * scale * pow(rNorm, 1.20) * (0.45 + 0.55 * tailActivity);
  float disp = pecAmp * (sin(pecPhase) + 0.26 * sin(pecPhase * 2.0 - 0.4));
  float d_rNorm_dr = 1.0 / lenPec;
  d_disp_dr = (1.20 * pecAmp / max(rNorm, 0.05) * d_rNorm_dr) * (sin(pecPhase) + 0.26 * sin(pecPhase * 2.0 - 0.4))
            + pecAmp * (cos(pecPhase) * (-2.8 * d_rNorm_dr) + 0.52 * cos(pecPhase * 2.0 - 0.4) * (-2.8 * d_rNorm_dr));
  return disp;
}

FishHit intersectFish(vec3 ro, vec3 rd, vec4 fPos, vec4 fDir, vec4 fCol) {
  FishHit h;
  h.t = 1e9;
  h.n = vec3(0.0, 1.0, 0.0);
  h.col = vec3(0.0);
  h.spec = 0.5;
  h.roughness = 0.28;
  h.sssAmount = 0.5;
  h.sssCol = vec3(0.92, 0.42, 0.22);
  h.irid = 0.0;
  h.thickness = 0.12 * max(fPos.w, 0.2);
  h.specCol = vec3(1.0);

  vec3 center = fPos.xyz;
  float scale = max(fPos.w, 0.2);
  vec3 fwd = normalize(fDir.xyz);
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(fwd, up));
  up = cross(right, fwd);

  // Inward bank roll on turns
  float bank = fCol.w;
  float cb = cos(bank), sb = sin(bank);
  vec3 rightBanked = right * cb + up * sb;
  vec3 upBanked = -right * sb + up * cb;

  vec3 ro_rel = ro - center;
  vec3 lro = vec3(dot(ro_rel, rightBanked), dot(ro_rel, upBanked), dot(ro_rel, fwd));
  vec3 lrd = vec3(dot(rd, rightBanked), dot(rd, upBanked), dot(rd, fwd));

  // Species identifier & burst activity & individual pigment variation
  int species = int(fCol.r * 10.0 + 0.5);
  float tailActivity = clamp(fCol.g, 0.2, 1.0);
  float colorVar = clamp(fCol.b, 0.0, 1.0);
  float tailWave = fDir.w;

  // Streamlined anatomical body dimensions tailored to environment & fish species
  vec3 radii = vec3(0.038, 0.085, 0.28) * scale;
  if (uEnvironment == 0) {
    // 🌿 Pond Koi (비단잉어): Stately, smooth, majestic cylindrical torpedo
    radii = vec3(0.046, 0.084, 0.30) * scale;
    if (species == 5) {
      radii = vec3(0.040, 0.080, 0.28) * scale;
    }
  } else if (uEnvironment == 1) {
    // 🏞️ River Fish: Sleek, hydrodynamic fusiform bodies for swimming in currents
    if (species == 0) {
      radii = vec3(0.034, 0.072, 0.29) * scale;
    } else if (species == 1 || species == 2) {
      radii = vec3(0.038, 0.082, 0.30) * scale;
    } else if (species == 3 || species == 4) {
      radii = vec3(0.030, 0.068, 0.25) * scale;
    } else {
      radii = vec3(0.036, 0.078, 0.28) * scale;
    }
  } else {
    // 🌊 Ocean Marine Fish
    if (species == 0) {
      radii = vec3(0.042, 0.078, 0.32) * scale;
    } else if (species == 1) {
      radii = vec3(0.028, 0.096, 0.26) * scale;
    } else if (species == 2) {
      radii = vec3(0.035, 0.076, 0.21) * scale;
    } else if (species == 3) {
      radii = vec3(0.026, 0.112, 0.25) * scale;
    } else if (species == 4) {
      radii = vec3(0.024, 0.118, 0.24) * scale;
    } else {
      radii = vec3(0.025, 0.098, 0.23) * scale;
    }
  }

  // 1. Organic Curved Fins with Per-Vertex Procedural Sine-Wave Deformation & Subsurface Scattering
  float tFin = 1e9;
  vec3 nFin = vec3(0.0);
  vec3 colFin = vec3(0.0);
  float specFin = 0.40;
  float roughFin = 0.22;
  float sssFin = 0.92;
  vec3 sssColFin = vec3(0.95, 0.55, 0.28);
  float iridFin = 0.12;
  float thickFin = 0.032 * scale;

  // 1.1 Caudal tail fin (꼬리지느러미 - 미병부 무분리 결합 & 다중 시드 정밀 교차)
  if (abs(lrd.x) > 1e-5) {
    // Dual-seed testing: Seed 0 at peduncle junction (-0.92*rz), Seed 1 at mid-blade (-1.35*rz)
    // Completely eliminates ray-mismatch detachment between body peduncle and caudal fin
    for (int seedIdx = 0; seedIdx < 2; seedIdx++) {
      float zSeed = (seedIdx == 0) ? -0.92 * radii.z : -1.35 * radii.z;
      float dummyD;
      float wSeed = getFishSpineOffset(zSeed, radii.z, scale, tailWave, tailActivity, bank, dummyD);
      float tC = (wSeed - lro.x) / lrd.x;
      if (tC > 0.01) {
        vec3 pC = lro + lrd * tC;
        float zN = pC.z / radii.z;
        if (zN < -0.74 && zN > -1.82) {
          float uTail = clamp((-0.76 - zN) / 0.92, 0.0, 1.0);
          float lobeSpread = 1.45 * sin(uTail * PI * 0.5) * (0.85 + 0.35 * uTail);
          if (uTail < 0.22) {
            // Continuous peduncle bridge: seamless vertical thickness match with body peduncle
            lobeSpread = max(lobeSpread, mix(0.58, 0.25, uTail / 0.22));
          }
          float forkNotch = lobeSpread * 0.78 * smoothstep(0.25, 0.92, uTail);
          if (uEnvironment == 0) {
            // Koi fin: broad, fan-shaped with gentle scalloped fork (Butterfly koi has wide gossamer fan)
            lobeSpread = (species == 5) ? 1.75 * sin(uTail * PI * 0.5) * (0.95 + 0.40 * uTail) : 1.55 * sin(uTail * PI * 0.5) * (0.90 + 0.30 * uTail);
            if (uTail < 0.22) lobeSpread = max(lobeSpread, mix(0.58, 0.25, uTail / 0.22));
            forkNotch = (species == 5) ? 0.0 : lobeSpread * 0.38 * smoothstep(0.40, 0.95, uTail);
          } else if (species == 2 && uEnvironment == 2) {
            lobeSpread = 1.30 * sqrt(uTail) * (1.0 - uTail * 0.28);
            forkNotch = 0.0;
          }
          float absY = abs(pC.y / radii.y);
          if (absY <= lobeSpread && (forkNotch == 0.0 || uTail <= 0.22 || absY >= forkNotch)) {
            // Two-step Newton-Raphson refinement for exact quadratic convergence on deformed fin surface
            float tRefined = tC;
            for (int k = 0; k < 2; k++) {
              vec3 pCur = lro + lrd * tRefined;
              float dw_dy, dw_dz;
              float wCaudal = getCaudalFinDeform(pCur.y, pCur.z, radii.z, scale, tailWave, tailActivity, bank, species, dw_dy, dw_dz);
              float fVal = pCur.x - wCaudal;
              float fPrime = lrd.x - dw_dy * lrd.y - dw_dz * lrd.z;
              tRefined -= fVal / (abs(fPrime) > 1e-4 ? fPrime : sign(lrd.x) * 1e-4);
            }
            if (tRefined > 0.01 && tRefined < tFin) {
              vec3 pRef = lro + lrd * tRefined;
              float zRef = pRef.z / radii.z;
              if (zRef < -0.74 && zRef > -1.82) {
                tFin = tRefined;
                float dw_dy, dw_dz;
                float wCaudal = getCaudalFinDeform(pRef.y, pRef.z, radii.z, scale, tailWave, tailActivity, bank, species, dw_dy, dw_dz);
                vec3 gradLoc = vec3(1.0, -dw_dy, -dw_dz);
                vec3 nBody = normalize(gradLoc.x * rightBanked * sign(lrd.x) + gradLoc.y * upBanked + gradLoc.z * fwd);
                nFin = nBody;

                float angle = atan(pRef.y, pRef.z + 0.88 * radii.z);
                float rayGlint = 0.5 + 0.5 * cos(angle * 52.0);

                specFin = 0.45;
                roughFin = 0.20;
                sssFin = 0.95;
                thickFin = mix(0.042, 0.015, uTail) * scale;
                iridFin = 0.15;

                if (uEnvironment == 0) {
                  // 🌿 Pond Koi caudal fins: saturated, rich natural pigmentation
                  if (species == 0) {
                    // Kohaku: Translucent porcelain fin with intense scarlet Hi rays at the base
                    float hiRays = smoothstep(0.42, 0.02, uTail) * (0.65 + 0.35 * rayGlint);
                    colFin = mix(vec3(0.97, 0.96, 0.98), vec3(0.98, 0.10, 0.01), hiRays);
                    sssColFin = mix(vec3(0.95, 0.85, 0.75), vec3(0.98, 0.35, 0.08), hiRays);
                  } else if (species == 1) {
                    // Taisho Sanshoku / Showa: Bold black Tejima lacquer stripes and scarlet accents
                    float tejima = smoothstep(0.40, 0.65, sin(angle * 44.0)) * smoothstep(0.08, 0.75, uTail);
                    float hiBase = smoothstep(0.35, 0.02, uTail);
                    colFin = mix(vec3(0.97, 0.96, 0.98), vec3(0.98, 0.08, 0.01), hiBase);
                    colFin = mix(colFin, vec3(0.012, 0.012, 0.015), tejima * 0.96);
                    sssColFin = vec3(0.95, 0.55, 0.25);
                  } else if (species == 2) {
                    // Yamabuki Ogon: 24K radiant golden amber silk rays with luminous gold SSS
                    float rayBone = 0.5 + 0.5 * cos(angle * 52.0);
                    vec3 rayGold = vec3(1.00, 0.94, 0.45); // 24K golden bone rays
                    vec3 webGold = vec3(0.92, 0.68, 0.08); // translucent amber-gold silk membrane
                    colFin = mix(webGold, rayGold, rayBone * 0.60) * (0.88 + 0.28 * rayGlint);
                    sssColFin = vec3(1.00, 0.82, 0.22);
                    specFin = 0.85;
                  } else if (species == 3) {
                    // Hi Utsuri: Fiery crimson with bold black lacquer stripes
                    float bandF = smoothstep(0.35, 0.65, sin(uTail * 14.0 + angle * 12.0));
                    colFin = mix(vec3(0.98, 0.10, 0.01), vec3(0.012, 0.012, 0.015), bandF * 0.92);
                    sssColFin = vec3(0.96, 0.30, 0.08);
                  } else if (species == 4) {
                    // Asagi: Coral sunset-orange base with slate-blue ray tips
                    colFin = mix(vec3(0.98, 0.38, 0.04), vec3(0.35, 0.48, 0.62), smoothstep(0.18, 0.70, uTail));
                    sssColFin = vec3(0.96, 0.45, 0.15);
                  } else {
                    // Crucian Carp: Translucent olive-amber with fine ray flutes and warm brassy sheen
                    colFin = mix(vec3(0.78, 0.72, 0.50), vec3(0.55, 0.48, 0.32), uTail) * (0.85 + 0.30 * rayGlint);
                    sssColFin = vec3(0.85, 0.75, 0.45);
                  }
                } else if (uEnvironment == 1) {
                  // 🏞️ River fish caudal fins
                  colFin = mix(vec3(0.80, 0.78, 0.72), vec3(0.92, 0.88, 0.78), rayGlint * 0.4);
                  sssColFin = vec3(0.85, 0.75, 0.55);
                } else {
                  // 🌊 Ocean fish caudal fins
                  if (species == 0) {
                  colFin = mix(vec3(0.12, 0.22, 0.35), mix(vec3(0.85, 0.90, 0.96), vec3(0.92, 0.95, 0.98), colorVar), rayGlint * 0.45);
                  sssColFin = mix(vec3(0.75, 0.45, 0.25), vec3(0.85, 0.70, 0.40), rayGlint * 0.4);
                } else if (species == 1) {
                  vec3 yCol = mix(vec3(0.96, 0.82, 0.04), vec3(0.98, 0.88, 0.12), colorVar);
                  colFin = mix(yCol, vec3(0.04, 0.08, 0.25), smoothstep(0.88, 0.99, uTail));
                  sssColFin = yCol;
                } else if (species == 2) {
                  float isBlk = smoothstep(0.72, 0.86, uTail);
                  float isWht = smoothstep(0.88, 0.98, uTail);
                  vec3 baseFinO = mix(vec3(0.72, 0.24, 0.02), vec3(0.82, 0.30, 0.03), colorVar);
                  vec3 finO = mix(baseFinO, vec3(0.01, 0.01, 0.02), isBlk);
                  colFin = mix(finO, vec3(0.94, 0.94, 0.96), isWht);
                  sssColFin = mix(baseFinO * 1.3, vec3(0.70, 0.70, 0.70), isWht);
                } else if (species == 3) {
                  vec3 amberG = mix(vec3(0.94, 0.80, 0.06), vec3(0.98, 0.86, 0.12), colorVar);
                  colFin = mix(amberG, vec3(0.08, 0.40, 0.92), smoothstep(0.86, 1.0, uTail));
                  sssColFin = amberG;
                } else if (species == 4) {
                  colFin = mix(vec3(0.01, 0.01, 0.02), vec3(0.92, 0.92, 0.95), smoothstep(0.88, 0.99, uTail));
                  sssColFin = vec3(0.75, 0.75, 0.75);
                } else {
                  vec3 bGold = mix(vec3(0.92, 0.74, 0.05), vec3(0.96, 0.82, 0.10), colorVar);
                  colFin = mix(bGold, vec3(0.65, 0.88, 0.98), smoothstep(0.85, 1.0, uTail));
                  sssColFin = bGold;
                }
              }
            }
          }
        }
      }
    }
  }
}

  // 1.2 Dorsal fin (등지느러미 - 척추 상단 엄격 제한 교차)
  if (abs(lrd.x) > 1e-5) {
    float zDorMid = (species == 4) ? -0.10 * radii.z : -0.06 * radii.z;
    float dummyD;
    float wDorMid = getFishSpineOffset(zDorMid, radii.z, scale, tailWave, tailActivity, bank, dummyD);
    float tD = (wDorMid - lro.x) / lrd.x;
    if (tD > 0.01) {
      vec3 pD = lro + lrd * tD;
      float zN = pD.z / radii.z;
      float dZStart = (species == 4) ? -0.55 : -0.38;
      float dZEnd = (species == 4) ? 0.35 : 0.22;
      if (zN > dZStart && zN < dZEnd && pD.y > radii.y * 0.65) {
        float uDor = clamp((zN - dZStart) / (dZEnd - dZStart), 0.0, 1.0);
        float yBase = radii.y * sqrt(max(0.0, 1.0 - zN * zN)) * 0.85;
        float dorsalCurvedH = yBase + radii.y * (0.85 * sin(uDor * PI) * (1.0 - 0.30 * uDor));
        if (species == 4) {
          dorsalCurvedH = yBase + radii.y * (1.65 * pow(uDor, 0.6) * (1.0 - uDor * 0.35));
        }
        if (pD.y >= yBase && pD.y <= dorsalCurvedH) {
          float dw_dy, dw_dz;
          float wDor = getDorsalFinDeform(pD.y, pD.z, radii.z, scale, tailWave, tailActivity, bank, species, dw_dy, dw_dz);
          float fVal = pD.x - wDor;
          float fPrime = lrd.x - dw_dz * lrd.z;
          float tDorRef = tD - fVal / (abs(fPrime) > 1e-4 ? fPrime : sign(lrd.x));
          if (tDorRef < tFin && tDorRef > 0.01) {
            tFin = tDorRef;
            vec3 gradLoc = vec3(1.0, 0.0, -dw_dz);
            nFin = normalize(gradLoc.x * rightBanked * sign(lrd.x) + 0.12 * upBanked + gradLoc.z * fwd);
            specFin = 0.42;
            roughFin = 0.24;
            sssFin = 0.90;
            thickFin = 0.026 * scale;
            iridFin = 0.10;
            float dorRay = 0.5 + 0.5 * cos(uDor * 42.0);
            if (uEnvironment == 0) {
              // 🌿 Pond Koi Dorsal Fin: radiant translucent fins matching Nishikigoi varieties
              if (species == 0) {
                // Kohaku: porcelain white with flame scarlet marking
                colFin = mix(vec3(0.96, 0.95, 0.98), vec3(0.95, 0.18, 0.02), step(0.45, uDor));
                sssColFin = vec3(0.98, 0.55, 0.20);
              } else if (species == 1) {
                // Taisho: white with scarlet Hi and sumi tip
                colFin = mix(vec3(0.96, 0.95, 0.98), vec3(0.92, 0.16, 0.02), smoothstep(0.35, 0.75, uDor));
                colFin = mix(colFin, vec3(0.02, 0.02, 0.03), step(0.85, uDor));
                sssColFin = vec3(0.95, 0.45, 0.15);
              } else if (species == 2) {
                // Yamabuki Ogon: gleaming 24K gold dorsal rays and honey silk membrane
                vec3 rayGold = vec3(1.00, 0.94, 0.45);
                vec3 webGold = vec3(0.94, 0.70, 0.10);
                colFin = mix(webGold, rayGold, dorRay * 0.55);
                sssColFin = vec3(1.00, 0.85, 0.22);
                specFin = 0.80;
              } else if (species == 3) {
                // Hi Utsuri: fiery red with black rays
                colFin = mix(vec3(0.92, 0.18, 0.03), vec3(0.02, 0.02, 0.03), dorRay * 0.65);
                sssColFin = vec3(0.95, 0.40, 0.15);
              } else if (species == 4) {
                // Asagi: fiery orange at base, slate blue at upper crest
                colFin = mix(vec3(0.95, 0.42, 0.06), vec3(0.35, 0.48, 0.60), smoothstep(0.35, 0.75, pD.y / dorsalCurvedH));
                sssColFin = vec3(0.95, 0.55, 0.20);
              } else {
                // Crucian Carp: translucent olive-brass dorsal sail
                colFin = mix(vec3(0.72, 0.65, 0.42), vec3(0.48, 0.42, 0.28), dorRay * 0.45);
                sssColFin = vec3(0.82, 0.70, 0.40);
              }
            } else if (species == 0) {
              colFin = mix(vec3(0.05, 0.12, 0.22), vec3(0.18, 0.35, 0.48), dorRay * 0.5);
              sssColFin = vec3(0.60, 0.45, 0.30);
            } else if (species == 1) {
              colFin = mix(vec3(0.02, 0.06, 0.45), vec3(0.01, 0.01, 0.02), smoothstep(0.70, 0.95, pD.y / dorsalCurvedH));
              sssColFin = vec3(0.20, 0.45, 0.85);
            } else if (species == 2) {
              colFin = mix(vec3(0.72, 0.24, 0.02), vec3(0.01, 0.01, 0.02), smoothstep(0.78, 0.95, pD.y / dorsalCurvedH));
              sssColFin = vec3(0.95, 0.45, 0.12);
            } else if (species == 3) {
              colFin = mix(vec3(0.03, 0.06, 0.28), vec3(0.95, 0.80, 0.06), dorRay * 0.7);
              sssColFin = vec3(0.85, 0.65, 0.20);
            } else if (species == 4) {
              colFin = mix(vec3(0.01, 0.01, 0.02), vec3(0.95, 0.95, 0.98), smoothstep(0.20, 0.55, uDor));
              sssColFin = vec3(0.88, 0.88, 0.85);
            } else {
              colFin = mix(vec3(0.92, 0.72, 0.04), vec3(0.20, 0.65, 0.95), smoothstep(0.85, 1.0, pD.y / dorsalCurvedH));
              sssColFin = vec3(0.95, 0.75, 0.16);
            }
          }
        }
      }
    }
  }

  // 1.3 Anal fin (뒷지느러미 - 복부 용골 엄격 제한 교차)
  if (abs(lrd.x) > 1e-5) {
    float zAnalMid = -0.50 * radii.z;
    float dummyD;
    float wAnalMid = getFishSpineOffset(zAnalMid, radii.z, scale, tailWave, tailActivity, bank, dummyD);
    float tA = (wAnalMid - lro.x) / lrd.x;
    if (tA > 0.01) {
      vec3 pA = lro + lrd * tA;
      float zN = pA.z / radii.z;
      if (zN > -0.75 && zN < -0.25 && pA.y < -radii.y * 0.65) {
        float uAnal = clamp((zN + 0.75) / 0.50, 0.0, 1.0);
        float yBase = -radii.y * sqrt(max(0.0, 1.0 - zN * zN)) * 0.85;
        float analCurvedH = yBase - radii.y * (0.65 * sin(uAnal * PI));
        if (pA.y <= yBase && pA.y >= analCurvedH) {
          float dw_dy, dw_dz;
          float wAnal = getAnalFinDeform(pA.y, pA.z, radii.z, scale, tailWave, tailActivity, bank, dw_dy, dw_dz);
          float fVal = pA.x - wAnal;
          float fPrime = lrd.x - dw_dz * lrd.z;
          float tAnalRef = tA - fVal / (abs(fPrime) > 1e-4 ? fPrime : sign(lrd.x));
          if (tAnalRef < tFin && tAnalRef > 0.01) {
            tFin = tAnalRef;
            vec3 gradLoc = vec3(1.0, 0.0, -dw_dz);
            nFin = normalize(gradLoc.x * rightBanked * sign(lrd.x) - 0.12 * upBanked + gradLoc.z * fwd);
            specFin = 0.40;
            roughFin = 0.25;
            sssFin = 0.88;
            thickFin = 0.024 * scale;
            iridFin = 0.08;
            if (uEnvironment == 0) {
              // 🌿 Pond Koi Anal Fin: translucent, supple belly fin
              if (species == 0) {
                colFin = vec3(0.96, 0.95, 0.98);
                sssColFin = vec3(0.98, 0.70, 0.45);
              } else if (species == 1) {
                colFin = mix(vec3(0.96, 0.95, 0.98), vec3(0.92, 0.18, 0.02), step(-1.3, pA.y / radii.y));
                sssColFin = vec3(0.95, 0.50, 0.20);
              } else if (species == 2) {
                colFin = vec3(0.98, 0.82, 0.10);
                sssColFin = vec3(0.98, 0.85, 0.25);
              } else if (species == 3) {
                colFin = mix(vec3(0.92, 0.20, 0.04), vec3(0.02, 0.02, 0.03), 0.5);
                sssColFin = vec3(0.95, 0.45, 0.15);
              } else if (species == 4) {
                colFin = vec3(0.95, 0.45, 0.08);
                sssColFin = vec3(0.95, 0.55, 0.20);
              } else {
                colFin = vec3(0.98, 0.85, 0.35);
                sssColFin = vec3(0.98, 0.88, 0.45);
              }
            } else if (species == 2) {
              colFin = mix(vec3(0.72, 0.24, 0.02), vec3(0.01, 0.01, 0.02), step(-1.3, pA.y / radii.y));
              sssColFin = vec3(0.95, 0.45, 0.12);
            } else if (species == 1) {
              colFin = vec3(0.02, 0.06, 0.45);
              sssColFin = vec3(0.18, 0.42, 0.80);
            } else if (species == 3) {
              colFin = vec3(0.03, 0.05, 0.24);
              sssColFin = vec3(0.85, 0.65, 0.18);
            } else if (species == 5) {
              colFin = vec3(0.92, 0.72, 0.04);
              sssColFin = vec3(0.95, 0.75, 0.16);
            } else {
              colFin = vec3(0.70, 0.78, 0.86);
              sssColFin = vec3(0.80, 0.60, 0.45);
            }
          }
        }
      }
    }
  }

  // 1.4 Pectoral fins (가슴지느러미 - 부드러운 유선형 호버링 & 실크 멤브레인 나풀거림)
  for (int pSide = 0; pSide < 2; pSide++) {
    float pSign = (pSide == 0) ? 1.0 : -1.0;
    vec3 pecJoint = vec3(pSign * radii.x * 0.90, -0.012 * scale, 0.08 * scale);
    float fanPhase = tailWave * 0.85 + pSign * 0.85;
    float pecStroke = sin(fanPhase);
    float pecFlutter = 0.24 + 0.22 * pecStroke * tailActivity;
    float pecTwist = cos(fanPhase) * 0.12 * tailActivity;
    float cp_ang = cos(pecFlutter), sp_ang = sin(pecFlutter);
    vec3 pecNorm = normalize(vec3(pSign * sp_ang, -0.16 + pecTwist, -cp_ang));
    float denomPec = dot(lrd, pecNorm);
    if (abs(denomPec) > 1e-4) {
      float tPec = dot(pecJoint - lro, pecNorm) / denomPec;
      if (tPec > 0.01 && tPec < tFin) {
        vec3 pP = lro + lrd * tPec - pecJoint;
        float rPec = length(pP.xy);
        float lenPec = (uEnvironment == 0) ? (species == 5 ? 0.22 * scale : 0.175 * scale) : 0.118 * scale;
        float theta = atan(-pP.y, pP.x * pSign);
        float fanProfile = smoothstep(-0.45, 0.15, theta) * smoothstep(1.70, 0.95, theta);
        float fanRayScallop = 0.88 + 0.12 * cos(clamp(theta - 0.20, -1.2, 1.2));
        float maxR = lenPec * fanProfile * fanRayScallop;

        if (pP.x * pSign > 0.003 * scale && rPec < maxR && rPec > 0.003 * scale) {
          float d_disp_dr;
          float dispPec = getPecFinDeform(rPec, theta, lenPec, scale, tailWave, tailActivity, d_disp_dr);
          float tPecRef = tPec - dispPec / (abs(denomPec) > 1e-4 ? denomPec : 1.0);
          if (tPecRef < tFin && tPecRef > 0.01) {
            tFin = tPecRef;
            float rayP = 0.5 + 0.5 * cos(theta * 28.0);
            vec3 nP = normalize(pecNorm - vec3(0.0, 0.0, d_disp_dr * 0.35));
            vec3 nBody = normalize(nP.x * rightBanked + nP.y * upBanked + nP.z * fwd);
            nFin = (denomPec < 0.0) ? nBody : -nBody;
            specFin = 0.42;
            roughFin = 0.22;
            sssFin = 0.86;
            thickFin = 0.018 * scale;
            iridFin = 0.14;

            if (uEnvironment == 0) {
              // 🌿 Pond Koi pectoral fins: vibrant, matching species patterns
              if (species == 0) {
                colFin = mix(vec3(0.96, 0.96, 0.98), vec3(0.92, 0.22, 0.05), step(0.65, rPec / lenPec));
                sssColFin = vec3(0.95, 0.60, 0.30);
              } else if (species == 1) {
                colFin = mix(vec3(0.95, 0.95, 0.98), vec3(0.88, 0.18, 0.02), step(0.55, rPec / lenPec));
                sssColFin = vec3(0.95, 0.50, 0.20);
              } else if (species == 2) {
                float rayBone = 0.5 + 0.5 * cos(theta * 34.0);
                vec3 rayGold = vec3(1.00, 0.94, 0.45);
                vec3 webGold = vec3(0.94, 0.70, 0.10);
                colFin = mix(webGold, rayGold, rayBone * 0.58) * (0.90 + 0.22 * rayP);
                sssColFin = vec3(1.00, 0.84, 0.22);
                specFin = 0.80;
              } else if (species == 3) {
                colFin = vec3(0.90, 0.22, 0.06);
                sssColFin = vec3(0.95, 0.45, 0.15);
              } else if (species == 4) {
                colFin = vec3(0.92, 0.38, 0.06);
                sssColFin = vec3(0.95, 0.50, 0.15);
              } else {
                colFin = mix(vec3(0.96, 0.86, 0.35), vec3(0.96, 0.96, 0.98), rayP * 0.4);
                sssColFin = vec3(0.96, 0.88, 0.45);
              }
            } else if (uEnvironment == 1) {
              // 🏞️ River fish pectoral fins
              colFin = mix(vec3(0.82, 0.80, 0.75), vec3(0.90, 0.86, 0.78), rayP * 0.35);
              sssColFin = vec3(0.85, 0.75, 0.60);
            } else {
              // 🌊 Ocean fish pectoral fins
              if (species == 1) {
                colFin = mix(vec3(0.03, 0.08, 0.50), vec3(0.95, 0.82, 0.04), rayP * 0.45);
                sssColFin = vec3(0.95, 0.80, 0.20);
              } else if (species == 2) {
                colFin = mix(vec3(0.74, 0.26, 0.02), vec3(0.01, 0.01, 0.02), step(lenPec * 0.82, rPec));
                sssColFin = vec3(0.95, 0.45, 0.12);
              } else if (species == 5) {
                colFin = mix(vec3(0.92, 0.74, 0.05), vec3(0.40, 0.80, 0.98), rayP * 0.35);
                sssColFin = vec3(0.95, 0.75, 0.16);
              } else {
                colFin = mix(vec3(0.75, 0.85, 0.92), vec3(0.92, 0.96, 0.98), rayP * 0.35);
                sssColFin = vec3(0.82, 0.65, 0.48);
              }
            }
          }
        }
      }
    }
  }

  // 2. Analytical bounding ellipsoid intersection (Wide bounding box to never clip bent body)
  vec3 bRadii = vec3(radii.x + 0.35 * scale, radii.y * 1.45, radii.z * 1.45);
  vec3 ero = lro / bRadii;
  vec3 erd = lrd / bRadii;
  float a = dot(erd, erd);
  float b = 2.0 * dot(ero, erd);
  float c = dot(ero, ero) - 1.0;
  float disc = b*b - 4.0*a*c;

  if (disc > 0.0) {
    float sqrtDisc = sqrt(disc);
    float tEnter = (-b - sqrtDisc) / (2.0 * a);
    float tExit = (-b + sqrtDisc) / (2.0 * a);

    if (tExit > 0.005) {
      float tStart = max(tEnter, 0.005);
      float tEnd = tExit;

      float tHit = 1e9;
      bool hitBody = false;

      // Sample along ray segment (24 steps for continuous curved spine with zero miss)
      const int NUM_STEPS = 24;
      float dtStep = (tEnd - tStart) / float(NUM_STEPS);
      float tPrev = tStart;
      vec3 p0 = lro + lrd * tPrev;
      float dummyD;
      float w0 = getFishSpineOffset(p0.z, radii.z, scale, tailWave, tailActivity, bank, dummyD);
      vec3 q0 = vec3((p0.x - w0) / radii.x, p0.y / radii.y, p0.z / radii.z);
      float fPrev = dot(q0, q0) - 1.0;

      if (fPrev <= 0.0) {
        tHit = tStart;
        hitBody = true;
      } else {
        for (int i = 1; i <= NUM_STEPS; i++) {
          float tCur = tStart + float(i) * dtStep;
          vec3 pCur = lro + lrd * tCur;
          float wCur = getFishSpineOffset(pCur.z, radii.z, scale, tailWave, tailActivity, bank, dummyD);
          vec3 qCur = vec3((pCur.x - wCur) / radii.x, pCur.y / radii.y, pCur.z / radii.z);
          float fCur = dot(qCur, qCur) - 1.0;

          if (fCur <= 0.0) {
            float tA = tPrev, tB = tCur;
            float fA = fPrev, fB = fCur;
            for (int k = 0; k < 4; k++) {
              float tMid = (tA * fB - tB * fA) / (fB - fA + 1e-6);
              vec3 pMid = lro + lrd * tMid;
              float wMid = getFishSpineOffset(pMid.z, radii.z, scale, tailWave, tailActivity, bank, dummyD);
              vec3 qMid = vec3((pMid.x - wMid) / radii.x, pMid.y / radii.y, pMid.z / radii.z);
              float fMid = dot(qMid, qMid) - 1.0;
              if (fMid <= 0.0) { tB = tMid; fB = fMid; }
              else { tA = tMid; fA = fMid; }
            }
            tHit = (tA + tB) * 0.5;
            hitBody = true;
            break;
          }
          tPrev = tCur;
          fPrev = fCur;
        }
      }

      if (hitBody && tHit < h.t) {
        h.t = tHit;
        vec3 pHit = lro + lrd * tHit;
        float dw_dz;
        float wHit = getFishSpineOffset(pHit.z, radii.z, scale, tailWave, tailActivity, bank, dw_dz);
        float dx = (pHit.x - wHit) / radii.x;
        float dy = pHit.y / radii.y;
        float dz = pHit.z / radii.z;

        vec3 grad = vec3(dx / radii.x, dy / radii.y, dz / radii.z - (dx / radii.x) * dw_dz);
        vec3 nLoc = normalize(grad);

        float zNorm = dz;
        float yNorm = dy;

        // Authentic Imbricated Cycloid Scale Lattice (잉어·붕어의 정밀 엇갈림 입체 비늘 구조)
        // Circumferential angle around body axis: hoopNorm = 0.0 at exact dorsal spine, +/-1.0 at belly
        float phiHoop = atan(dx, dy);
        float hoopNorm = phiHoop / 3.14159265;

        // Perfectly centered dorsal scale column along spine (등줄기 중심선 대칭 비늘열 정렬)
        float scRowFloat = hoopNorm * 8.0;
        float scRow = floor(scRowFloat + 0.5);
        float scStagger = (fract(abs(scRow) * 0.5) > 0.25) ? 0.5 : 0.0;

        // Body trunk scale range: operculum (dz = 0.36) to caudal peduncle (dz = -0.75)
        float zTrunk = clamp((dz - (-0.75)) / 1.11, 0.0, 1.0);
        vec2 scCoord = vec2(zTrunk * 28.0 + scStagger, scRowFloat + 0.5);
        vec2 fSc = fract(scCoord) - 0.5;

        // Realistic imbricated crescent scale profile with overlapping posterior margin
        float scDist = length(vec2(fSc.x * 1.25, fSc.y * 0.95));

        // Fukurin (覆輪 / 복륜): Raised gleaming mesh boundary of each scale
        float scEdge = smoothstep(0.28, 0.46, scDist);
        float scCenter = 1.0 - scEdge;
        // Micro growth annuli (環紋) reflecting fine iridescent glints
        float scAnnuli = 0.5 + 0.5 * cos(scDist * 38.0);

        // Scales strictly on body trunk; head (Kabuto) and caudal fin are smooth
        float hasScales = (1.0 - smoothstep(0.32, 0.38, dz)) * smoothstep(-0.80, -0.70, dz);
        scEdge *= hasScales;
        scCenter *= hasScales;

        // 3D Imbricated shingle relief: scales overlap backward toward tail (-z) and bevel outward at Fukurin rims
        float scRelief = hasScales * (1.0 - smoothstep(0.68, 0.95, abs(dz)));
        vec3 nScale = normalize(nLoc + vec3(fSc.x * 0.36, fSc.y * 0.28, -0.38 * (1.0 - scDist * 1.6)) * scRelief);
        // Beveled Fukurin rim normal enhancement
        nScale = normalize(nScale + vec3(fSc.x * 0.25, 0.15, fSc.y * 0.25) * scEdge * scRelief);
        h.n = normalize(nScale.x * rightBanked + nScale.y * upBanked + nScale.z * fwd);

        // Lateral sensory line (측선 / 側線): prominent sensory pores running horizontally along mid-flank (hoopNorm ≈ ±0.48)
        float distToLatLine = min(abs(hoopNorm - 0.48), abs(hoopNorm + 0.48));
        float isLateralLine = (1.0 - smoothstep(0.0, 0.055, distToLatLine)) * hasScales;
        float latPore = smoothstep(0.24, 0.58, sin(zTrunk * 28.0 * PI)) * isLateralLine;

        vec3 bodyCol = vec3(0.5);

        // Angle between ray and surface normal for Fresnel guanine iridescence
        float cosView = clamp(dot(-rd, h.n), 0.0, 1.0);
        float guanineIrid = pow(1.0 - cosView, 2.5);

        // Thickness profile of living fish: belly and tail thinner, spine thicker
        float bodyThick = (radii.x * 1.8) * (0.35 + 0.65 * (1.0 - zNorm * zNorm)) * (0.65 + 0.35 * cos(yNorm * 1.57));
        h.thickness = bodyThick;
        h.sssAmount = mix(0.72, 0.38, smoothstep(-0.25, 0.40, yNorm));
        h.roughness = mix(0.20, 0.35, smoothstep(-0.2, 0.5, yNorm));

        if (uEnvironment == 0) {
          // ================= 🌿 POND: NISHIKIGOI & CRUCIAN CARP (비단잉어 5대 품종 및 토종 붕어) =================
          vec3 porcelainWhite = vec3(0.97, 0.96, 0.98); // Pure porcelain white Shiroji (백자 백지)
          vec3 deepScarletHi = vec3(0.98, 0.08, 0.01); // Vivid lacquer vermilion-scarlet Hi (주홍 붉은 비단 무늬)
          vec3 lacquerBlackSumi = vec3(0.010, 0.010, 0.012); // Deep jet black lacquer Sumi (칠흑 먹빛 반점)

          if (species == 0) {
            // 1. Kohaku (홍백 - 紅白): Pure porcelain white with razor-sharp, bold crimson-scarlet dorsal plates (면도날 기와 / Kamisori-kiwa)
            float hiWave = sin(zNorm * 7.5 + sin(yNorm * 4.0) * 1.4) + 0.45 * cos(zNorm * 3.5 - yNorm * 2.5);
            float isHi = smoothstep(-0.04, 0.05, hiWave) * smoothstep(-0.35, -0.10, yNorm);
            float headHi = 1.0 - smoothstep(0.12, 0.16, length(vec2((zNorm - 0.52) * 1.5, (yNorm - 0.08) * 1.4)));
            isHi = max(isHi, headHi);
            bodyCol = mix(porcelainWhite, deepScarletHi, isHi);
            float ginrin = scEdge * (1.0 - isHi) * 0.22;
            bodyCol += vec3(0.16, 0.18, 0.22) * ginrin;
            float hiFacet = scEdge * isHi * 0.18;
            bodyCol += vec3(0.22, 0.05, 0.01) * hiFacet;
            bodyCol = mix(bodyCol, vec3(0.10, 0.10, 0.12), latPore * 0.55);
            h.sssCol = mix(vec3(0.95, 0.85, 0.75), vec3(0.98, 0.35, 0.08), isHi);
            h.spec = 0.75;
            h.roughness = 0.18;
          } else if (species == 1) {
            // 2. Taisho Sanshoku / Showa (대정삼색 / 소화): Snow white body with bold scarlet Hi and deep jet-black Sumi
            float hiWave = sin(zNorm * 6.5 + sin(yNorm * 4.0) * 1.2);
            float isHi = smoothstep(-0.03, 0.06, hiWave) * smoothstep(-0.35, -0.08, yNorm);
            float headHi = 1.0 - smoothstep(0.10, 0.16, length(vec2((zNorm - 0.50) * 1.6, (yNorm - 0.08) * 1.5)));
            isHi = max(isHi, headHi);
            float sumiWave = sin(zNorm * 16.0 + yNorm * 9.0 + colorVar * 3.5) + cos(zNorm * 10.0 - yNorm * 7.0);
            float isSumi = smoothstep(0.38, 0.46, sumiWave) * smoothstep(-0.30, 0.20, yNorm);
            bodyCol = mix(porcelainWhite, deepScarletHi, isHi);
            bodyCol = mix(bodyCol, lacquerBlackSumi, isSumi);
            bodyCol += vec3(0.14, 0.16, 0.20) * scEdge * (1.0 - isHi) * (1.0 - isSumi) * 0.20;
            bodyCol = mix(bodyCol, vec3(0.08, 0.08, 0.09), latPore * 0.50);
            h.sssCol = mix(vec3(0.92, 0.85, 0.75), vec3(0.95, 0.38, 0.10), isHi);
            h.spec = 0.78;
            h.roughness = 0.18;
          } else if (species == 2) {
            // 3. Yamabuki Ogon (황금잉어 - 山吹黄金): Brilliant 24K pure metallic golden luster with authentic Fukurin (복륜 / 覆輪)
            // Real Yamabuki Ogon has a rich deep burnished amber/honey golden core, covered by gleaming 24K metallic gold fukurin rims
            vec3 ogonDorsal = vec3(0.94, 0.68, 0.05); // Deep burnished honey-amber gold on back
            vec3 ogonFlank = vec3(1.00, 0.86, 0.08);  // Radiant 24K brilliant yellow gold on flanks
            vec3 ogonBelly = vec3(0.96, 0.94, 0.82);  // Soft luminous cream/platinum gold on belly
            vec3 fukurinRim = vec3(1.00, 0.96, 0.52); // High-reflectivity 24K jewelry gold mesh
            vec3 scalePocket = vec3(0.82, 0.52, 0.02); // Rich amber pocket core

            // Vertical gradient from dorsal to flank to belly
            float flankWeight = smoothstep(0.06, 0.45, abs(hoopNorm));
            float bellyWeight = smoothstep(0.65, 0.95, abs(hoopNorm));
            vec3 baseGold = mix(ogonDorsal, ogonFlank, flankWeight);
            baseGold = mix(baseGold, ogonBelly, bellyWeight);

            // Scale pocket core vs Fukurin border
            vec3 ogonCol = mix(baseGold, scalePocket, (1.0 - scEdge) * 0.50);
            // Raised Fukurin 24K gold diamond mesh
            ogonCol = mix(ogonCol, fukurinRim, scEdge * 0.95);

            // Mirror-polished golden Kabuto (투구) crown on head: flawless smooth 24K lacquer without scales
            float isHead = smoothstep(0.34, 0.48, dz);
            vec3 kabutoGold = vec3(1.00, 0.86, 0.12);
            ogonCol = mix(ogonCol, kabutoGold, isHead);

            // Fine growth annuli specular glint
            ogonCol += vec3(0.24, 0.18, 0.05) * scAnnuli * hasScales;

            // Lateral line golden sensory pores
            ogonCol = mix(ogonCol, vec3(0.70, 0.45, 0.02), latPore * 0.65);

            bodyCol = ogonCol;
            h.spec = 2.4; // Intense 24K metallic specular reflection
            h.roughness = 0.06;
            h.irid = guanineIrid * 0.90;
            h.sssCol = vec3(1.0, 0.82, 0.20);
          } else if (species == 3) {
            // 4. Hi Utsuri / Benigoi (비단 흑홍 잉어): Vibrant crimson-red body with bold black tiger bands
            vec3 fireRed = vec3(0.98, 0.10, 0.01);
            float bandWave = sin(zNorm * 13.0 + yNorm * 5.0) + cos(zNorm * 8.0 - yNorm * 4.0);
            float isBand = smoothstep(0.28, 0.36, bandWave);
            bodyCol = mix(fireRed, lacquerBlackSumi, isBand * 0.96);
            bodyCol += vec3(0.18, 0.03, 0.01) * scEdge * (1.0 - isBand) * 0.20;
            h.sssCol = vec3(0.98, 0.30, 0.08);
            h.spec = 0.75;
          } else if (species == 4) {
            // 5. Asagi (천청 - 浅黄): Slate indigo diamond netted scales with radiant sunset-orange flanks
            vec3 asagiBlue = vec3(0.20, 0.34, 0.48);
            vec3 asagiOrange = vec3(0.98, 0.38, 0.04);
            float isBlueDorsal = smoothstep(-0.06, 0.22, yNorm);
            bodyCol = mix(asagiOrange, asagiBlue, isBlueDorsal);
            float asagiNet = scEdge * isBlueDorsal;
            bodyCol = mix(bodyCol, vec3(0.10, 0.18, 0.28), asagiNet * 0.75);
            h.sssCol = mix(asagiOrange * 1.1, vec3(0.30, 0.45, 0.60), isBlueDorsal);
            h.spec = 0.75;
          } else {
            // 6. Crucian Carp / Golden Crucian Carp (토종 붕어 / 황금 붕어): Authentic wild river carp
            // Rich olive-bronze dorsal with brassy gold scale pockets, prominent lateral line, and creamy pearl belly
            vec3 crucianBack = vec3(0.24, 0.32, 0.15); // Deep mossy olive-bronze back
            vec3 crucianFlank = vec3(0.82, 0.72, 0.38); // Golden brassy flanks
            vec3 crucianBelly = vec3(0.92, 0.92, 0.88); // Soft pearl cream belly
            vec3 crucianPocket = vec3(0.15, 0.14, 0.08); // Deep dark crescent scale pocket
            vec3 crucianRim = vec3(0.88, 0.82, 0.50); // Brassy gold scale margin

            float flankW = smoothstep(0.08, 0.50, abs(hoopNorm));
            float bellyW = smoothstep(0.65, 0.95, abs(hoopNorm));
            vec3 crBase = mix(crucianBack, crucianFlank, flankW);
            crBase = mix(crBase, crucianBelly, bellyW);

            // Dark crescent scale pockets and brassy golden scale edges
            crBase = mix(crBase, crucianPocket, (1.0 - scEdge) * 0.42 * (1.0 - bellyW));
            crBase = mix(crBase, crucianRim, scEdge * 0.72);

            // Prominent dark lateral line sensory pores
            crBase = mix(crBase, vec3(0.10, 0.08, 0.04), latPore * 0.90);

            bodyCol = crBase;
            h.spec = 0.95;
            h.roughness = 0.20;
            h.sssCol = vec3(0.85, 0.78, 0.55);
            h.irid = guanineIrid * 0.45;
          }
        } else if (uEnvironment == 1) {
          // ================= 🏞️ RIVER: CLEAN FRESHWATER FISH (은어 & 산천어) =================
          if (species == 0) {
            // 1. Ayu / Sweetfish (은어): Sleek olive dorsal, bright silver flank & golden operculum spot
            vec3 ayuOlive = mix(vec3(0.28, 0.35, 0.18), vec3(0.32, 0.40, 0.22), colorVar);
            vec3 ayuSilver = mix(vec3(0.85, 0.88, 0.92), vec3(0.92, 0.94, 0.96), colorVar);
            bodyCol = mix(ayuSilver, ayuOlive, smoothstep(0.08, 0.45, yNorm));
            bodyCol = mix(bodyCol, vec3(0.95, 0.96, 0.97), 1.0 - smoothstep(-0.40, -0.10, yNorm));
            float ayuSpotD = length(vec2((zNorm - 0.46) * 1.5, yNorm - 0.02));
            float isSpot = 1.0 - smoothstep(0.035, 0.065, ayuSpotD);
            bodyCol = mix(bodyCol, vec3(0.98, 0.85, 0.15), isSpot * 0.95);
            h.spec = 0.90;
            h.sssCol = vec3(0.80, 0.75, 0.60);
          } else if (species == 1) {
            // 2. Cherry Salmon / Yamame (산천어): Violet flanks with dark oval parr marks & ruby dots
            vec3 yamOlive = mix(vec3(0.32, 0.38, 0.28), vec3(0.38, 0.42, 0.32), colorVar);
            vec3 yamFlank = mix(vec3(0.78, 0.76, 0.82), vec3(0.85, 0.82, 0.88), colorVar);
            bodyCol = mix(yamFlank, yamOlive, smoothstep(0.12, 0.48, yNorm));
            float parrX = zNorm * 18.0;
            float isParr = smoothstep(0.30, 0.65, sin(parrX)) * (1.0 - smoothstep(0.0, 0.18, abs(yNorm)));
            bodyCol = mix(bodyCol, vec3(0.20, 0.18, 0.25), isParr * 0.75);
            h.spec = 0.85;
            h.sssCol = vec3(0.85, 0.65, 0.55);
          } else if (species == 2) {
            // 3. Rainbow Trout (무지개송어): Olive back, bright magenta-pink lateral blush
            vec3 troutBack = mix(vec3(0.25, 0.32, 0.20), vec3(0.20, 0.28, 0.18), colorVar);
            vec3 troutSilver = vec3(0.88, 0.90, 0.92);
            bodyCol = mix(troutSilver, troutBack, smoothstep(0.10, 0.45, yNorm));
            float isBand = 1.0 - smoothstep(0.0, 0.12, abs(yNorm + 0.02));
            vec3 blushPink = mix(vec3(0.92, 0.28, 0.48), vec3(0.95, 0.35, 0.55), colorVar);
            bodyCol = mix(bodyCol, blushPink, isBand * 0.70);
            h.spec = 0.88;
            h.sssCol = mix(vec3(0.75, 0.75, 0.75), blushPink, isBand);
          } else if (species == 3) {
            // 4. Pale Chub (피라미): Bold cyan-blue back and bright orange-red nuptial belly
            vec3 chubBlue = mix(vec3(0.10, 0.45, 0.65), vec3(0.08, 0.52, 0.72), colorVar);
            vec3 chubRed = mix(vec3(0.92, 0.32, 0.08), vec3(0.96, 0.40, 0.12), colorVar);
            bodyCol = mix(chubRed, chubBlue, smoothstep(-0.15, 0.25, yNorm));
            h.spec = 0.95;
            h.sssCol = vec3(0.90, 0.50, 0.30);
          } else if (species == 4) {
            // 5. Dark Chub (갈겨니): Olive-gold back and dark steel-blue lateral stripe
            vec3 dBack = mix(vec3(0.40, 0.38, 0.25), vec3(0.45, 0.42, 0.28), colorVar);
            vec3 dSilver = vec3(0.86, 0.88, 0.90);
            bodyCol = mix(dSilver, dBack, smoothstep(0.12, 0.45, yNorm));
            float isStripe = 1.0 - smoothstep(0.0, 0.08, abs(yNorm));
            bodyCol = mix(bodyCol, vec3(0.08, 0.12, 0.22), isStripe * 0.85);
            h.spec = 0.82;
            h.sssCol = vec3(0.75, 0.70, 0.55);
          } else {
            // 6. Stream Dace / Golden Mandarin (황쏘가리): Amber-gold riverbed camouflage
            vec3 amberGold = mix(vec3(0.85, 0.68, 0.12), vec3(0.92, 0.75, 0.18), colorVar);
            float spots = smoothstep(0.45, 0.70, sin(zNorm * 26.0 + sin(yNorm * 18.0) * 1.5));
            bodyCol = mix(amberGold, vec3(0.28, 0.18, 0.08), spots * 0.65);
            h.spec = 0.85;
            h.sssCol = vec3(0.85, 0.65, 0.25);
          }
        } else {
          // ================= 🌊 OCEAN: CORAL REEF & PELAGIC =================
          if (species == 0) {
            // --- 1. Pacific Bluefin Tuna / Striped Mackerel (참다랑어/고등어) ---
            vec3 tunaBack = mix(vec3(0.02, 0.06, 0.15), vec3(0.01, 0.09, 0.14), colorVar);
            vec3 tunaFlank = mix(vec3(0.80, 0.86, 0.92), vec3(0.85, 0.89, 0.94), colorVar);
            vec3 tunaBelly = vec3(0.92, 0.94, 0.97);

            float stripeWave = sin(zNorm * (38.0 + colorVar * 10.0) + sin(yNorm * 22.0) * 1.5);
            float tigerStripe = smoothstep(0.20, 0.55, stripeWave) * smoothstep(0.12, 0.50, yNorm);
            tunaBack = mix(tunaBack, vec3(0.01, 0.02, 0.06), tigerStripe * (0.75 + 0.20 * colorVar));

            vec3 cCol = mix(tunaFlank, tunaBack, smoothstep(0.06, 0.35, yNorm));
            cCol = mix(cCol, tunaBelly, 1.0 - smoothstep(-0.45, -0.15, yNorm));

            float lateralLine = (1.0 - smoothstep(0.0, 0.032, abs(yNorm - 0.04))) * (1.0 - smoothstep(0.60, 0.88, zNorm));
            vec3 latColor = mix(vec3(0.04, 0.72, 0.82), vec3(0.12, 0.85, 0.75), colorVar);
            cCol = mix(cCol, latColor, lateralLine * 0.85);

            vec3 iridShift = mix(vec3(0.95, 0.78, 0.98), vec3(0.62, 0.96, 0.86), guanineIrid);
            float flankZone = smoothstep(-0.35, -0.05, yNorm) * (1.0 - smoothstep(0.08, 0.35, yNorm));
            cCol = mix(cCol, cCol * iridShift * 1.18, flankZone * 0.65);

            float finletRow = smoothstep(-0.40, -0.85, zNorm) * smoothstep(0.25, 0.65, abs(yNorm));
            vec3 finletCol = mix(vec3(0.95, 0.82, 0.08), vec3(0.98, 0.90, 0.15), colorVar);
            cCol = mix(cCol, finletCol, finletRow * 0.45);

            bodyCol = cCol;
            h.spec = mix(0.8, 1.4, flankZone);
            h.sssCol = mix(vec3(0.92, 0.32, 0.20), vec3(0.85, 0.70, 0.55), smoothstep(-0.3, 0.2, yNorm));
            h.irid = guanineIrid * flankZone;
          } else if (species == 1) {
            // --- 2. Royal Blue Tang / Dory (로열 블루탱 / Paracanthurus hepatus) ---
            vec3 royalBlue = mix(vec3(0.02, 0.06, 0.46), vec3(0.01, 0.12, 0.54), colorVar);
            vec3 deepIndigo = mix(vec3(0.01, 0.03, 0.28), vec3(0.01, 0.05, 0.35), colorVar);
            bodyCol = mix(royalBlue, deepIndigo, smoothstep(0.10, 0.50, yNorm));

            float pShape = abs(yNorm * 1.35 - 0.10) + pow(max(0.0, -zNorm * 0.75), 1.7);
            float isBlackPalette = smoothstep(0.24, 0.36, pShape) * (1.0 - smoothstep(0.42, 0.58, abs(zNorm - 0.18) + abs(yNorm)));
            float isDorsalBand = smoothstep(0.42, 0.72, yNorm) * smoothstep(0.55, -0.42, zNorm);
            float blackMarking = clamp(isBlackPalette + isDorsalBand, 0.0, 1.0);
            bodyCol = mix(bodyCol, vec3(0.01, 0.01, 0.02), blackMarking * 0.96);

            float yellowWedge = smoothstep(-0.35 - 0.05 * colorVar, -0.72, zNorm);
            vec3 canaryYellow = mix(vec3(0.96, 0.82, 0.04), vec3(0.98, 0.88, 0.12), colorVar);
            bodyCol = mix(bodyCol, canaryYellow, yellowWedge);

            bodyCol += vec3(0.05, 0.32, 0.90) * guanineIrid * (0.40 + 0.20 * colorVar);
            h.spec = 0.85;
            h.sssCol = mix(vec3(0.18, 0.52, 0.88), vec3(0.95, 0.75, 0.15), yellowWedge);
            h.irid = guanineIrid * 0.5;
          } else if (species == 2) {
            // --- 3. Percula Clownfish / Nemo (페르큘라 크라운피시) ---
            vec3 orangeBase = mix(vec3(0.72, 0.22, 0.01), vec3(0.85, 0.32, 0.02), colorVar);
            vec3 orangeBack = mix(vec3(0.55, 0.15, 0.01), vec3(0.68, 0.22, 0.01), colorVar);
            bodyCol = mix(orangeBase, orangeBack, smoothstep(0.10, 0.55, yNorm));

            float bandW = 0.065 + (colorVar - 0.5) * 0.016;
            float b1 = smoothstep(bandW, 0.0, abs(zNorm - 0.40));
            float b2 = smoothstep(bandW + 0.01, 0.0, abs(zNorm + 0.05 - yNorm * 0.05));
            float b3 = smoothstep(bandW - 0.01, 0.0, abs(zNorm + 0.68));
            float wBands = max(max(b1, b2), b3);

            float borderW = bandW + 0.030;
            float e1 = smoothstep(borderW, bandW, abs(zNorm - 0.40));
            float e2 = smoothstep(borderW + 0.01, bandW + 0.01, abs(zNorm + 0.05 - yNorm * 0.05));
            float e3 = smoothstep(borderW - 0.01, bandW - 0.01, abs(zNorm + 0.68));
            float blkBorder = max(max(e1, e2), e3) * (1.0 - wBands);

            bodyCol = mix(bodyCol, vec3(0.94, 0.94, 0.96), wBands);
            bodyCol = mix(bodyCol, vec3(0.01, 0.01, 0.02), blkBorder * 0.96);
            h.spec = 0.65;
            h.sssCol = mix(mix(vec3(0.96, 0.42, 0.12), vec3(0.98, 0.52, 0.15), colorVar), vec3(0.75, 0.75, 0.75), wBands);
            h.irid = guanineIrid * 0.25;
          } else if (species == 3) {
            // --- 4. Emperor Angelfish (엠페러 엔젤피시) ---
            vec3 angBody = mix(vec3(0.03, 0.05, 0.24), vec3(0.02, 0.07, 0.32), colorVar);
            float angFreq = 40.0 + colorVar * 8.0;
            float angStripes = 0.5 + 0.5 * cos((yNorm * 1.1 + zNorm * 0.28) * angFreq);
            float isStripe = smoothstep(0.35, 0.65, angStripes) * (1.0 - smoothstep(0.38, 0.65, zNorm));
            vec3 stripeGold = mix(vec3(0.95, 0.78, 0.06), vec3(0.98, 0.85, 0.12), colorVar);
            bodyCol = mix(angBody, stripeGold, isStripe * 0.92);

            float maskDist = abs(zNorm - 0.52) * 1.4 + abs(yNorm - 0.12) * 0.6;
            float isMask = 1.0 - smoothstep(0.08, 0.18, maskDist);
            float isMaskBorder = (1.0 - smoothstep(0.16, 0.22, maskDist)) * (1.0 - isMask);
            bodyCol = mix(bodyCol, vec3(0.01, 0.01, 0.02), isMask * 0.96);
            vec3 maskBorderCol = mix(vec3(0.10, 0.48, 0.98), vec3(0.18, 0.65, 1.0), colorVar);
            bodyCol = mix(bodyCol, maskBorderCol, isMaskBorder * 0.92);

            float angTail = smoothstep(-0.52, -0.85, zNorm);
            bodyCol = mix(bodyCol, stripeGold, angTail);
            h.spec = 0.95;
            h.sssCol = mix(vec3(0.15, 0.35, 0.75), stripeGold, isStripe);
            h.irid = guanineIrid * 0.45;
          } else if (species == 4) {
            // --- 5. Moorish Idol (깃대해마 / Zanclus cornutus) ---
            vec3 idolWhite = mix(vec3(0.88, 0.90, 0.94), vec3(0.95, 0.94, 0.90), colorVar);
            vec3 idolYellow = mix(vec3(0.94, 0.82, 0.06), vec3(0.98, 0.86, 0.12), colorVar);
            bodyCol = mix(idolWhite, idolYellow, smoothstep(-0.25, -0.65, zNorm));

            float band1 = smoothstep(0.13, 0.0, abs(zNorm - 0.42));
            float band2 = smoothstep(0.15, 0.0, abs(zNorm + 0.15));
            float band3 = smoothstep(0.09, 0.0, abs(zNorm + 0.78));
            float idolBands = max(max(band1, band2), band3);

            float snoutSaddle = smoothstep(0.08, 0.0, length(vec2(zNorm - 0.78, yNorm - 0.08)));
            bodyCol = mix(bodyCol, idolYellow, snoutSaddle);
            bodyCol = mix(bodyCol, vec3(0.01, 0.01, 0.02), idolBands * 0.97);
            h.spec = 0.80;
            h.sssCol = mix(vec3(0.88, 0.75, 0.38), vec3(0.92, 0.82, 0.45), colorVar);
            h.irid = guanineIrid * 0.35;
          } else {
            // --- 6. Golden Butterflyfish / Yellow Tang (골든 버터플라이피시) ---
            vec3 tangGold = mix(vec3(0.90, 0.72, 0.04), vec3(0.96, 0.80, 0.08), colorVar);
            vec3 tangAmber = mix(vec3(0.65, 0.42, 0.03), vec3(0.75, 0.48, 0.05), colorVar);
            bodyCol = mix(tangGold, tangAmber, smoothstep(0.15, 0.55, abs(yNorm)));

            float eyeBar = 1.0 - smoothstep(0.025, 0.055, abs(zNorm - 0.50));
            bodyCol = mix(bodyCol, vec3(0.05, 0.04, 0.02), eyeBar * 0.85);

            bodyCol += vec3(0.20, 0.65, 0.95) * guanineIrid * (0.30 + 0.15 * colorVar);
            h.spec = 0.90;
            h.sssCol = mix(vec3(0.95, 0.76, 0.16), vec3(0.98, 0.84, 0.22), colorVar);
            h.irid = guanineIrid * 0.45;
          }
        }

        // Realistic 3D Eye on RIGID head
        float eyeD = length(vec2(pHit.z - radii.z * 0.72, pHit.y - radii.y * 0.22));
        float isEye = smoothstep(0.022 * scale, 0.014 * scale, eyeD);
        float isPupil = smoothstep(0.010 * scale, 0.005 * scale, eyeD);
        vec3 irisCol = (species == 0) ? vec3(0.85, 0.85, 0.88) : ((species == 2) ? vec3(0.80, 0.40, 0.12) : vec3(0.95, 0.85, 0.35));
        bodyCol = mix(bodyCol, irisCol, isEye);
        bodyCol = mix(bodyCol, vec3(0.01, 0.01, 0.01), isPupil);
        h.roughness = mix(h.roughness, 0.08, isEye);
        h.spec = mix(h.spec, 1.2, isEye);
        h.sssAmount = mix(h.sssAmount, 0.08, isEye);

        h.col = bodyCol;
      }
    }
  }

  // If fin was hit closer than body or body missed
  if (tFin < h.t && tFin > 0.01) {
    h.t = tFin;
    h.n = nFin;
    h.col = colFin;
    h.spec = specFin;
    h.roughness = roughFin;
    h.sssAmount = sssFin;
    h.sssCol = sssColFin;
    h.irid = iridFin;
    h.thickness = thickFin;
  }

  return h;
}

// ---------------- 3D Green Sea Turtle (Chelonia mydas) ----------------
struct TurtleHit {
  float t;
  vec3 n;
  vec3 col;
  float spec;
  float roughness;
  float sssAmount;
  vec3 sssCol;
  float irid;
  float thickness;
};

TurtleHit intersectTurtle(vec3 ro, vec3 rd, vec4 tPos, vec4 tDir, vec4 tCol) {
  TurtleHit h;
  h.t = 1e9;
  h.n = vec3(0.0, 1.0, 0.0);
  h.col = vec3(0.12, 0.14, 0.08);
  h.spec = 0.16;
  h.roughness = 0.30;
  h.sssAmount = 0.35;
  h.sssCol = vec3(0.35, 0.28, 0.12);
  h.irid = 0.0;
  h.thickness = 0.35 * max(tPos.w, 0.30);

  vec3 center = tPos.xyz;
  float scale = max(tPos.w, 0.30);
  vec3 fwd = normalize(tDir.xyz);
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(fwd, worldUp));
  vec3 up = cross(right, fwd);

  // Inward bank roll on turns (NO DOUBLE PITCH!)
  float bank = tCol.x;
  float cb = cos(bank), sb = sin(bank);
  vec3 rightB = right * cb + up * sb;
  vec3 upB = -right * sb + up * cb;
  vec3 fwdP = fwd;

  vec3 ro_rel = ro - center;
  vec3 lro = vec3(dot(ro_rel, rightB), dot(ro_rel, upB), dot(ro_rel, fwdP));
  vec3 lrd = vec3(dot(rd, rightB), dot(rd, upB), dot(rd, fwdP));

  // 1. Carapace (등갑) & Plastron (복갑 - 배)
  vec3 cRadii = vec3(0.30, 0.14, 0.42) * scale;
  vec3 cPos = lro - vec3(0.0, -0.015 * scale, 0.0);
  vec3 ero = cPos / cRadii;
  vec3 erd = lrd / cRadii;
  float a = dot(erd, erd);
  float b = 2.0 * dot(ero, erd);
  float c = dot(ero, ero) - 1.0;
  float disc = b*b - 4.0*a*c;

  if (disc > 0.0) {
    float t0 = (-b - sqrt(disc)) / (2.0*a);
    if (t0 > 0.01 && t0 < h.t) {
      vec3 p = lro + lrd * t0;
      vec3 nLoc = normalize((p - vec3(0.0, -0.015 * scale, 0.0)) / (cRadii * cRadii));

      if (p.y >= -0.03 * scale) {
        // --- Carapace (등갑): Authentic Chelonia mydas (Deep Moss-Olive, Dark Mahogany & Amber Rays, NEVER WHITE!) ---
        float zNorm = p.z / cRadii.z;
        float xNorm = p.x / cRadii.x;
        float rShell = length(vec2(xNorm, zNorm));

        vec3 baseMossOlive = vec3(0.09, 0.13, 0.06);
        vec3 baseDarkChestnut = vec3(0.08, 0.05, 0.03);
        vec3 deepMahogany = vec3(0.05, 0.03, 0.02);
        vec3 cCol = mix(baseMossOlive, baseDarkChestnut, 0.5 + 0.5 * sin(zNorm * 4.5 + xNorm * 2.8));

        // Vertebral & Costal scute plate seams
        float spineZone = abs(xNorm);
        float zSegment = fract((zNorm + 0.9) * 2.1) - 0.5;
        float seamLine = min(abs(spineZone - 0.32), abs(zSegment));
        float isSeam = 1.0 - smoothstep(0.01, 0.05, seamLine);

        // Sunburst growth striations inside scutes (호박색/캐러멜 방사선 무늬)
        float rayPattern = 0.5 + 0.5 * sin(atan(abs(xNorm) - 0.32, zSegment) * 14.0 + zNorm * 8.0);
        vec3 sunburstCol = mix(vec3(0.22, 0.15, 0.05), deepMahogany, rayPattern);
        cCol = mix(cCol, sunburstCol, 0.50);

        // Dark indented walnut seams with subtle ochre margins
        vec3 seamColor = vec3(0.04, 0.03, 0.02);
        cCol = mix(cCol, seamColor, isSeam * 0.85);

        // Marginal scute rim (쉘 가장자리 올리브 버프 테두리)
        float rim = smoothstep(0.78, 0.96, rShell);
        float rimSegment = 0.5 + 0.5 * sin(atan(p.x, p.z) * 24.0);
        vec3 rimCol = mix(vec3(0.24, 0.20, 0.12), vec3(0.16, 0.14, 0.08), rimSegment);
        cCol = mix(cCol, rimCol, rim);

        // Micro-texture: Keratin concentric growth rings & radiating grain perturbing normal
        float growthRings = sin(rShell * 72.0 + vnoise(p.xz * 38.0 / scale) * 2.5);
        float keratinGrain = sin(atan(p.x, p.z) * 85.0);
        vec3 nCarapace = normalize(nLoc + vec3(keratinGrain * 0.025, 0.0, growthRings * 0.035));

        h.t = t0;
        h.n = normalize(nCarapace.x * rightB + nCarapace.y * upB + nCarapace.z * fwdP);
        h.col = cCol;
        h.roughness = 0.28;
        h.thickness = mix(0.08, 0.42, 1.0 - rim) * scale;
        h.sssAmount = mix(0.24, 0.68, rim);
        h.sssCol = mix(vec3(0.24, 0.16, 0.06), vec3(0.38, 0.28, 0.10), rim);
        h.spec = mix(0.16, 0.24, rim);
        h.irid = 0.05;
      } else {
        // --- Plastron (복갑 - 배 밑면): Shaded warm parchment tan (NOT blinding white!) ---
        vec3 bellyCol = vec3(0.34, 0.30, 0.18);
        float plastronSeam = 1.0 - smoothstep(0.01, 0.04, min(abs(abs(p.x) - 0.12 * scale), abs(fract(p.z / (0.35 * scale) * 2.0) - 0.5)));
        bellyCol = mix(bellyCol, vec3(0.18, 0.15, 0.10), plastronSeam * 0.50);

        h.t = t0;
        h.n = normalize(nLoc.x * rightB + nLoc.y * upB + nLoc.z * fwdP);
        h.col = bellyCol;
        h.spec = 0.15;
        h.roughness = 0.30;
        h.thickness = 0.20 * scale;
        h.sssAmount = 0.62;
        h.sssCol = vec3(0.42, 0.38, 0.20);
        h.irid = 0.0;
      }
    }
  }

  // 2. Neck & Head
  vec3 headCenter = vec3(0.0, 0.02 * scale, 0.48 * scale);
  vec3 headRadii = vec3(0.078, 0.072, 0.12) * scale;
  vec3 h_ero = (lro - headCenter) / headRadii;
  vec3 h_erd = lrd / headRadii;
  float ha = dot(h_erd, h_erd);
  float hb = 2.0 * dot(h_ero, h_erd);
  float hc = dot(h_ero, h_ero) - 1.0;
  float hdisc = hb*hb - 4.0*ha*hc;

  if (hdisc > 0.0) {
    float ht0 = (-hb - sqrt(hdisc)) / (2.0*ha);
    if (ht0 > 0.01 && ht0 < h.t) {
      vec3 pHead = lro + lrd * ht0;
      vec3 hnLoc = normalize((pHead - headCenter) / (headRadii * headRadii));

      // Reptile pebble mosaic bump micro-relief
      float scuteBump = vnoise(pHead.xz * 65.0 / scale);
      vec3 nHead = normalize(hnLoc + vec3(scuteBump * 0.06, 0.0, scuteBump * 0.06));
      h.t = ht0;
      h.n = normalize(nHead.x * rightB + nHead.y * upB + nHead.z * fwdP);

      // Dark chocolate mosaic reptile scale skin on olive leather
      float mosaic = vnoise(pHead.xz * 36.0 / scale);
      vec3 scaleCol = mix(vec3(0.04, 0.03, 0.02), vec3(0.09, 0.07, 0.04), mosaic);
      vec3 headCol = mix(vec3(0.14, 0.15, 0.09), scaleCol, smoothstep(0.28, 0.45, mosaic));

      // Golden reptile eyes with dark pupils
      float dEye = min(length(pHead - vec3(0.062, 0.038, 0.50) * scale), length(pHead - vec3(-0.062, 0.038, 0.50) * scale));
      float isEye = smoothstep(0.022 * scale, 0.015 * scale, dEye);
      float isPupil = smoothstep(0.010 * scale, 0.005 * scale, dEye);
      headCol = mix(headCol, vec3(0.65, 0.52, 0.15), isEye);
      headCol = mix(headCol, vec3(0.01, 0.01, 0.01), isPupil);

      h.col = headCol;
      h.roughness = mix(0.34, 0.08, isEye);
      h.spec = mix(0.15, 0.85, isEye);
      h.thickness = 0.26 * scale;
      h.sssAmount = mix(0.46, 0.08, isEye);
      h.sssCol = vec3(0.35, 0.28, 0.12);
      h.irid = 0.0;
    }
  }

  // 3. Pectoral Flippers with Powerful Wing-Flap Kinematics & Spanwise Bending
  float flipperPhase = tDir.w;
  // Natural asymmetric sea turtle kinematics (powerful downward stroke, feathered upward recovery)
  float strokeWave = sin(flipperPhase);
  float asymStroke = (strokeWave > 0.0) ? pow(strokeWave, 0.85) : -pow(-strokeWave, 1.15);
  float flapAngle = asymStroke * 0.60 - 0.06;
  float twistAngle = cos(flipperPhase) * 0.35 - 0.06;

  for (int side = 0; side < 2; side++) {
    float sSign = (side == 0) ? 1.0 : -1.0;
    vec3 shoulder = vec3(sSign * 0.22 * scale, -0.018 * scale, 0.15 * scale);

    float thetaFlap = -sSign * flapAngle;
    float thetaTwist = sSign * twistAngle;
    float cf = cos(thetaFlap), sf = sin(thetaFlap);
    float ct = cos(thetaTwist), st = sin(thetaTwist);

    vec3 eSpan = vec3(sSign * cf, sf, 0.0);
    vec3 eChord = vec3(-sSign * sf * st, cf * st, -ct);
    vec3 eUp = vec3(-sSign * sf * ct, cf * ct, st);

    vec3 ro_sh = lro - shoulder;
    vec3 roFlip = vec3(dot(ro_sh, eSpan), dot(ro_sh, eUp), dot(ro_sh, eChord));
    vec3 rdFlip = vec3(dot(lrd, eSpan), dot(lrd, eUp), dot(lrd, eChord));

    if (abs(rdFlip.y) > 1e-4) {
      float tPlane = -roFlip.y / rdFlip.y;
      if (tPlane > 0.01 && tPlane < h.t) {
        vec3 pW = roFlip + rdFlip * tPlane;
        float span = pW.x / scale;
        float chord = -pW.z / scale;

        if (span > 0.01 && span < 0.50) {
          float sNorm = span / 0.50;
          float chordCen = 0.03 + 0.36 * pow(sNorm, 1.25);
          float halfC = 0.13 * sqrt(sNorm) * (1.0 - sNorm) * (1.15 + 0.35 * (1.0 - sNorm));
          float dChord = chord - chordCen;

          if (abs(dChord) < halfC) {
            float eta = dChord / halfC; // -1 at leading edge, +1 at trailing edge

            // Procedural Sine-Wave Deformation for Flexible Living Hydrofoil:
            // 1) Hydrodynamic spanwise bending wave: tip flexes opposite to flap stroke direction
            float tipFlex = -0.088 * scale * (sNorm * sNorm) * sin(flipperPhase);
            // 2) Chordwise traveling sinusoidal trailing edge wave
            float trailingFlex = 0.052 * scale * sNorm * pow(clamp((eta + 1.0) * 0.5, 0.0, 1.0), 1.5) * cos(flipperPhase - sNorm * 2.8);
            float totalFlex = tipFlex + trailingFlex;

            float tFlexRef = tPlane + totalFlex / (abs(rdFlip.y) > 1e-4 ? rdFlip.y : -1.0);
            if (tFlexRef > 0.01 && tFlexRef < h.t) {
              h.t = tFlexRef;

              // Deformed normal incorporates analytical procedural wave slope
              float d_tip_ds = -0.176 * scale * sNorm * sin(flipperPhase) / (0.50 * scale);
              float d_trail_deta = 0.052 * scale * sNorm * 1.5 * pow(clamp((eta + 1.0) * 0.5, 0.0, 1.0), 0.5) * 0.5 * cos(flipperPhase - sNorm * 2.8) / halfC;

              vec3 nFlip = normalize(vec3(
                -0.25 * eta - d_tip_ds * 0.5,
                (rdFlip.y < 0.0) ? 1.0 : -1.0,
                -0.45 * eta - d_trail_deta * 0.4
              ));

              // Leathery scale bump on flipper surface
              float flipBump = vnoise(pW.xz * 52.0 / scale);
              vec3 nFlipMod = normalize(nFlip + vec3(0.0, flipBump * 0.08, 0.0));
              vec3 nBody = nFlipMod.x * eSpan + nFlipMod.y * eUp + nFlipMod.z * eChord;
              h.n = normalize(nBody.x * rightB + nBody.y * upB + nBody.z * fwdP);

              if (rdFlip.y < 0.0) {
                // Dorsal: Leathery olive-drab skin with dark chocolate mosaic scale plates & muted buff margin
                float isTrailingMargin = smoothstep(0.55, 0.95, eta);
                float mosaicWing = vnoise(pW.xz * 28.0 / scale);
                vec3 wingBase = mix(vec3(0.08, 0.07, 0.04), vec3(0.14, 0.13, 0.08), mosaicWing);
                float tileBorder = smoothstep(0.35, 0.42, fract(mosaicWing * 3.5));
                wingBase = mix(wingBase, vec3(0.04, 0.03, 0.02), tileBorder * 0.55);
                vec3 wingCol = mix(wingBase, vec3(0.22, 0.19, 0.12), isTrailingMargin * 0.70);
                h.col = wingCol;
              } else {
                // Ventral: Shaded parchment cream-tan (NEVER white!)
                h.col = vec3(0.30, 0.27, 0.16);
              }
              h.spec = 0.18;
              h.roughness = 0.30;
              h.thickness = (0.045 + 0.16 * (1.0 - abs(eta)) * (1.0 - sNorm)) * scale;
              h.sssAmount = mix(0.55, 0.90, sNorm);
              h.sssCol = (rdFlip.y < 0.0) ? vec3(0.36, 0.32, 0.14) : vec3(0.46, 0.40, 0.22);
              h.irid = 0.04;
            }
          }
        }
      }
    }
  }

  // 4. Pelvic Rudders with Dynamic Pitch, Steering Yaw & Sine-Wave Ripples
  for (int rSide = 0; rSide < 2; rSide++) {
    float rSign = (rSide == 0) ? 1.0 : -1.0;
    vec3 rJoint = vec3(rSign * 0.14 * scale, -0.04 * scale, -0.30 * scale);
    float rudPhase = flipperPhase * 0.85 + rSign * 0.85;
    float rudPitch = sin(rudPhase) * 0.32; // dynamic vertical kick/paddle
    float rudYaw = cos(rudPhase) * 0.18 * rSign + bank * 0.40; // rudder steering on turns
    float crp = cos(rudPitch), srp = sin(rudPitch);
    float cry = cos(rudYaw), sry = sin(rudYaw);
    vec3 rNorm = normalize(vec3(-sry * rSign, crp, srp * cry));
    float rDenom = dot(lrd, rNorm);
    if (abs(rDenom) > 1e-4) {
      float tRud = dot(rJoint - lro, rNorm) / rDenom;
      if (tRud > 0.01 && tRud < h.t) {
        vec3 pR = lro + lrd * tRud - rJoint;
        float rSpan = pR.x * rSign / scale;
        float rChord = pR.z / scale;
        float rDist = length(vec2(rSpan, rChord * 1.3));
        if (rSpan > 0.01 && rDist < 0.17 && rChord < 0.03 && rChord > -0.18) {
          float rudFlex = 0.036 * scale * (rSpan / 0.17) * sin(rudPhase);
          float tRudRef = tRud + rudFlex / (abs(rDenom) > 1e-4 ? rDenom : 1.0);
          if (tRudRef > 0.01 && tRudRef < h.t) {
            h.t = tRudRef;
            vec3 nRudLoc = normalize(rNorm + vec3(0.036 * scale / 0.17 * sin(rudPhase) * rSign, 0.0, 0.0));
            vec3 wN = normalize(nRudLoc.x * rightB + nRudLoc.y * upB + nRudLoc.z * fwdP);
            h.n = (rDenom < 0.0) ? wN : -wN;
            h.col = (rDenom < 0.0) ? vec3(0.12, 0.13, 0.08) : vec3(0.28, 0.25, 0.15);
            h.spec = 0.16;
            h.roughness = 0.32;
            h.thickness = 0.065 * scale;
            h.sssAmount = 0.78;
            h.sssCol = (rDenom < 0.0) ? vec3(0.34, 0.30, 0.14) : vec3(0.45, 0.38, 0.20);
            h.irid = 0.02;
          }
        }
      }
    }
  }

  // 5. Undulating Turtle Tail (유연하게 요동치는 작은 꼬리)
  vec3 tailJoint = vec3(0.0, -0.025 * scale, -0.38 * scale);
  float tailWiggle = sin(flipperPhase * 0.85) * 0.014 * scale;
  vec3 tCenter = tailJoint + vec3(tailWiggle, -0.008 * scale, -0.045 * scale);
  vec3 tRadii = vec3(0.022, 0.016, 0.055) * scale;
  vec3 tro = (lro - tCenter) / tRadii;
  vec3 trd = lrd / tRadii;
  float ta = dot(trd, trd);
  float tb = 2.0 * dot(tro, trd);
  float tc = dot(tro, tro) - 1.0;
  float tdisc = tb*tb - 4.0*ta*tc;
  if (tdisc > 0.0) {
    float tt0 = (-tb - sqrt(tdisc)) / (2.0*ta);
    if (tt0 > 0.01 && tt0 < h.t) {
      vec3 pt = lro + lrd * tt0;
      vec3 tnLoc = normalize((pt - tCenter) / (tRadii * tRadii));
      h.t = tt0;
      h.n = normalize(tnLoc.x * rightB + tnLoc.y * upB + tnLoc.z * fwdP);
      h.col = vec3(0.10, 0.12, 0.07);
      h.spec = 0.15;
      h.roughness = 0.34;
      h.thickness = 0.045 * scale;
      h.sssAmount = 0.68;
      h.sssCol = vec3(0.32, 0.28, 0.12);
      h.irid = 0.0;
    }
  }

  return h;
}

struct DebrisHit {
  float t;
  vec3 n;
  vec3 col;
  float spec;
};

DebrisHit intersectDebris(vec3 ro, vec3 rd, vec4 dPos, vec4 dRot) {
  DebrisHit h;
  h.t = 1e9;
  h.n = vec3(0.0, 1.0, 0.0);
  h.col = vec3(0.65, 0.52, 0.32);
  h.spec = 0.25;

  vec3 center = dPos.xyz;
  float size = max(dPos.w, 0.2);
  float type = dRot.w;

  vec3 fwd = normalize(dRot.xyz);
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(fwd, up));
  up = cross(right, fwd);

  vec3 ro_rel = ro - center;
  vec3 lro = vec3(dot(ro_rel, right), dot(ro_rel, up), dot(ro_rel, fwd));
  vec3 lrd = vec3(dot(rd, right), dot(rd, up), dot(rd, fwd));

  // 3. Floating Debris on surface (driftwood & seaweed, or water lilies in Pond)
  if (uEnvironment == 0) {
    // 🌿 Garden Pond: Floating Water Lily Pads (정원식 연못 수련 / 연잎 조경)
    // Characteristic rounded floating disc with V-cleft notch and radiating leaf veins
    vec3 padRadii = vec3(0.35, 0.018, 0.35) * size;
    vec3 ero = lro / padRadii;
    vec3 erd = lrd / padRadii;
    float a = dot(erd, erd);
    float b = 2.0 * dot(ero, erd);
    float c = dot(ero, ero) - 1.0;
    float disc = b*b - 4.0*a*c;
    if (disc > 0.0 && a > 1e-5) {
      float t0 = (-b - sqrt(disc)) / (2.0*a);
      if (t0 > 0.01) {
        vec3 p = lro + lrd * t0;
        float rLily = length(p.xz) / (0.35 * size);
        float phiLily = atan(p.z, p.x);
        // Characteristic V-notch cleft of water lily pad
        if (abs(phiLily) > 0.22 && rLily < 0.98) {
          h.t = t0;
          h.n = vec3(0.0, 1.0, 0.0);
          float veins = 0.5 + 0.5 * cos(phiLily * 18.0);
          float rim = smoothstep(0.85, 0.98, rLily);
          vec3 leafGreen = mix(vec3(0.12, 0.42, 0.16), vec3(0.18, 0.54, 0.22), veins * 0.35);
          vec3 rimCol = vec3(0.22, 0.48, 0.15);
          h.col = mix(leafGreen, rimCol, rim);
          h.spec = 0.45;
          // In the center of some pads: a delicate pale pink water lily flower bud
          if (type > 0.5 && length(p.xz) < 0.09 * size) {
            h.col = vec3(0.96, 0.90, 0.92);
            h.spec = 0.65;
          }
        }
      }
    }
    return h;
  }

  // Organic floating coconut husk / amber driftwood float (NEVER A BLACK CYLINDER!)
  if (type < 0.5) {
    vec3 cRadii = vec3(0.12, 0.08, 0.14) * size;
    vec3 ero = lro / cRadii;
    vec3 erd = lrd / cRadii;
    float a = dot(erd, erd);
    float b = 2.0 * dot(ero, erd);
    float c = dot(ero, ero) - 1.0;
    float disc = b*b - 4.0*a*c;
    if (disc > 0.0 && a > 1e-5) {
      float t0 = (-b - sqrt(disc)) / (2.0*a);
      if (t0 > 0.01) {
        vec3 p = lro + lrd * t0;
        h.t = t0;
        vec3 nLoc = normalize(p / (cRadii * cRadii));
        h.n = normalize(nLoc.x * right + nLoc.y * up + nLoc.z * fwd);
        float fiber = vnoise(p.xz * 32.0 / size);
        vec3 huskCol = mix(vec3(0.68, 0.52, 0.28), vec3(0.52, 0.38, 0.20), fiber);
        h.col = huskCol;
        h.spec = 0.35;
      }
    }
  } else {
    vec3 radii = vec3(0.30, 0.045, 0.30) * size;
    vec3 ero = lro / radii;
    vec3 erd = lrd / radii;
    float a = dot(erd, erd);
    float b = 2.0 * dot(ero, erd);
    float c = dot(ero, ero) - 1.0;
    float disc = b*b - 4.0*a*c;
    if (disc > 0.0) {
      float t0 = (-b - sqrt(disc)) / (2.0*a);
      if (t0 > 0.01) {
        vec3 p = lro + lrd * t0;
        float kelpNoise = vnoise(p.xz * 28.0);
        if (kelpNoise > 0.30) {
          h.t = t0;
          vec3 nLoc = normalize(p / (radii * radii));
          h.n = normalize(nLoc.x * right + nLoc.y * up + nLoc.z * fwd);
          vec3 weedCol = mix(vec3(0.28, 0.48, 0.18), vec3(0.42, 0.62, 0.22), kelpNoise);
          h.col = weedCol;
          h.spec = 0.35;
        }
      }
    }
  }
  return h;
}

// Analytical capsule intersection for sunken bogwood logs and river boulders on pond bed
float intersectCapsuleLog(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float r, out vec3 outN) {
  vec3 ba = pb - pa;
  vec3 oa = ro - pa;
  float baba = dot(ba, ba);
  float bard = dot(ba, rd);
  float baoa = dot(ba, oa);
  float rdoa = dot(rd, oa);
  float oaoa = dot(oa, oa);
  float a = baba - bard * bard;
  float b = baba * rdoa - baoa * bard;
  float c = baba * oaoa - baoa * baoa - r * r * baba;
  float h = b * b - a * c;
  if (h >= 0.0 && a > 1e-5) {
    float t = (-b - sqrt(h)) / a;
    float y = baoa + t * bard;
    if (y > 0.0 && y < baba) {
      vec3 p = ro + rd * t;
      outN = normalize((p - (pa + ba * (y / baba))) / r);
      return t;
    }
  }
  // Cap spheres at pa and pb
  vec3 ocA = ro - pa;
  float bA = dot(rd, ocA);
  float cA = dot(ocA, ocA) - r * r;
  float hA = bA * bA - cA;
  if (hA > 0.0) {
    float tA = -bA - sqrt(hA);
    if (tA > 0.01 && dot(ro + rd * tA - pa, ba) <= 0.0) {
      outN = normalize(ro + rd * tA - pa);
      return tA;
    }
  }
  vec3 ocB = ro - pb;
  float bB = dot(rd, ocB);
  float cB = dot(ocB, ocB) - r * r;
  float hB = bB * bB - cB;
  if (hB > 0.0) {
    float tB = -bB - sqrt(hB);
    if (tB > 0.01 && dot(ro + rd * tB - pb, ba) >= 0.0) {
      outN = normalize(ro + rd * tB - pb);
      return tB;
    }
  }
  return 1e9;
}

// 🌿 Submerged Aquatic Vegetation & Sunken Bogwood Ecosystem (수중 수초 군락 & 침목 고목 생태계)
struct AquaticPlantHit {
  float t;
  vec3 n;
  vec3 col;
  float sssAmount;
  vec3 sssCol;
  float thickness;
};

AquaticPlantHit intersectPondVegetation(vec3 ro, vec3 rd, float maxT) {
  AquaticPlantHit best;
  best.t = maxT;
  best.n = vec3(0.0, 1.0, 0.0);
  best.col = vec3(0.12, 0.40, 0.16);
  best.sssAmount = 0.85;
  best.sssCol = vec3(0.24, 0.65, 0.18);
  best.thickness = 0.012;

  // 1. Sunken Weathered Bogwood Logs (침목 / 물속에 가라앉은 고목 유목 - 바닥 위에 안착된 3D 통나무)
  // Log 1: Main ancient pine trunk resting on the gravel bed
  vec3 log1A = vec3(-0.85, -0.68, -1.65);
  vec3 log1B = vec3(-0.10, -0.64, -1.15);
  vec3 nLog1;
  float tLog1 = intersectCapsuleLog(ro, rd, log1A, log1B, 0.065, nLog1);
  if (tLog1 > 0.02 && tLog1 < best.t) {
    best.t = tLog1;
    vec3 pLog = ro + rd * tLog1;
    float barkNoise = vnoise(pLog.xz * 18.0) * 0.7 + vnoise(vec2(pLog.y * 35.0, pLog.x * 12.0)) * 0.3;
    // Dark saturated walnut and aged bogwood grain
    vec3 bogwoodDark = vec3(0.11, 0.08, 0.06);
    vec3 bogwoodMid = vec3(0.18, 0.13, 0.09);
    vec3 logCol = mix(bogwoodDark, bogwoodMid, barkNoise);
    // Velvet moss colonies clinging to sunlit top surfaces of the sunken log
    float mossOnLog = smoothstep(0.25, 0.75, nLog1.y + 0.25 * vnoise(pLog.xz * 8.0));
    vec3 sunkenMoss = vec3(0.10, 0.28, 0.08);
    best.col = mix(logCol, sunkenMoss, mossOnLog * 0.85);
    best.n = normalize(nLog1 + vec3(barkNoise * 0.15 - 0.07, 0.0, barkNoise * 0.15 - 0.07));
    best.sssAmount = 0.25;
    best.sssCol = vec3(0.35, 0.25, 0.15);
    best.thickness = 0.08;
  }

  // Log 2: Second weathered driftwood log
  vec3 log2A = vec3(0.25, -0.68, -1.75);
  vec3 log2B = vec3(0.85, -0.62, -1.25);
  vec3 nLog2;
  float tLog2 = intersectCapsuleLog(ro, rd, log2A, log2B, 0.055, nLog2);
  if (tLog2 > 0.02 && tLog2 < best.t) {
    best.t = tLog2;
    vec3 pLog2 = ro + rd * tLog2;
    float bark2 = vnoise(pLog2.xz * 22.0);
    vec3 log2Col = mix(vec3(0.09, 0.07, 0.05), vec3(0.16, 0.11, 0.08), bark2);
    float moss2 = smoothstep(0.30, 0.78, nLog2.y);
    best.col = mix(log2Col, vec3(0.09, 0.26, 0.07), moss2 * 0.82);
    best.n = nLog2;
    best.sssAmount = 0.20;
    best.sssCol = vec3(0.30, 0.20, 0.12);
    best.thickness = 0.06;
  }

  // Log 3: Branching bough arching upward into the water column
  vec3 log3A = vec3(-0.45, -0.66, -1.35);
  vec3 log3B = vec3(-0.35, -0.38, -1.02);
  vec3 nLog3;
  float tLog3 = intersectCapsuleLog(ro, rd, log3A, log3B, 0.038, nLog3);
  if (tLog3 > 0.02 && tLog3 < best.t) {
    best.t = tLog3;
    vec3 pLog3 = ro + rd * tLog3;
    vec3 log3Col = mix(vec3(0.12, 0.09, 0.06), vec3(0.18, 0.14, 0.09), vnoise(pLog3.xz * 24.0));
    float moss3 = smoothstep(0.35, 0.85, nLog3.y);
    best.col = mix(log3Col, vec3(0.12, 0.32, 0.09), moss3 * 0.80);
    best.n = nLog3;
    best.sssAmount = 0.30;
    best.sssCol = vec3(0.32, 0.22, 0.14);
    best.thickness = 0.045;
  }

  // 1.5 Submerged Stepping Stone Boulders (수중 자연석 징검다리 - 호안석 바위)
  vec3 rock1 = vec3(0.45, -0.64, -1.05);
  vec3 dR1 = ro - rock1;
  float bR1 = dot(rd, dR1);
  float cR1 = dot(dR1, dR1) - (0.16 * 0.16);
  float hR1 = bR1 * bR1 - cR1;
  if (hR1 > 0.0) {
    float tR1 = -bR1 - sqrt(hR1);
    if (tR1 > 0.02 && tR1 < best.t) {
      best.t = tR1;
      vec3 pR1 = ro + rd * tR1;
      vec3 nR1 = normalize(pR1 - rock1);
      float rCell = vnoise(pR1.xz * 12.0);
      vec3 stoneCol = mix(vec3(0.32, 0.30, 0.28), vec3(0.20, 0.19, 0.20), rCell);
      float mossCap = smoothstep(0.20, 0.70, nR1.y);
      best.col = mix(stoneCol, vec3(0.14, 0.38, 0.10), mossCap * 0.88);
      best.n = nR1;
      best.sssAmount = 0.15;
      best.sssCol = vec3(0.25, 0.25, 0.20);
      best.thickness = 0.20;
    }
  }

  vec3 rock2 = vec3(-0.65, -0.65, -1.05);
  vec3 dR2 = ro - rock2;
  float bR2 = dot(rd, dR2);
  float cR2 = dot(dR2, dR2) - (0.18 * 0.18);
  float hR2 = bR2 * bR2 - cR2;
  if (hR2 > 0.0) {
    float tR2 = -bR2 - sqrt(hR2);
    if (tR2 > 0.02 && tR2 < best.t) {
      best.t = tR2;
      vec3 pR2 = ro + rd * tR2;
      vec3 nR2 = normalize(pR2 - rock2);
      float rCell2 = vnoise(pR2.xz * 10.0);
      vec3 stoneCol2 = mix(vec3(0.28, 0.26, 0.25), vec3(0.18, 0.17, 0.18), rCell2);
      float mossCap2 = smoothstep(0.25, 0.72, nR2.y);
      best.col = mix(stoneCol2, vec3(0.12, 0.35, 0.09), mossCap2 * 0.85);
      best.n = nR2;
      best.sssAmount = 0.15;
      best.sssCol = vec3(0.25, 0.25, 0.20);
      best.thickness = 0.22;
    }
  }

  // 2. Procedural Water Lily Stems connecting root on pond floor to floating surface pad
  for (int si = 0; si < 16; si++) {
    if (si >= uLilyCount) break;
    vec2 sPad = uLilyData[si].xy;
    vec2 sRoot = uLilyMeta[si].zw;
    // Follow FFT wave simulation displacement at the surface connection point
    vec4 sWaveA = texture(uSurf, sPad / uL);
    vec2 sChop = -sWaveA.yz * (uChoppiness * 0.048);
    vec2 floatingSPad = sPad + sChop;
    float sway = 0.035 * sin(uTime * 1.2 + float(si) * 1.7);
    vec2 sCenter = mix(sRoot, floatingSPad, 0.5) + vec2(sway, 0.02 * cos(uTime * 1.1 + float(si)));
    vec2 dXZ = ro.xz - sCenter;
    float a = dot(rd.xz, rd.xz);
    float b = 2.0 * dot(dXZ, rd.xz);
    float c = dot(dXZ, dXZ) - (0.016 * 0.016);
    float disc = b * b - 4.0 * a * c;
    if (disc > 0.0 && a > 1e-5) {
      float t0 = (-b - sqrt(disc)) / (2.0 * a);
      if (t0 > 0.02 && t0 < best.t) {
        float hitY = ro.y + rd.y * t0;
        if (hitY < -0.01 && hitY > -0.85) {
          best.t = t0;
          vec2 pXZ = ro.xz + rd.xz * t0;
          best.n = normalize(vec3(pXZ.x - sCenter.x, 0.12, pXZ.y - sCenter.y));
          best.col = mix(vec3(0.09, 0.32, 0.11), vec3(0.15, 0.45, 0.17), sin(hitY * 22.0) * 0.5 + 0.5);
          best.thickness = 0.018;
          best.sssAmount = 0.85;
          best.sssCol = vec3(0.24, 0.65, 0.18);
        }
      }
    }
  }

  // 3. Procedural Submerged Aquatic Plants (Hornwort 붕어마름 & Vallisneria 나사말)
  for (int hi = 0; hi < 12; hi++) {
    if (hi >= uPlantCount) break;
    vec2 hBase = uPlantData[hi].xy;
    float pType = uPlantData[hi].z;
    float pRad = uPlantData[hi].w;

    float hSway = 0.065 * sin(uTime * 1.35 + float(hi) * 2.1);
    vec2 hCenter = hBase + vec2(hSway, 0.03 * cos(uTime * 1.15 + float(hi)));
    vec2 dXZ = ro.xz - hCenter;
    float a = dot(rd.xz, rd.xz);
    float b = 2.0 * dot(dXZ, rd.xz);
    float c = dot(dXZ, dXZ) - (pRad * pRad);
    float disc = b * b - 4.0 * a * c;
    if (disc > 0.0 && a > 1e-5) {
      float t0 = (-b - sqrt(disc)) / (2.0 * a);
      if (t0 > 0.02 && t0 < best.t) {
        float hitY = ro.y + rd.y * t0;
        if (hitY < -0.06 && hitY > -0.82) {
          best.t = t0;
          vec2 pXZ = ro.xz + rd.xz * t0;
          best.n = normalize(vec3(pXZ.x - hCenter.x, 0.32 * cos(hitY * 5.5), pXZ.y - hCenter.y));
          float yRel = (hitY - (-0.82)) / 0.76;
          if (pType < 0.5) {
            // Hornwort (붕어마름): dense feathery whorled foliage with bronze-russet apical tips
            vec3 hornBase = vec3(0.06, 0.22, 0.07);
            vec3 hornMid = vec3(0.12, 0.38, 0.14);
            vec3 hornTip = vec3(0.48, 0.20, 0.07);
            vec3 hCol = mix(hornBase, hornMid, smoothstep(0.0, 0.55, yRel));
            best.col = mix(hCol, hornTip, smoothstep(0.55, 1.0, yRel));
            best.sssAmount = 0.92;
            best.sssCol = mix(vec3(0.22, 0.60, 0.18), vec3(0.65, 0.35, 0.12), smoothstep(0.6, 1.0, yRel));
            best.thickness = 0.012;
          } else {
            // Vallisneria (나사말): swaying ribbon tape grass
            float vein = sin((pXZ.x + pXZ.y) * 28.0) * 0.5 + 0.5;
            vec3 stemBase = vec3(0.08, 0.20, 0.06);
            vec3 leafMid = vec3(0.12, 0.38, 0.12);
            vec3 tipSunlit = vec3(0.20, 0.52, 0.16);
            vec3 foliageBase = mix(stemBase, leafMid, smoothstep(0.0, 0.5, yRel));
            foliageBase = mix(foliageBase, tipSunlit, smoothstep(0.5, 1.0, yRel));
            best.col = mix(foliageBase, foliageBase * 1.25, vein * 0.4);
            best.sssAmount = 0.90;
            best.sssCol = vec3(0.25, 0.58, 0.18);
            best.thickness = 0.015;
          }
        }
      }
    }
  }

  // 5. School of Freshwater Minnows & Ricefish (송사리 / 피라미 떼 - Oryzias latipes / Zacco platypus)
  // Active darting schooling minnows swimming in clusters around water lilies and submerged stems
  const int NUM_MINNOWS = 14;
  vec3 minnowBases[NUM_MINNOWS];
  minnowBases[0]  = vec3( 0.42, -0.16, -1.02);
  minnowBases[1]  = vec3( 0.50, -0.18, -0.96);
  minnowBases[2]  = vec3( 0.36, -0.22, -1.10);
  minnowBases[3]  = vec3( 0.62, -0.15, -0.92);
  minnowBases[4]  = vec3( 0.48, -0.26, -1.18);
  minnowBases[5]  = vec3( 0.58, -0.20, -1.06);
  minnowBases[6]  = vec3(-0.62, -0.18, -1.20);
  minnowBases[7]  = vec3(-0.75, -0.16, -1.12);
  minnowBases[8]  = vec3(-0.55, -0.24, -1.32);
  minnowBases[9]  = vec3(-0.82, -0.22, -1.24);
  minnowBases[10] = vec3(-0.68, -0.14, -1.35);
  minnowBases[11] = vec3( 0.15, -0.20, -1.82);
  minnowBases[12] = vec3( 0.08, -0.18, -1.95);
  minnowBases[13] = vec3( 0.22, -0.24, -1.75);

  for (int mi = 0; mi < NUM_MINNOWS; mi++) {
    float mTime = uTime * 2.2 + float(mi) * 1.85;
    vec3 mOffset = vec3(sin(mTime) * 0.065, sin(mTime * 1.8) * 0.025, cos(mTime * 0.9) * 0.055);
    vec3 mPos = minnowBases[mi] + mOffset;
    vec3 mFwd = normalize(vec3(cos(mTime * 0.9), 0.15 * cos(mTime * 1.8), -sin(mTime * 0.9)));

    // 5-7cm slender minnow capsule
    vec3 pa = mPos + mFwd * 0.032;
    vec3 pb = mPos - mFwd * 0.032;
    vec3 outNm;
    float tM = intersectCapsuleLog(ro, rd, pa, pb, 0.009, outNm);
    if (tM > 0.02 && tM < best.t) {
      best.t = tM;
      best.n = outNm;
      // Silvery-emerald translucent minnow with dark dorsal stripe and pearl belly
      float mDorsal = smoothstep(-0.2, 0.5, outNm.y);
      vec3 minnowBack = vec3(0.18, 0.38, 0.22); // Moss emerald back
      vec3 minnowFlank = vec3(0.85, 0.92, 0.90); // Iridescent silver flank
      vec3 minnowCol = mix(minnowFlank, minnowBack, mDorsal);
      // Dark spinal lateral stripe
      float latLine = 1.0 - smoothstep(0.0, 0.15, abs(outNm.y));
      minnowCol = mix(minnowCol, vec3(0.05, 0.08, 0.06), latLine * 0.75);
      best.col = minnowCol;
      best.sssAmount = 0.95;
      best.sssCol = vec3(0.82, 0.95, 0.85);
      best.thickness = 0.010;
    }
  }

  // 6. Freshwater River Snails (우렁이 / 다슬기) on submerged logs & stones
  vec3 snailPos[4];
  snailPos[0] = vec3(-0.45, -0.61, -1.38); // on log 1
  snailPos[1] = vec3( 0.52, -0.62, -1.48); // on log 2
  snailPos[2] = vec3( 0.42, -0.58, -1.02); // on stone 1
  snailPos[3] = vec3(-0.62, -0.59, -1.02); // on stone 2
  for (int sni = 0; sni < 4; sni++) {
    vec3 dSn = ro - snailPos[sni];
    float bSn = dot(rd, dSn);
    float cSn = dot(dSn, dSn) - (0.022 * 0.022);
    float hSn = bSn * bSn - cSn;
    if (hSn > 0.0) {
      float tSn = -bSn - sqrt(hSn);
      if (tSn > 0.02 && tSn < best.t) {
        best.t = tSn;
        vec3 pSn = ro + rd * tSn;
        best.n = normalize(pSn - snailPos[sni]);
        // Dark olive-black spiral shell with slight algae
        best.col = mix(vec3(0.08, 0.07, 0.05), vec3(0.12, 0.16, 0.08), vnoise(pSn.xz * 40.0));
        best.sssAmount = 0.10;
        best.sssCol = vec3(0.15, 0.15, 0.10);
        best.thickness = 0.02;
      }
    }
  }

  return best;
}

// Wave spectrum transformation matrix & harmonics constants for shadow wave sampling
const mat2 M_WAVE = mat2(0.8, -0.6, 0.6, 0.8);
const float SC_WAVE = 0.41, WB_WAVE = 0.10;

// Ambient gentle water ripples (미풍과 표면 장력에 의한 잔잔하고 고요한 자연 수면 잔물결)
vec2 getAmbientRipples(vec2 p, float time, int env, out float hAmb) {
  float t = time * 0.75;
  vec2 d1 = vec2(0.866, 0.500);
  vec2 d2 = vec2(-0.500, 0.866);
  vec2 d3 = vec2(0.382, -0.924);
  vec2 d4 = vec2(-0.924, -0.382);

  float w1 = dot(p, d1) * 3.6 + t * 1.4;
  float w2 = dot(p, d2) * 5.2 - t * 1.7;
  float w3 = dot(p, d3) * 8.4 + t * 2.1;
  float w4 = dot(p, d4) * 13.0 - t * 2.6;

  float amp = (env == 0) ? 0.024 : 0.015;
  vec2 s = vec2(0.0);
  s += d1 * cos(w1) * (amp * 0.55);
  s += d2 * cos(w2) * (amp * 0.40);
  s += d3 * cos(w3) * (amp * 0.28);
  s += d4 * cos(w4) * (amp * 0.18);

  float r = length(p);
  if (r > 0.02) {
    vec2 rDir = p / r;
    float wR = r * 6.2 - t * 1.3;
    s += rDir * cos(wR) * (amp * 0.22 * smoothstep(3.5, 0.4, r));
  }

  hAmb = (sin(w1) * 0.0035 + sin(w2) * 0.0025 + sin(w3) * 0.0018) * (env == 0 ? 1.2 : 0.8);
  return s;
}

// Dynamically project shadows from swimming fish, turtle, and floating debris onto the seabed,
// strictly accounting for water refractive index (Snell's Law IOR = 1.3335),
// depth-dependent caustic convergence/divergence scaling, and surface wave turbulence.
float computeUnderwaterShadow(vec3 Qfloor, vec3 sunVec, float turbFactor) {
  if (uUnderwaterShadowIntensity <= 0.01) return 0.0;

  float totalShadow = 0.0;
  
  // Baseline refracted sunlight direction through flat water surface according to Snell's law (IOR = 1.3335)
  vec3 flatRefractSun = refract(-uSun, vec3(0.0, 1.0, 0.0), 1.0 / IOR);
  float flatSunSlopeY = max(-flatRefractSun.y, 0.06);

  // 1. Fish School Shadows (up to 12 fish)
  if (uFishEnabled == 1) {
    for (int fi = 0; fi < 12; fi++) {
      if (fi >= uFishCount) break;
      vec3 fPos = uFishPos[fi].xyz;
      float fScale = max(uFishPos[fi].w, 0.2);
      vec3 fDir = uFishDir[fi].xyz;
      float fTailPhase = uFishDir[fi].w;

      // Vertical distance from fish down to seabed plane (depth separation)
      float dY = fPos.y - Qfloor.y;
      if (dY > 0.015) {
        // Depth of fish below water surface (y = 0.0)
        float fishDepth = max(-fPos.y, 0.02);

        // Exact surface entry point of sunlight ray that reaches this fish
        vec2 surfEntryPos = fPos.xz - flatRefractSun.xz * (fishDepth / flatSunSlopeY);

        // Surface wave elevation and multi-octave slope at sunlight entry point
        vec4 wA = texture(uSurf, surfEntryPos / uL);
        vec4 wB = texture(uSurf, (M_WAVE * surfEntryPos) / (uL * SC_WAVE) + 0.37);
        vec2 rUV = (surfEntryPos - uRipCenter) / uRipSize + 0.5;
        vec4 wR = texture(uRip, rUV);
        float hAmb;
        vec2 ambSlope = getAmbientRipples(surfEntryPos, uTime, uEnvironment, hAmb);
        vec2 localSlope = wA.yz + WB_WAVE * (transpose(M_WAVE) * wB.yz) + wR.yz + ambSlope;
        float localWaveH = wA.x + WB_WAVE * SC_WAVE * wB.x + wR.x + hAmb;

        // Local dynamic surface normal perturbed by surface turbulence
        vec3 localNorm = normalize(vec3(-localSlope.x, 1.0, -localSlope.y));

        // Exact Snell's law refraction through dynamic turbulent surface
        vec3 turbulentSunRay = refract(-uSun, localNorm, 1.0 / IOR);
        float turbSlopeY = max(-turbulentSunRay.y, 0.06);

        // Dynamic shadow projection displacement on seabed plane:
        // Sunlight ray passes through turbulent wave -> strikes fish -> projects onto floor
        vec2 shadowOffset = (turbulentSunRay.xz / turbSlopeY) * dY;
        vec2 shadowCenter = fPos.xz + shadowOffset;
        vec2 relP = Qfloor.xz - shadowCenter;

        // Fish local 2D coordinate system
        vec2 fwd2D = normalize(vec2(fDir.x, fDir.z));
        vec2 right2D = vec2(-fwd2D.y, fwd2D.x);

        float distLong = dot(relP, fwd2D);
        float distLat = dot(relP, right2D);

        // Optical scale modulation based on water depth and caustic wave curvature lensing
        // Wave crests (converging lens) focus light rays, compressing shadow slightly; wave troughs expand it
        float waveCurv = dot(localSlope, localSlope) * 1.5;
        float causticFocus = 1.0 - clamp(dY * 0.08 * (localWaveH * 1.8 - waveCurv), -0.22, 0.28);
        
        // Depth scaling: as depth increases, refracted beam divergence in water softly expands penumbra
        float halfLen = 0.30 * fScale * causticFocus;
        float normL = distLong / halfLen;

        // Cover snout tip (normL = +1.02) to trailing caudal fin margin (normL = -1.42)
        if (normL > -1.42 && normL < 1.05) {
          // Dynamic undulating spine offset in shadow matching sub-carangiform wave
          float tailWave = sin(fTailPhase - normL * 3.2) * (0.026 * fScale) * max(0.0, -normL);

          // Surface turbulence micro-fluting along body axis:
          // Sunlight rays refracted through ripples create subtle dynamic shimmers along shadow edges
          float turbulenceWarp = sin(normL * 5.0 + dot(localSlope, fwd2D) * 15.0 + uTime * 2.8) * (0.004 * fScale * uChoppiness);
          float latDist = abs(distLat - tailWave + turbulenceWarp);

          // Anatomical width profile precisely matching intersectFish body radii (0.046 * scale) modulated by caustic lensing
          float bodyW;
          if (normL > 0.0) {
            // Snout to belly: smooth streamlined taper
            bodyW = 0.046 * fScale * sqrt(max(0.0, 1.0 - normL * normL * 0.96)) * causticFocus;
            // Subtle pectoral fin silhouette flare near anterior girdle
            float pecFlare = smoothstep(0.12, 0.32, normL) * (1.0 - smoothstep(0.38, 0.68, normL));
            bodyW += pecFlare * 0.020 * fScale;
          } else {
            // Belly to caudal peduncle taper
            float taper = 1.0 + 0.72 * normL;
            bodyW = 0.046 * fScale * max(taper, 0.24) * causticFocus;
            if (normL < -0.85) {
              // Flared caudal fin fan in shadow
              float finFan = clamp((-normL - 0.85) / 0.50, 0.0, 1.0);
              bodyW = mix(bodyW, 0.068 * fScale * causticFocus, finFan * finFan);
            }
          }

          // Depth-dependent optical penumbra based on Snell refracted sun cone and water turbidity
          // Sun angular diameter in water = 0.53 deg / 1.3335 = 0.40 deg
          float turbSpread = length(localSlope) * 0.04 * uChoppiness;
          float penumbra = (0.006 + dY * (0.016 + 0.022 * turbFactor + turbSpread) * uUnderwaterShadowSoftness) * fScale;
          float dLongEdge = max(distLong - halfLen, -distLong - halfLen * 1.40);
          float dEdge = max(latDist - bodyW, dLongEdge);
          
          float fishShadow = 1.0 - smoothstep(-penumbra * 0.4, penumbra * 0.8, dEdge);

          // Distance extinction in water (volume scattering diffuses shadow as fish swims higher)
          fishShadow *= exp(-dY * (0.38 + 0.22 * turbFactor));
          totalShadow += fishShadow * 0.85;
        }
      }
    }
  }

  // 2. Green Sea Turtle Shadow (Snell's Law IOR = 1.3335 & Surface Wave Warping)
  if (uTurtleEnabled == 1) {
    vec3 tPos = uTurtlePos.xyz;
    float tScale = max(uTurtlePos.w, 0.3);
    vec3 tDir = uTurtleDir.xyz;
    float dY = tPos.y - Qfloor.y;
    if (dY > 0.02) {
      float turtleDepth = max(-tPos.y, 0.02);
      vec2 tSurfPos = tPos.xz - flatRefractSun.xz * (turtleDepth / flatSunSlopeY);
      vec4 twA = texture(uSurf, tSurfPos / uL);
      vec4 twB = texture(uSurf, (M_WAVE * tSurfPos) / (uL * SC_WAVE) + 0.37);
      vec2 trUV = (tSurfPos - uRipCenter) / uRipSize + 0.5;
      vec4 twR = texture(uRip, trUV);
      float thAmb;
      vec2 tAmbSlope = getAmbientRipples(tSurfPos, uTime, uEnvironment, thAmb);
      vec2 tSlope = twA.yz + WB_WAVE * (transpose(M_WAVE) * twB.yz) + twR.yz + tAmbSlope;
      vec3 tNorm = normalize(vec3(-tSlope.x, 1.0, -tSlope.y));
      vec3 tTurbSunRay = refract(-uSun, tNorm, 1.0 / IOR);
      float tTurbSlopeY = max(-tTurbSunRay.y, 0.06);

      vec2 tShadowCenter = tPos.xz + (tTurbSunRay.xz / tTurbSlopeY) * dY;
      vec2 tRelP = Qfloor.xz - tShadowCenter;

      vec2 tFwd = normalize(vec2(tDir.x, tDir.z));
      vec2 tRight = vec2(-tFwd.y, tFwd.x);

      float tLong = dot(tRelP, tFwd);
      float tLat = dot(tRelP, tRight);

      // Oval carapace + swept front flippers
      vec2 normCarapace = vec2(tLong / (0.42 * tScale), tLat / (0.34 * tScale));
      float dCarapace = length(normCarapace) - 1.0;

      // Swept flippers
      float flipperSpan = 0.72 * tScale;
      float flipperFwd = 0.12 * tScale - abs(tLat) * 0.35;
      float dFlipper = max(abs(tLat) - flipperSpan, abs(tLong - flipperFwd) - 0.10 * tScale);

      float dTurtle = min(dCarapace * 0.34 * tScale, dFlipper);
      float penumbra = (0.015 + dY * (0.018 + 0.024 * turbFactor) * uUnderwaterShadowSoftness) * tScale;
      float turtleShadow = (1.0 - smoothstep(-penumbra * 0.5, penumbra * 0.8, dTurtle)) * exp(-dY * 0.35);
      totalShadow += turtleShadow * 0.90;
    }
  }

  // 3. Procedural Floating Debris / Water Lily Pads Shadow (from water surface y = 0.0)
  if (uDebrisEnabled == 1 || uEnvironment == 0) {
    float dY = 0.0 - Qfloor.y;
    if (dY > 0.03) {
      for (int di = 0; di < 16; di++) {
        if (di >= uLilyCount) break;
        vec2 padCenter = uLilyData[di].xy;
        vec4 dwA = texture(uSurf, padCenter / uL);
        vec4 dwB = texture(uSurf, (M_WAVE * padCenter) / (uL * SC_WAVE) + 0.37);
        vec2 drUV = (padCenter - uRipCenter) / uRipSize + 0.5;
        vec4 dwR = texture(uRip, drUV);
        float dhAmb;
        vec2 dAmbSlope = getAmbientRipples(padCenter, uTime, uEnvironment, dhAmb);
        vec2 dSlope = dwA.yz + WB_WAVE * (transpose(M_WAVE) * dwB.yz) + dwR.yz + dAmbSlope;
        vec2 padChop = -dSlope * (uChoppiness * 0.048);
        vec2 floatingPadCenter = padCenter + padChop;
        vec3 dNorm = normalize(vec3(-dSlope.x, 1.0, -dSlope.y));
        vec3 dTurbRay = refract(-uSun, dNorm, 1.0 / IOR);
        float dTurbSlopeY = max(-dTurbRay.y, 0.06);

        vec2 dCenter = floatingPadCenter + (dTurbRay.xz / dTurbSlopeY) * dY;
        float distDebris = length(Qfloor.xz - dCenter);
        float rDebris = uLilyData[di].z * 1.02;
        float penumbra = (0.012 + dY * (0.020 + 0.015 * turbFactor) * uUnderwaterShadowSoftness);
        float debShadow = (1.0 - smoothstep(rDebris - penumbra * 0.5, rDebris + penumbra, distDebris)) * 0.65;
        totalShadow += debShadow;
      }
    }
  }

  return clamp(totalShadow, 0.0, 1.0) * uUnderwaterShadowIntensity;
}

// ---------------- Procedural Pond Floor Textures: Sand, Gravel & Velvet Moss ----------------
vec3 getVoronoiGravel(vec2 p) {
  vec2 i_p = floor(p);
  vec2 f_p = fract(p);

  float minDist = 1.0;
  float secondDist = 1.0;
  float stoneSeed = 0.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cellId = i_p + neighbor;
      vec2 rndOffset = vec2(
        hash12(cellId * 1.3 + 0.1) * 0.70 + 0.15,
        hash12(cellId * 2.7 + 3.4) * 0.70 + 0.15
      );
      vec2 pt = neighbor + rndOffset;
      vec2 diff = pt - f_p;

      float aSeed = hash12(cellId + 7.1) * 6.2831;
      float ca = cos(aSeed), sa = sin(aSeed);
      vec2 rotDiff = vec2(diff.x * ca - diff.y * sa, diff.x * sa + diff.y * ca);
      rotDiff.x *= 0.85 + 0.30 * hash12(cellId + 1.9);

      float angle = atan(rotDiff.y, rotDiff.x);
      float harmonic = 1.0 + 0.14 * sin(angle * 3.0 + hash12(cellId + 5.5) * 6.28);
      float d = length(rotDiff) * harmonic;

      if (d < minDist) {
        secondDist = minDist;
        minDist = d;
        stoneSeed = hash12(cellId + 9.8);
      } else if (d < secondDist) {
        secondDist = d;
      }
    }
  }

  float crevice = max(0.0, secondDist - minDist);
  return vec3(minDist, stoneSeed, crevice);
}

float getPondFloorHeightOnly(vec2 p) {
  float bedZone = fbm2(p * 0.38 + vec2(1.7));
  float sandDominance = smoothstep(0.55, 0.28, bedZone);

  vec2 sandFlow = vec2(0.86, 0.50);
  float sRipple = sin(dot(p, sandFlow) * 16.0 + 2.0 * vnoise(p * 1.8));
  float sandH = 0.15 + 0.08 * smoothstep(-0.3, 0.7, sRipple);

  vec2 gUV = p * 4.8;
  vec3 gCell = getVoronoiGravel(gUV);
  float sRad = 0.44 + 0.12 * sin(gCell.y * 15.0);
  float sDome = sqrt(max(0.0, 1.0 - pow(clamp(gCell.x / sRad, 0.0, 1.0), 2.0)));
  float sMask = smoothstep(sRad, sRad - 0.08, gCell.x);
  float gravelH = mix(0.08, 0.52 * sDome, sMask);

  vec3 fineGCell = getVoronoiGravel(p * 11.5 + vec2(4.2));
  float fineDome = sqrt(max(0.0, 1.0 - pow(clamp(fineGCell.x / 0.46, 0.0, 1.0), 2.0)));
  float fineMask = smoothstep(0.46, 0.38, fineGCell.x);
  gravelH = max(gravelH, 0.22 * fineDome * fineMask);

  float baseH = mix(gravelH, sandH, sandDominance * 0.85);

  float mossColony = smoothstep(0.42, 0.78, vnoise(p * 1.4 + vec2(3.2)) * 0.65 + vnoise(p * 3.8) * 0.35);
  float mossCushion = vnoise(p * 7.5) * 0.65 + vnoise(p * 16.0) * 0.35;
  baseH += mossColony * (0.10 + 0.14 * mossCushion);

  float stoneDist = length(fract(p * 0.28 + vec2(0.15, 0.35)) - 0.5);
  float stoneMask = smoothstep(0.26, 0.21, stoneDist);
  baseH = mix(baseH, 0.65, stoneMask * 0.85);

  return baseH;
}

void getPondFloorPattern(vec2 p, out vec3 albedo, out float height, out float specGlint, out float aoVal) {
  float bedZone = fbm2(p * 0.38 + vec2(1.7));
  float sandDominance = smoothstep(0.55, 0.28, bedZone);

  // 1. Fine River Sand (고운 강모래 & 물결 사문 듄)
  vec2 sandFlow = vec2(0.86, 0.50);
  float sRipple = sin(dot(p, sandFlow) * 16.0 + 2.0 * vnoise(p * 1.8));
  float sandCrest = smoothstep(-0.3, 0.7, sRipple);
  float sGrit1 = vnoise(p * 38.0);
  float sGrit2 = vnoise(p * 85.0);
  float sandGrit = sGrit1 * 0.6 + sGrit2 * 0.4;

  vec3 sandPale = vec3(0.72, 0.65, 0.52);
  vec3 sandWarm = vec3(0.58, 0.47, 0.34);
  vec3 sandDarkSilt = vec3(0.36, 0.29, 0.21);

  vec3 sandCol = mix(sandWarm, sandPale, sandCrest * 0.40 + sandGrit * 0.35);
  sandCol = mix(sandCol, sandDarkSilt, (1.0 - sandCrest) * 0.30);
  float sandSparkle = smoothstep(0.94, 0.99, hash12(p * 110.0));
  sandCol += vec3(0.32, 0.30, 0.26) * sandSparkle * 1.5;
  float sandH = 0.15 + 0.08 * sandCrest + 0.03 * sandGrit;

  // 2. Rounded Gravel & River Cobblestones (다채로운 강자갈 & 조약돌)
  vec2 gUV = p * 4.8;
  vec3 gCell = getVoronoiGravel(gUV);
  float sRad = 0.44 + 0.12 * sin(gCell.y * 15.0);
  float sDome = sqrt(max(0.0, 1.0 - pow(clamp(gCell.x / sRad, 0.0, 1.0), 2.0)));
  float sMask = smoothstep(sRad, sRad - 0.08, gCell.x);
  float creviceTight = smoothstep(0.0, 0.18, gCell.z);

  float stoneGrain = vnoise(gUV * 12.0 + vec2(gCell.y * 10.0));
  vec3 basalt = vec3(0.075, 0.080, 0.085) * (0.80 + 0.40 * stoneGrain);
  vec3 slate = vec3(0.12, 0.16, 0.21) * (0.82 + 0.36 * stoneGrain);
  vec3 granite = mix(vec3(0.24, 0.20, 0.16), vec3(0.34, 0.30, 0.26), stoneGrain);
  granite *= (0.75 + 0.35 * smoothstep(0.35, 0.65, hash12(gUV * 28.0 + vec2(gCell.y))));
  vec3 quartz = vec3(0.36, 0.31, 0.22) * (0.88 + 0.25 * stoneGrain);

  vec3 pebbleStone = mix(basalt, slate, smoothstep(0.15, 0.40, gCell.y));
  pebbleStone = mix(pebbleStone, granite, smoothstep(0.42, 0.68, gCell.y));
  pebbleStone = mix(pebbleStone, quartz, smoothstep(0.72, 0.95, gCell.y));

  vec3 fineGCell = getVoronoiGravel(p * 11.5 + vec2(4.2));
  float fineDome = sqrt(max(0.0, 1.0 - pow(clamp(fineGCell.x / 0.46, 0.0, 1.0), 2.0)));
  float fineMask = smoothstep(0.46, 0.38, fineGCell.x);
  vec3 finePebbleCol = mix(vec3(0.18, 0.17, 0.15), vec3(0.30, 0.25, 0.19), fineGCell.y);

  vec3 creviceSilt = mix(vec3(0.040, 0.034, 0.026), vec3(0.068, 0.058, 0.044), vnoise(p * 18.0));
  creviceSilt += vec3(0.20, 0.18, 0.15) * sandSparkle * 0.7;

  vec3 gravelCol = mix(creviceSilt, finePebbleCol, fineMask * 0.85);
  gravelCol = mix(gravelCol, pebbleStone, sMask);

  float gravelH = mix(0.08, 0.52 * sDome, sMask);
  gravelH = max(gravelH, 0.22 * fineDome * fineMask);

  vec3 bedCol = mix(gravelCol, sandCol, sandDominance * 0.85);
  float baseH = mix(gravelH, sandH, sandDominance * 0.85);

  // 3. Velvet Cushion Moss Colonies (비로도 비단이끼 군락 & 착생 조류)
  vec3 mossDeep = vec3(0.045, 0.135, 0.048);
  vec3 mossEmerald = vec3(0.085, 0.260, 0.075);
  vec3 mossGold = vec3(0.220, 0.340, 0.095);
  vec3 mossLushTip = vec3(0.140, 0.380, 0.110);

  float mossFiber = vnoise(p * 34.0 + vec2(vnoise(p * 8.0) * 1.6));
  float cushionMound = vnoise(p * 6.5) * 0.65 + vnoise(p * 15.0) * 0.35;
  vec3 velvetMoss = mix(mossDeep, mossEmerald, mossFiber);
  velvetMoss = mix(velvetMoss, mossGold, smoothstep(0.55, 0.85, cushionMound));
  velvetMoss = mix(velvetMoss, mossLushTip, smoothstep(0.70, 0.95, mossFiber * cushionMound));

  float stoneCrownAdhesion = sMask * sDome * smoothstep(0.48, 0.85, vnoise(p * 2.4 + vec2(1.2)));
  float creviceColony = (1.0 - sMask) * smoothstep(0.58, 0.88, vnoise(p * 2.2 + vec2(3.2))) * 0.38;
  float totalMossMask = clamp(stoneCrownAdhesion * 0.65 + creviceColony, 0.0, 0.70);

  bedCol = mix(bedCol, velvetMoss, totalMossMask);
  baseH += totalMossMask * (0.08 + 0.10 * cushionMound);

  // 4. Sunken Granite Stepping Stones (토비이시 / 飛石)
  float stoneDist = length(fract(p * 0.28 + vec2(0.15, 0.35)) - 0.5);
  float stoneMask = smoothstep(0.26, 0.21, stoneDist);
  vec3 graniteStep = vec3(0.20, 0.19, 0.18) * (0.85 + 0.30 * vnoise(p * 6.5));
  graniteStep = mix(graniteStep, mossEmerald * 0.92, smoothstep(0.13, 0.24, stoneDist) * 0.75);
  bedCol = mix(bedCol, graniteStep, stoneMask * 0.85);
  baseH = mix(baseH, 0.65, stoneMask * 0.85);

  // 5. Submerged Fallen Autumn Leaves (가라앉은 붉은 단풍잎 & 황금 은행잎)
  vec2 fLeafUV = p * 1.8;
  vec2 fLeafCell = floor(fLeafUV);
  float fLeafSeed = hash12(fLeafCell + vec2(7.3));
  if (fLeafSeed > 0.65) {
    vec2 fLeafCenter = (fLeafCell + vec2(hash12(fLeafCell + vec2(2.1)), hash12(fLeafCell + vec2(5.9)))) / 1.8;
    vec2 fLeafRel = p - fLeafCenter;
    float dSubLeaf = length(fLeafRel);
    if (dSubLeaf < 0.08) {
      float aSL = atan(fLeafRel.y, fLeafRel.x) + fLeafSeed * 6.28;
      float lobesSL = 0.052 + 0.024 * (cos(aSL * 5.0) + 0.45 * cos(aSL * 10.0));
      if (dSubLeaf < lobesSL) {
        vec3 mapleSub = (fLeafSeed > 0.82)
          ? mix(vec3(0.85, 0.09, 0.03), vec3(0.98, 0.28, 0.05), hash12(fLeafCell + vec2(11.2)))
          : mix(vec3(0.92, 0.72, 0.08), vec3(0.82, 0.48, 0.04), hash12(fLeafCell + vec2(13.5)));
        float leafAlpha = smoothstep(lobesSL, lobesSL * 0.85, dSubLeaf);
        bedCol = mix(bedCol, mapleSub, leafAlpha * 0.95);
        baseH = mix(baseH, 0.68, leafAlpha * 0.5);
      }
    }
  }

  albedo = bedCol;
  height = baseH;
  specGlint = mix(0.55, 0.06, totalMossMask) * (sMask + sandSparkle * 0.8 + 0.15);
  float creviceAO = mix(0.40, 1.0, creviceTight);
  aoVal = mix(0.45, 1.0, smoothstep(0.08, 0.48, baseH) * creviceAO);
}

// Standard Physically-Based Rendering (PBR) Radiance Evaluation:
// Metallic-Roughness workflow with Cook-Torrance GGX Specular, Schlick Fresnel, and Smith Geometric Attenuation
vec3 evaluatePBR(
  vec3 albedo,
  float roughness,
  float metallic,
  float ao,
  vec3 N,
  vec3 V,
  vec3 L,
  vec3 sunCol,
  vec3 ambientLight,
  float wetness
) {
  // Natural materials: roughness modulation by liquid wetness keeps stone matte-satin, never a mirror puddle
  roughness = mix(roughness, 0.45, wetness * 0.70);
  float alpha = max(0.08, roughness * roughness);
  float alpha2 = alpha * alpha;

  vec3 H = normalize(V + L);
  float NdotL = clamp(dot(N, L), 0.0, 1.0);
  float NdotV = clamp(dot(N, V), 0.001, 1.0);
  float NdotH = clamp(dot(N, H), 0.0, 1.0);
  float VdotH = clamp(dot(V, H), 0.0, 1.0);

  // F0: Dielectrics (leaves, stone, moss, bark) = 0.025, Metals = albedo
  vec3 F0 = mix(vec3(0.025), albedo, metallic);
  // Roughness-attenuated Fresnel reflection (strictly prevents water-like grazing gloss on rough stone/leaves/moss/bark)
  vec3 F = F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - VdotH, 0.0, 1.0), 5.0);

  // GGX Normal Distribution Function D
  float dDenom = (NdotH * NdotH * (alpha2 - 1.0) + 1.0);
  float D = alpha2 / (PI * dDenom * dDenom);

  // Smith Height-Correlated G2
  float k = alpha * 0.5;
  float gL = NdotL / (NdotL * (1.0 - k) + k);
  float gV = NdotV / (NdotV * (1.0 - k) + k);
  float G = gL * gV;

  // Specular BRDF - gently scaled for non-metals so foliage/stone stays completely matte without harsh white glints
  vec3 specular = (D * G * F) / (4.0 * NdotL * NdotV + 1e-4);
  if (metallic < 0.1) {
    specular *= mix(0.18, 0.35, wetness);
  }

  // Diffuse energy conservation (matte organic diffuse scattering)
  vec3 kD = (vec3(1.0) - F) * (1.0 - metallic);
  vec3 diffuse = kD * (albedo / PI);

  // Direct sun radiance
  vec3 directRadiance = (diffuse + specular) * sunCol * NdotL;

  // Ambient IBL-like skylight
  vec3 ambientRadiance = albedo * ambientLight * ao;

  // Wet stone subtle darkening and soft satin sheen (no liquid puddle mirror reflection)
  if (wetness > 0.01) {
    float wetSheen = pow(max(dot(N, H), 0.0), 12.0) * wetness * 0.12;
    directRadiance += sunCol * wetSheen;
  }

  return directRadiance + ambientRadiance;
}

/// ---------------- True 3D Volumetric Zen Garden Signed Distance Field (SDF) ----------------
// High-fidelity Japanese stroll garden landscape (Kaiyushiki Teien / 회유식 정원):
// Detailed botanical architecture: multi-tiered needle clusters, cascading weeping maple foliage,
// dense Karikomi azalea mounds, intricate supporting branchlets, and textured grass/moss.

// Mathematically isotropic distance metric for rounded river boulders
float sdNaturalStone(vec3 p, vec3 c, vec3 r) {
  vec3 q = (p - c) / r;
  float d = (length(q) - 1.0) * min(r.x, min(r.y, r.z));
  return d + 0.010 * (vnoise(p * 8.5) - 0.5);
}

// Multi-tiered sculpted cloud pine needle rosette SDF (타마마키 솔잎 송이 / Matsu-ba rosettes)
// Individual needle clusters radiating outward with open air gaps exposing wooden supporting branchlets
float sdPineCloudFoliage(vec3 p, vec3 c, vec3 r) {
  vec3 q = (p - c) / r;
  float dBase = length(q) - 1.0;
  
  // Radial pine needle spine clusters (방사상으로 뻗어나온 솔잎 가시 다발)
  float phi = atan(q.z, q.x);
  float rXZ = length(q.xz);
  float theta = atan(rXZ, max(0.001, q.y + 0.3));
  
  float needleSpines = 0.055 * (sin(phi * 12.0) * sin(theta * 9.0));
  float needleFibers = 0.035 * sin(phi * 24.0 + theta * 16.0);
  
  // Stepped horizontal needle tiers with deep shadowy gaps (층층이 갈라진 솔잎 층)
  float tiers = 0.038 * (0.5 + 0.5 * cos(q.y * 24.0));
  
  // Hollow underside leaves wooden branch underneath clearly visible
  float dFlatBottom = -q.y - 0.20;
  
  float dPad = max(dBase, dFlatBottom) * min(r.x, min(r.y, r.z));
  return dPad - needleSpines - needleFibers - tiers;
}

// Cascading weeping Japanese maple leaf cluster SDF (수양 단풍잎 층 클러스터 / Shidare Momiji)
// 5-lobed star palmate leaves with weeping cascading curves and exposed cascading branchlets
float sdMapleCanopyFoliage(vec3 p, vec3 c, vec3 r) {
  vec3 q = (p - c) / r;
  float dDome = length(vec3(q.x, q.y * 1.6, q.z)) - 0.90;
  
  // 5-pointed palmate star leaf geometry (5갈래 별 모양 단풍잎 대칭성)
  float a = atan(q.z, q.x);
  float star5 = 0.075 * pow(max(0.0, cos(a * 5.0)), 1.35);
  float subSerration = 0.028 * sin(a * 15.0 + length(q.xz) * 35.0);
  
  // Drooping cascading curve along weeping branchlet
  float weepingDroop = 0.050 * (length(q.xz) * length(q.xz) - q.y);
  
  // Hollow underside leaves weeping wooden branch visible underneath
  float hollowUnder = -q.y - 0.12;
  
  float dLeaf = max(dDome, hollowUnder) * min(r.x, min(r.y, r.z));
  return dLeaf - star5 - subSerration + weepingDroop;
}

// Clipped Satsuki azalea Karikomi evergreen cushion mound SDF (사츠키 왜철쭉)
// Dense rounded cushion with fine clipped leaf mosaics
float sdAzaleaClippedMound(vec3 p, vec3 c, vec3 r) {
  vec3 q = (p - c) / r;
  float dCushion = (length(q) - 1.0) * min(r.x, min(r.y, r.z));
  float leafClusters = 0.045 * abs(sin(p.x * 18.0) * sin(p.z * 18.0)) + 0.024 * sin(p.y * 32.0);
  float fineLeaves = 0.014 * (sin(p.x * 55.0) * cos(p.z * 55.0));
  return dCushion - leafClusters - fineLeaves;
}

// Shoreline Grass & Sedge Blade Cluster SDF (수변 사초 및 잔디 뾰족한 풀잎 군락)
float sdGrassTussock(vec3 p, vec3 c, float r, float h) {
  vec3 q = p - c;
  float taper = 1.0 - clamp(q.y / h, 0.0, 0.85);
  float dRadial = length(q.xz) - r * taper;
  float dHeight = max(q.y - h, -q.y);
  float a = atan(q.z, q.x);
  float bladeRelief = 0.038 * abs(sin(a * 10.0 + q.y * 16.0));
  return max(dRadial, dHeight) - bladeRelief;
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// Procedural High-Resolution Alpha Cutout Mask for Foliage & Twigs (나뭇잎/잔가지 알파 컷아웃 기법)
// Evaluates negative space air gaps between individual needles, leaf lobes, and twigs
// Returns 1.0 = solid opaque foliage, 0.0 = air gap (discarded/cutout)
float getFoliageCutoutAlpha(int matId, vec3 p) {
  if (matId == 9) {
    // Sculptural Pine Needles (흑송 솔잎 다발 알파 컷아웃)
    // Individual needle spines with open air gaps between fascicles
    float n1 = sin(p.x * 65.0) * sin(p.z * 65.0 + p.y * 30.0);
    float n2 = sin(p.x * 130.0 + p.z * 70.0) * cos(p.y * 85.0);
    float needleMask = n1 * 0.60 + n2 * 0.40;
    // Cut out air gaps between needle spines
    return smoothstep(-0.22, 0.18, needleMask);
  } else if (matId == 10) {
    // Japanese Maple Leaves (수양 단풍잎 5갈래 별 모양 알파 컷아웃)
    // Cut out deep sinuses between palmate star lobes and serrated margins
    float l1 = sin(p.x * 45.0 + p.z * 35.0) * cos(p.z * 45.0 - p.x * 35.0);
    float l2 = sin(p.x * 90.0 + p.y * 70.0 + p.z * 90.0);
    float leafMask = l1 * 0.65 + l2 * 0.35;
    return smoothstep(-0.18, 0.22, leafMask);
  } else if (matId == 7) {
    // Shoreline Grass & Iris Blades
    float g1 = abs(sin(p.x * 35.0 + p.z * 35.0));
    return smoothstep(0.18, 0.45, g1);
  }
  return 1.0;
}

float mapGarden3D(vec3 p, out int matId, out float wetFactor, out float aoFactor) {
  matId = 5; // Default: velvet moss
  wetFactor = 0.0;
  aoFactor = 1.0;

  float dWater = getPondWaterDist(p.xz);

  // 1. Smooth Continuous 3D Topography: Catmull-Rom Watercourse -> Shoreline -> Moss Knolls
  // At dWater = 0 (the waterline), hBank starts smoothly from 0.0 with continuous slope
  float hBank = 0.06 * smoothstep(0.0, 0.45, dWater)
              + 0.16 * smoothstep(0.45, 2.2, dWater)
              + 0.36 * smoothstep(2.2, 5.8, dWater);
  // Organic velvet cushion moss mounds & fine tuft micro-relief (Saiho-ji moss garden texture)
  hBank += 0.035 * (vnoise(p.xz * 2.8) - 0.5) 
         + 0.020 * (vnoise(p.xz * 7.5) - 0.5) 
         + 0.008 * (vnoise(p.xz * 22.0) - 0.5);

  // Micro-blade grass texture across garden lawn & moss
  float grassBladeRelief = 0.015 * sin(p.x * 40.0 + p.z * 18.0) * sin(p.z * 40.0 - p.x * 18.0);
  hBank += grassBladeRelief * smoothstep(0.3, 1.5, dWater);

  // Marginal Japanese water iris in shallow waterline
  float irisN = vnoise(p.xz * 6.5);
  if (irisN > 0.70 && dWater >= 0.08 && dWater <= 0.40) {
    hBank += 0.16 * smoothstep(0.70, 0.88, irisN);
  }

  float dTerrain;
  if (dWater < 0.0) {
    // Over pond water: terrain is strictly submerged under the water surface!
    // No terrain exists in the air above water, keeping the water surface completely clear!
    dTerrain = length(vec2(-dWater, max(0.0, p.y + 0.01))) + 0.05;
  } else {
    // On land: smooth sloped bank surface with true 3D Euclidean distance
    float dh = 0.15;
    dTerrain = (p.y - hBank) / sqrt(1.0 + dh * dh);
    dTerrain = max(dTerrain, -dWater - 0.02);
  }

  float dMin = dTerrain;

  if (dWater < 1.35) {
    matId = 2; // Shirakawa fine white gravel with combed sand ripples (사문 / 砂紋)
  } else {
    matId = 5; // Velvet cushion moss garden (비단이끼)
  }

  // Fallen autumn maple leaves scattered on moss & gravel (오치바 落葉)
  float dMapleDist = length(p.xz - vec2(1.85, -6.15));
  float leafN = vnoise(p.xz * 14.0) * smoothstep(4.2, 0.5, dMapleDist);
  if (leafN > 0.62 && dWater > 0.15 && p.y < hBank + 0.04) {
    matId = 14;
  }

  // 2. Curved South Viewing Veranda Deck (삼나무 툇마루 관람 데크)
  float zDeckFront = 0.38 + 0.04 * (p.x * p.x);
  if (p.z > zDeckFront) {
    float dDeckTop = max(p.y - 0.16, max(-0.02 - p.y, zDeckFront - p.z));
    float dDeckBeam = length(vec2(p.y - 0.08, p.z - zDeckFront)) - 0.085;
    float dDeck = min(dDeckTop, dDeckBeam);
    if (dDeck < dMin) {
      dMin = dDeck;
      matId = 3; // Hinoki cedar wood
      aoFactor = 0.90;
    }
  }

  // 3. 10 Shoreline Revetment Boulders along the true perimeter (3D 호안석 / 護岸石)
  // Naturally water-smoothed, balanced 3D river boulders (width ~1.1m, height ~0.65m, depth ~0.95m)
  // Physically realistic 3D proportions (no pillar stretch or squashed anisotropic artifacts)
  vec3 rockPos[10]; vec3 rockR[10];
  rockPos[0] = vec3( 1.60, 0.14,  0.15); rockR[0] = vec3(0.52, 0.32, 0.46); // SE bank near deck
  rockPos[1] = vec3(-1.50, 0.15,  0.20); rockR[1] = vec3(0.54, 0.34, 0.48); // SW bank near deck
  rockPos[2] = vec3(-3.15, 0.16, -1.70); rockR[2] = vec3(0.56, 0.35, 0.50); // West bank
  rockPos[3] = vec3(-4.20, 0.18, -3.40); rockR[3] = vec3(0.62, 0.38, 0.54); // West promontory
  rockPos[4] = vec3(-3.55, 0.16, -6.05); rockR[4] = vec3(0.54, 0.34, 0.48); // NW stream outlet mouth
  rockPos[5] = vec3(-0.45, 0.16, -9.15); rockR[5] = vec3(0.56, 0.35, 0.50); // North back revetment
  rockPos[6] = vec3( 2.25, 0.18, -8.55); rockR[6] = vec3(0.58, 0.36, 0.52); // NE stream bank
  rockPos[7] = vec3( 3.85, 0.16, -5.45); rockR[7] = vec3(0.54, 0.34, 0.48); // East lantern promontory
  rockPos[8] = vec3( 4.25, 0.15, -3.15); rockR[8] = vec3(0.50, 0.32, 0.46); // East bank
  rockPos[9] = vec3( 2.80, 0.14, -1.20); rockR[9] = vec3(0.48, 0.30, 0.42); // East stepping stone shore

  for (int bi = 0; bi < 10; bi++) {
    float dRock = sdNaturalStone(p, rockPos[bi], rockR[bi]);
    if (dRock < dMin) {
      dMin = dRock;
      matId = 1; // Blue-schist boulder
      wetFactor = (p.y < 0.10) ? clamp((0.10 - p.y) / 0.12, 0.0, 1.0) : 0.0;
      aoFactor = mix(0.72, 1.0, clamp(length(p.xz - rockPos[bi].xz) / rockR[bi].x, 0.0, 1.0));
    }
  }

  // 4. 5 Clipped Satsuki Azalea Karikomi Evergreen Mounds on land (3D 사츠키 왜철쭉)
  // Volumetric rounded evergreen cushion shrubs with authentic botanical proportions
  vec3 azaleaPos[5]; vec3 azaleaR[5];
  azaleaPos[0] = vec3(-2.05, 0.20,  0.50); azaleaR[0] = vec3(0.58, 0.38, 0.54); // Behind SW bank
  azaleaPos[1] = vec3(-3.75, 0.24, -1.90); azaleaR[1] = vec3(0.62, 0.40, 0.58); // West moss mound
  azaleaPos[2] = vec3( 2.20, 0.20,  0.45); azaleaR[2] = vec3(0.54, 0.36, 0.50); // Behind SE bank
  azaleaPos[3] = vec3( 4.50, 0.24, -4.90); azaleaR[3] = vec3(0.60, 0.40, 0.56); // East lantern hill
  azaleaPos[4] = vec3( 2.90, 0.26, -8.90); azaleaR[4] = vec3(0.64, 0.42, 0.60); // North garden knoll

  for (int ai = 0; ai < 5; ai++) {
    float dAz = sdAzaleaClippedMound(p, azaleaPos[ai], azaleaR[ai]);
    if (dAz < dMin) {
      dMin = dAz;
      matId = 13; // Satsuki azalea
      aoFactor = 0.85;
    }
  }

  // 5. Traditional Tsukubai Stone Water Basin, Bamboo Kakehi & Ladle (3D 쓰쿠바이 & 카케히 & 히샤쿠)
  vec3 cTsuk = vec3(-3.45, 0.16, -1.85);
  float dTsukOuter = length(p.xz - cTsuk.xz) - 0.36;
  float dTsukBox = max(dTsukOuter, max(p.y - 0.34, -(p.y - 0.02))) - 0.02;
  float dTsukBowl = length(p.xz - cTsuk.xz) - 0.22;
  float dTsukWater = max(dTsukBowl, max(p.y - 0.24, -(p.y - 0.14)));
  if (dTsukBox < dMin) {
    dMin = dTsukBox;
    matId = 12; // Granite basin
    aoFactor = 0.85;
    if (dTsukWater < 0.02) {
      wetFactor = 1.0;
    }
  }

  // Bamboo Kakehi spout pipe dripping into basin
  vec3 kakehiA = vec3(-3.85, 0.34, -1.85);
  vec3 kakehiB = vec3(-3.50, 0.34, -1.85);
  float dKakehi = sdCapsule(p, kakehiA, kakehiB, 0.035);
  if (dKakehi < dMin) {
    dMin = dKakehi;
    matId = 11; // Polished green bamboo
    aoFactor = 0.90;
  }

  // Bamboo ladle (Hishaku) resting across stone rim
  vec3 hishakuA = vec3(-3.45, 0.33, -1.92);
  vec3 hishakuB = vec3(-3.45, 0.33, -1.78);
  float dHishaku = sdCapsule(p, hishakuA, hishakuB, 0.015);
  if (dHishaku < dMin) {
    dMin = dHishaku;
    matId = 15; // Bamboo ladle
  }

  // 6. Authentic 6-Tier Kasuga Granite Stone Lantern (3D 카스가 석등 / 春日燈籠)
  // Freestanding 3D sculpture on east terrace at (3.95, -5.45)
  vec2 lanXZ = vec2(3.95, -5.45);
  float rLanP = length(p.xz - lanXZ);
  if (rLanP < 0.85 && p.y >= -0.05 && p.y <= 1.65) {
    float aLan = atan(p.z - lanXZ.y, p.x - lanXZ.x);
    float hexCos = cos(aLan - round(aLan / 1.047197) * 1.047197);
    float rHex = rLanP * hexCos;

    // Tier 1 Base: stepped hexagonal pedestal (0.00 to 0.18)
    float dBase = max(rHex - 0.55, max(p.y - 0.18, -p.y));
    // Tier 2 Column: cylindrical pillar (0.18 to 0.72)
    float dCol = max(rLanP - 0.14, max(p.y - 0.72, 0.18 - p.y));
    // Tier 3 Middle Platform: hexagonal slab (0.72 to 0.85)
    float dPlat = max(rHex - 0.40, max(p.y - 0.85, 0.72 - p.y));
    // Tier 4 Fire Chamber: hollowed chamber (0.85 to 1.08) with lattice window openings!
    float dChamberOuter = max(rHex - 0.30, max(p.y - 1.08, 0.85 - p.y));
    // Window cutouts on 4 sides
    float winMask = abs(sin(2.0 * aLan));
    if (winMask > 0.45 && p.y > 0.88 && p.y < 1.05 && rLanP < 0.28) {
      dChamberOuter = max(dChamberOuter, 0.04);
    }
    // Tier 5 Pagoda Roof: flared hexagonal cap (1.08 to 1.34)
    float roofR = mix(0.55, 0.16, clamp((p.y - 1.08) / 0.26, 0.0, 1.0));
    float dRoof = max(rHex - roofR, max(p.y - 1.34, 1.08 - p.y));
    // Tier 6 Jewel Finial: sphere at y = 1.44
    float dJewel = length(p - vec3(lanXZ.x, 1.44, lanXZ.y)) - 0.12;

    float dLantern = min(dBase, min(dCol, min(dPlat, min(dChamberOuter, min(dRoof, dJewel)))));
    if (dLantern < dMin) {
      dMin = dLantern;
      matId = 6; // Granite lantern
      aoFactor = 0.88;
    }
  }

  // 7. Sculptural Japanese Black Pine (3D 조형 흑송 고목 / Kuromatsu / 黑松)
  // Prominently placed on the west shoreline promontory right across from the camera.
  // The muscular S-curved weathered trunk and skeletal horizontal boughs are fully EXPOSED and visible,
  // holding up fine, discrete pine needle rosettes at branch tips rather than clumping into dough blobs!
  vec3 pineRootA = vec3(-2.15, 0.08, -2.15);
  float dRoot1 = sdCapsule(p, pineRootA, vec3(-1.75, 0.02, -1.90), 0.14); // Root gripping water rock
  float dRoot2 = sdCapsule(p, pineRootA, vec3(-2.55, 0.12, -2.40), 0.12); // Root spreading into moss
  float dRoot3 = sdCapsule(p, pineRootA, vec3(-2.10, 0.05, -2.60), 0.11);
  float dRoots = min(dRoot1, min(dRoot2, dRoot3));

  // Muscular S-curved ancient trunk
  vec3 pBase3D = pineRootA;
  vec3 pMid3D  = vec3(-1.85, 0.75, -2.05);
  vec3 pLean3D = vec3(-1.50, 1.45, -1.90);
  vec3 pApex3D = vec3(-1.25, 2.05, -1.80);
  float dTrunkSeg1 = sdCapsule(p, pBase3D, pMid3D, 0.16);
  float dTrunkSeg2 = sdCapsule(p, pMid3D, pLean3D, 0.12);
  float dTrunkSeg3 = sdCapsule(p, pLean3D, pApex3D, 0.085);
  float barkFurrow3D = 0.016 * (vnoise(vec3(p.x * 24.0, p.y * 14.0, p.z * 24.0)) - 0.5);
  float dTrunk3D = min(dRoots, min(dTrunkSeg1, min(dTrunkSeg2, dTrunkSeg3))) + barkFurrow3D;
  if (dTrunk3D < dMin) {
    dMin = dTrunk3D;
    matId = 8; // Pine bark
    aoFactor = 0.70;
  }

  // 4 Primary Horizontal Boughs extending outwards from trunk
  vec3 boughA[4]; vec3 boughB[4]; float boughR3D[4];
  boughA[0] = vec3(-1.85, 0.75, -2.05); boughB[0] = vec3(-1.20, 0.82, -1.65); boughR3D[0] = 0.065; // Low water-sweeping bough
  boughA[1] = vec3(-1.80, 1.05, -2.00); boughB[1] = vec3(-2.55, 1.15, -2.40); boughR3D[1] = 0.060; // West balance bough
  boughA[2] = vec3(-1.55, 1.40, -1.95); boughB[2] = vec3(-0.95, 1.45, -1.75); boughR3D[2] = 0.055; // Mid overhanging water bough
  boughA[3] = vec3(-1.45, 1.65, -1.90); boughB[3] = vec3(-1.75, 1.78, -2.55); boughR3D[3] = 0.050; // Upper back bough

  for (int bi = 0; bi < 4; bi++) {
    float dBough = sdCapsule(p, boughA[bi], boughB[bi], boughR3D[bi]);
    if (dBough < dMin) {
      dMin = dBough;
      matId = 8; // Branch bark
      aoFactor = 0.65;
    }
  }

  // 12 Secondary & Tertiary Branch Twigs (흑송 세부 가지와 미세 잔가지 지오메트리 세분화)
  vec3 twigA[12]; vec3 twigB[12]; float twigR[12];
  twigA[0] = vec3(-1.20, 0.82, -1.65); twigB[0] = vec3(-0.92, 0.94, -1.50); twigR[0] = 0.038;
  twigA[1] = vec3(-1.20, 0.82, -1.65); twigB[1] = vec3(-1.38, 0.90, -1.42); twigR[1] = 0.035;
  twigA[2] = vec3(-2.55, 1.15, -2.40); twigB[2] = vec3(-2.82, 1.25, -2.52); twigR[2] = 0.035;
  twigA[3] = vec3(-2.55, 1.15, -2.40); twigB[3] = vec3(-2.45, 1.30, -2.25); twigR[3] = 0.032;
  twigA[4] = vec3(-0.95, 1.45, -1.75); twigB[4] = vec3(-0.72, 1.55, -1.65); twigR[4] = 0.035;
  twigA[5] = vec3(-0.95, 1.45, -1.75); twigB[5] = vec3(-1.12, 1.55, -1.55); twigR[5] = 0.032;
  twigA[6] = vec3(-1.75, 1.78, -2.55); twigB[6] = vec3(-1.60, 1.88, -2.75); twigR[6] = 0.032;
  twigA[7] = vec3(-1.25, 2.05, -1.80); twigB[7] = vec3(-1.15, 2.20, -1.70); twigR[7] = 0.036;
  // Additional tertiary branchlets extending into needle clusters
  twigA[8] = vec3(-0.92, 0.94, -1.50); twigB[8] = vec3(-0.85, 1.02, -1.45); twigR[8] = 0.024;
  twigA[9] = vec3(-1.38, 0.90, -1.42); twigB[9] = vec3(-1.45, 0.98, -1.35); twigR[9] = 0.022;
  twigA[10] = vec3(-0.72, 1.55, -1.65); twigB[10] = vec3(-0.65, 1.62, -1.60); twigR[10] = 0.024;
  twigA[11] = vec3(-2.82, 1.25, -2.52); twigB[11] = vec3(-2.92, 1.32, -2.58); twigR[11] = 0.022;

  for (int ti = 0; ti < 12; ti++) {
    float dTwig = sdCapsule(p, twigA[ti], twigB[ti], twigR[ti]);
    if (dTwig < dMin) {
      dMin = dTwig;
      matId = 8;
      aoFactor = 0.60;
    }
  }

  // 8 Discrete Fine Pine Needle Rosette Tufts (타마마키 솔잎 송이)
  // Positioned exclusively at branchlet extremities so the muscular trunk and limbs remain visible!
  vec3 pinePadC[8]; vec3 pinePadR[8];
  pinePadC[0] = vec3(-0.90, 0.98, -1.48); pinePadR[0] = vec3(0.28, 0.14, 0.26); // Low water-sweeping cluster
  pinePadC[1] = vec3(-1.42, 0.95, -1.38); pinePadR[1] = vec3(0.25, 0.13, 0.24); // Front water cluster
  pinePadC[2] = vec3(-2.88, 1.28, -2.55); pinePadR[2] = vec3(0.27, 0.14, 0.25); // West balance cluster
  pinePadC[3] = vec3(-2.45, 1.35, -2.22); pinePadR[3] = vec3(0.24, 0.12, 0.23); // West inner cluster
  pinePadC[4] = vec3(-0.68, 1.58, -1.62); pinePadR[4] = vec3(0.26, 0.13, 0.25); // Mid water overhanging cluster
  pinePadC[5] = vec3(-1.12, 1.60, -1.50); pinePadR[5] = vec3(0.25, 0.13, 0.24); // Mid inner cluster
  pinePadC[6] = vec3(-1.58, 1.92, -2.78); pinePadR[6] = vec3(0.26, 0.13, 0.25); // Back tier cluster
  pinePadC[7] = vec3(-1.12, 2.25, -1.68); pinePadR[7] = vec3(0.28, 0.14, 0.26); // Crown apex rosette

  for (int ci = 0; ci < 8; ci++) {
    float dPad = sdPineCloudFoliage(p, pinePadC[ci], pinePadR[ci]);
    if (dPad < dMin) {
      dMin = dPad;
      matId = 9; // Cloud pine needles
      aoFactor = mix(0.72, 1.0, clamp(length(p.xz - pinePadC[ci].xz) / pinePadR[ci].x, 0.0, 1.0));
    }
  }

  // 8. Weeping Crimson Autumn Maple (3D 수양 붉은 단풍나무 / Shidare Momiji)
  // Prominently placed on the east bank near stepping stones and stone lantern.
  // Elegant trunk and cascading weeping branches cascade over the water,
  // adorned with delicate 5-lobed star palmate leaf tiers exposing cascading branches beneath!
  vec3 mapleTrunkA = vec3( 2.40, 0.10, -3.00);
  vec3 mapleTrunkB = vec3( 2.10, 0.85, -2.75);
  vec3 mapleTrunkC = vec3( 1.75, 1.55, -2.55);
  vec3 mapleApex   = vec3( 1.45, 1.95, -2.40);
  float dMapleTrunk1 = sdCapsule(p, mapleTrunkA, mapleTrunkB, 0.14);
  float dMapleTrunk2 = sdCapsule(p, mapleTrunkB, mapleTrunkC, 0.10);
  float dMapleTrunk3 = sdCapsule(p, mapleTrunkC, mapleApex,   0.075);
  float dMapleTrunk = min(dMapleTrunk1, min(dMapleTrunk2, dMapleTrunk3));
  if (dMapleTrunk < dMin) {
    dMin = dMapleTrunk;
    matId = 8; // Maple trunk bark
    aoFactor = 0.70;
  }

  // 5 Cascading Weeping Boughs & Drooping Twigs (수양 단풍 큰 가지와 물가로 처진 가지)
  vec3 mBoughA[5]; vec3 mBoughB[5]; float mBoughR[5];
  mBoughA[0] = mapleTrunkB; mBoughB[0] = vec3(1.55, 1.15, -2.40); mBoughR[0] = 0.055; // Water cascade bough
  mBoughA[1] = mapleTrunkB; mBoughB[1] = vec3(2.85, 1.20, -3.15); mBoughR[1] = 0.050; // East terrace bough
  mBoughA[2] = mapleTrunkC; mBoughB[2] = vec3(1.35, 1.65, -2.60); mBoughR[2] = 0.045; // Mid canopy bough
  mBoughA[3] = mapleTrunkC; mBoughB[3] = vec3(1.95, 1.85, -2.35); mBoughR[3] = 0.045; // Upper east bough
  mBoughA[4] = mapleApex;   mBoughB[4] = vec3(1.20, 2.05, -2.25); mBoughR[4] = 0.040; // Crown arch

  for (int mbi = 0; mbi < 5; mbi++) {
    float dMB = sdCapsule(p, mBoughA[mbi], mBoughB[mbi], mBoughR[mbi]);
    if (dMB < dMin) {
      dMin = dMB;
      matId = 8;
      aoFactor = 0.65;
    }
  }

  // 8 Pendulous drooping twigs cascading towards water and rocks (수양 단풍 드리워진 잔가지 지오메트리 세분화)
  vec3 mTwigA[8]; vec3 mTwigB[8]; float mTwigR[8];
  mTwigA[0] = vec3(1.55, 1.15, -2.40); mTwigB[0] = vec3(1.25, 0.72, -2.18); mTwigR[0] = 0.028; // Drooping over water
  mTwigA[1] = vec3(1.55, 1.15, -2.40); mTwigB[1] = vec3(1.70, 0.85, -2.15); mTwigR[1] = 0.026;
  mTwigA[2] = vec3(2.85, 1.20, -3.15); mTwigB[2] = vec3(3.05, 0.90, -3.25); mTwigR[2] = 0.028;
  mTwigA[3] = vec3(1.35, 1.65, -2.60); mTwigB[3] = vec3(1.05, 1.35, -2.45); mTwigR[3] = 0.028;
  // Additional delicate weeping branchlets
  mTwigA[4] = vec3(1.25, 0.72, -2.18); mTwigB[4] = vec3(1.15, 0.58, -2.10); mTwigR[4] = 0.018; // Close water touch
  mTwigA[5] = vec3(1.70, 0.85, -2.15); mTwigB[5] = vec3(1.65, 0.68, -2.08); mTwigR[5] = 0.018;
  mTwigA[6] = vec3(1.95, 1.85, -2.35); mTwigB[6] = vec3(1.90, 1.65, -2.25); mTwigR[6] = 0.022;
  mTwigA[7] = vec3(1.20, 2.05, -2.25); mTwigB[7] = vec3(1.10, 1.85, -2.18); mTwigR[7] = 0.020;

  for (int mti = 0; mti < 8; mti++) {
    float dMT = sdCapsule(p, mTwigA[mti], mTwigB[mti], mTwigR[mti]);
    if (dMT < dMin) {
      dMin = dMT;
      matId = 8;
      aoFactor = 0.60;
    }
  }

  // 7 Cascading 5-Pointed Star Maple Leaf Clusters (수양 단풍잎 층 클러스터)
  vec3 mapleC[7]; vec3 mapleR[7];
  mapleC[0] = vec3( 1.20, 0.70, -2.15); mapleR[0] = vec3(0.28, 0.12, 0.26); // Weeping closest to water
  mapleC[1] = vec3( 1.68, 0.82, -2.12); mapleR[1] = vec3(0.26, 0.12, 0.25); // Mid-lower water cascade
  mapleC[2] = vec3( 1.50, 1.18, -2.38); mapleR[2] = vec3(0.28, 0.13, 0.26); // Main cascade bough
  mapleC[3] = vec3( 1.02, 1.32, -2.42); mapleR[3] = vec3(0.26, 0.12, 0.25); // Mid drooping cluster
  mapleC[4] = vec3( 3.08, 0.88, -3.28); mapleR[4] = vec3(0.27, 0.13, 0.26); // East low terrace
  mapleC[5] = vec3( 1.95, 1.88, -2.32); mapleR[5] = vec3(0.26, 0.12, 0.25); // Upper east cluster
  mapleC[6] = vec3( 1.18, 2.08, -2.22); mapleR[6] = vec3(0.28, 0.13, 0.27); // Summit crown arch

  for (int mi = 0; mi < 7; mi++) {
    float dM = sdMapleCanopyFoliage(p, mapleC[mi], mapleR[mi]);
    if (dM < dMin) {
      dMin = dM;
      matId = 10; // Weeping autumn maple
      aoFactor = mix(0.70, 1.0, clamp(length(p.xz - mapleC[mi].xz) / mapleR[mi].x, 0.0, 1.0));
    }
  }

  // Shoreline Grass Blade Tussocks (수변 사초 및 뾰족한 풀잎 군락)
  vec3 grassPos[4]; float grassR[4]; float grassH[4];
  grassPos[0] = vec3(-1.45, 0.02, -1.25); grassR[0] = 0.18; grassH[0] = 0.22;
  grassPos[1] = vec3(-2.35, 0.05, -1.65); grassR[1] = 0.20; grassH[1] = 0.26;
  grassPos[2] = vec3( 0.45, 0.02, -0.45); grassR[2] = 0.16; grassH[2] = 0.20;
  grassPos[3] = vec3( 2.15, 0.04, -2.35); grassR[3] = 0.18; grassH[3] = 0.24;

  for (int gi = 0; gi < 4; gi++) {
    float dGT = sdGrassTussock(p, grassPos[gi], grassR[gi], grassH[gi]);
    if (dGT < dMin) {
      dMin = dGT;
      matId = 7; // Grass/Iris foliage
      aoFactor = 0.75;
    }
  }

  // 9. North Hillside Background Pine with branching and needle rosettes
  vec3 northTrunkA = vec3(-3.65, 0.20, -5.40);
  vec3 northTrunkB = vec3(-3.55, 1.45, -5.35);
  float dNTrunk = sdCapsule(p, northTrunkA, northTrunkB, 0.12);
  if (dNTrunk < dMin) {
    dMin = dNTrunk;
    matId = 8;
  }

  vec3 eastPineC[4]; vec3 eastPineR[4];
  eastPineC[0] = vec3(-3.85, 1.10, -5.20); eastPineR[0] = vec3(0.35, 0.16, 0.32);
  eastPineC[1] = vec3(-3.25, 1.35, -5.45); eastPineR[1] = vec3(0.32, 0.15, 0.30);
  eastPineC[2] = vec3(-3.45, 1.65, -5.30); eastPineR[2] = vec3(0.34, 0.16, 0.32);
  eastPineC[3] = vec3(-3.80, 1.95, -5.25); eastPineR[3] = vec3(0.30, 0.14, 0.28);

  for (int ei = 0; ei < 4; ei++) {
    float dE = sdPineCloudFoliage(p, eastPineC[ei], eastPineR[ei]);
    if (dE < dMin) {
      dMin = dE;
      matId = 9;
      aoFactor = 0.75;
    }
  }

  // 10. Shoreline Grass & Water Iris Tussocks (수변 사초 및 꽃창포 군락)
  vec3 tussockPos[5]; float tussockR[5]; float tussockH[5];
  tussockPos[0] = vec3( 0.25, 0.04, -0.45); tussockR[0] = 0.22; tussockH[0] = 0.22;
  tussockPos[1] = vec3(-1.15, 0.05, -0.15); tussockR[1] = 0.24; tussockH[1] = 0.24;
  tussockPos[2] = vec3( 2.45, 0.08, -1.85); tussockR[2] = 0.26; tussockH[2] = 0.26;
  tussockPos[3] = vec3(-2.65, 0.10, -2.40); tussockR[3] = 0.25; tussockH[3] = 0.25;
  tussockPos[4] = vec3( 1.15, 0.08, -6.80); tussockR[4] = 0.28; tussockH[4] = 0.28;

  for (int gi = 0; gi < 5; gi++) {
    float dGrass = sdGrassTussock(p, tussockPos[gi], tussockR[gi], tussockH[gi]);
    if (dGrass < dMin) {
      dMin = dGrass;
      matId = 7; // Iris/grass
      aoFactor = 0.80;
    }
  }

  // 10. Authentic 3D Kenninji Bamboo Fence (건인지 대나무 담장 / 建仁寺垣)
  // Individual rounded 3D cylindrical bamboo poles with nodal rings and horizontal tie rails
  if (p.z <= -4.8 && p.z >= -9.2 && p.y >= -0.05 && p.y <= 1.35) {
    float fenceX = -3.85;
    float poleSpacing = 0.082;
    float uZ = (p.z - (-4.8));
    float zLocal = mod(uZ, poleSpacing) - poleSpacing * 0.5;
    float node = 0.005 * smoothstep(0.04, 0.0, abs(mod(p.y, 0.30) - 0.15));
    float dCulm = length(vec2(p.x - fenceX, zLocal)) - (0.034 + node);
    float dFence = max(dCulm, max(p.y - 1.25, -p.y));

    // Horizontal split bamboo tying rails at y = 0.35, 0.75, 1.15
    float yRail1 = abs(p.y - 0.35) - 0.024;
    float yRail2 = abs(p.y - 0.75) - 0.024;
    float yRail3 = abs(p.y - 1.15) - 0.024;
    float dRail = max(abs(p.x - (fenceX + 0.038)) - 0.016, min(yRail1, min(yRail2, yRail3)));
    dFence = min(dFence, dRail);

    if (dFence < dMin) {
      dMin = dFence;
      matId = 11; // Bamboo fence
      aoFactor = 0.85;
    }
  }

  return dMin;
}

vec3 getGardenNormal(vec3 p) {
  float eps = 0.0035;
  int m; float w, ao;
  vec2 e = vec2(eps, 0.0);
  return normalize(vec3(
    mapGarden3D(p + e.xyy, m, w, ao) - mapGarden3D(p - e.xyy, m, w, ao),
    mapGarden3D(p + e.yxy, m, w, ao) - mapGarden3D(p - e.yxy, m, w, ao),
    mapGarden3D(p + e.yyx, m, w, ao) - mapGarden3D(p - e.yyx, m, w, ao)
  ));
}

// Fast, artifact-free procedural micro-normal perturbation for tactile biological surfaces
// Completely eliminates smooth/glossy blob artifacts on moss, grass, needles, and bark!
vec3 perturbNormal(vec3 pos, vec3 N, float freq, float strength) {
  float eps = 0.035 / freq;
  vec3 pX = pos + vec3(eps, 0.0, 0.0);
  vec3 pY = pos + vec3(0.0, eps, 0.0);
  vec3 pZ = pos + vec3(0.0, 0.0, eps);

  float h0 = vnoise(pos * freq);
  float hX = vnoise(pX * freq);
  float hY = vnoise(pY * freq);
  float hZ = vnoise(pZ * freq);

  vec3 grad = vec3((hX - h0) / eps, (hY - h0) / eps, (hZ - h0) / eps);
  grad -= N * dot(grad, N); // Tangent projection
  return normalize(N - grad * strength);
}

// Dedicated High-Resolution Procedural Normal Map for Botanical Foliage & Twigs (나뭇잎/잔가지 노멀 맵 기법)
vec3 getFoliageNormalMap(int matId, vec3 pos, vec3 N) {
  if (matId == 9) {
    // Pine Needle striation normal map: sharp longitudinal needle ridges & radial spine faceting
    float eps = 0.0035;
    float h0 = sin(pos.x * 110.0) * sin(pos.z * 110.0 + pos.y * 55.0);
    float hX = sin((pos.x + eps) * 110.0) * sin(pos.z * 110.0 + pos.y * 55.0);
    float hY = sin(pos.x * 110.0) * sin(pos.z * 110.0 + (pos.y + eps) * 55.0);
    float hZ = sin(pos.x * 110.0) * sin((pos.z + eps) * 110.0 + pos.y * 55.0);
    vec3 grad = vec3((hX - h0) / eps, (hY - h0) / eps, (hZ - h0) / eps);
    grad -= N * dot(grad, N);
    return normalize(N - grad * 0.45);
  } else if (matId == 10) {
    // Maple Leaf vein & serration normal map: 5-lobed star radial veins and micro teeth
    float eps = 0.0035;
    float h0 = sin(pos.x * 80.0 + pos.z * 60.0) * cos(pos.z * 80.0 - pos.x * 60.0) + 0.35 * sin(pos.y * 110.0);
    float hX = sin((pos.x + eps) * 80.0 + pos.z * 60.0) * cos(pos.z * 80.0 - (pos.x + eps) * 60.0) + 0.35 * sin(pos.y * 110.0);
    float hY = sin(pos.x * 80.0 + pos.z * 60.0) * cos(pos.z * 80.0 - pos.x * 60.0) + 0.35 * sin((pos.y + eps) * 110.0);
    float hZ = sin(pos.x * 80.0 + (pos.z + eps) * 60.0) * cos((pos.z + eps) * 80.0 - pos.x * 60.0) + 0.35 * sin(pos.y * 110.0);
    vec3 grad = vec3((hX - h0) / eps, (hY - h0) / eps, (hZ - h0) / eps);
    grad -= N * dot(grad, N);
    return normalize(N - grad * 0.42);
  } else if (matId == 8) {
    // Bark fissured plate normal map
    float eps = 0.004;
    float h0 = vnoise(pos * 35.0) + 0.5 * sin(pos.y * 60.0);
    float hX = vnoise((pos + vec3(eps, 0.0, 0.0)) * 35.0) + 0.5 * sin(pos.y * 60.0);
    float hY = vnoise((pos + vec3(0.0, eps, 0.0)) * 35.0) + 0.5 * sin((pos.y + eps) * 60.0);
    float hZ = vnoise((pos + vec3(0.0, 0.0, eps)) * 35.0) + 0.5 * sin(pos.y * 60.0);
    vec3 grad = vec3((hX - h0) / eps, (hY - h0) / eps, (hZ - h0) / eps);
    grad -= N * dot(grad, N);
    return normalize(N - grad * 0.48);
  }
  return N;
}

// 🌿 High-Precision Micro-Bump Map with Raking-Light Self-Shadowing (미세 범프 맵 & 광원 입체 음영)
// Accentuates micro-veinlets, stomata, and cuticle wrinkles depending on sunlight incidence angle
vec3 applyBotanicalMicroBump(
  int matId,
  vec3 pos,
  inout vec3 N,
  vec3 L,
  out float microShadow
) {
  microShadow = 1.0;
  if (matId == 9) {
    // Pine Needle: ultra-fine needle grooves & cuticle micro-ridges (160 ~ 280 Hz)
    float eps = 0.0025;
    float bump0 = sin(pos.x * 180.0) * sin(pos.z * 180.0 + pos.y * 70.0) * 0.5 + 0.5;
    float bumpX = sin((pos.x + eps) * 180.0) * sin(pos.z * 180.0 + pos.y * 70.0) * 0.5 + 0.5;
    float bumpY = sin(pos.x * 180.0) * sin(pos.z * 180.0 + (pos.y + eps) * 70.0) * 0.5 + 0.5;
    float bumpZ = sin(pos.x * 180.0) * sin((pos.z + eps) * 180.0 + pos.y * 70.0) * 0.5 + 0.5;
    vec3 bumpGrad = vec3(bumpX - bump0, bumpY - bump0, bumpZ - bump0) / eps;
    bumpGrad -= N * dot(bumpGrad, N);
    N = normalize(N - bumpGrad * 0.32);

    // Light-angle dependent micro-shadow: raking sunlight casts deep micro-shadows into needle grooves
    float bumpH = bump0 - 0.5;
    float rakingDot = dot(N, L);
    microShadow = clamp(0.68 + 0.55 * rakingDot + bumpH * 0.45, 0.22, 1.0);
  } else if (matId == 10) {
    // Maple Leaf: micro-vein capillary network and cellular stomata texture (120 ~ 220 Hz)
    float eps = 0.0025;
    float m1 = sin(pos.x * 140.0 + pos.z * 95.0) * cos(pos.z * 140.0 - pos.x * 95.0);
    float m2 = sin(pos.y * 180.0 + pos.x * 110.0) * 0.5;
    float bump0 = m1 + m2;

    float m1X = sin((pos.x + eps) * 140.0 + pos.z * 95.0) * cos(pos.z * 140.0 - (pos.x + eps) * 95.0);
    float bumpX = m1X + m2;
    float m2Y = sin((pos.y + eps) * 180.0 + pos.x * 110.0) * 0.5;
    float bumpY = m1 + m2Y;
    float m1Z = sin(pos.x * 140.0 + (pos.z + eps) * 95.0) * cos((pos.z + eps) * 140.0 - pos.x * 95.0);
    float bumpZ = m1Z + m2;

    vec3 bumpGrad = vec3(bumpX - bump0, bumpY - bump0, bumpZ - bump0) / eps;
    bumpGrad -= N * dot(bumpGrad, N);
    N = normalize(N - bumpGrad * 0.28);

    // Deep raking vein shadows when sun glances obliquely across the leaf blade
    float raking = dot(N, L);
    microShadow = clamp(0.65 + 0.60 * raking + bump0 * 0.35, 0.20, 1.0);
  } else if (matId == 8) {
    // Bark & Twigs: rugged fibrous wood grain & micro-furrow relief
    float eps = 0.003;
    float b0 = sin(pos.y * 120.0 + vnoise(pos * 50.0) * 8.0);
    float bY = sin((pos.y + eps) * 120.0 + vnoise(pos * 50.0) * 8.0);
    vec3 bumpGrad = vec3(0.0, (bY - b0) / eps, 0.0);
    bumpGrad -= N * dot(bumpGrad, N);
    N = normalize(N - bumpGrad * 0.32);
    microShadow = clamp(0.58 + 0.65 * dot(N, L), 0.20, 1.0);
  }
  return N;
}

// 🌿 Kajiya-Kay & Ward Botanical Anisotropic Reflection Model (나뭇잎 이방성 반사 모델)
// Evaluates elongated specular highlights along pine needle fibers and maple leaf veins
vec3 evaluateBotanicalAnisotropy(
  int matId,
  vec3 pos,
  vec3 N,
  vec3 V,
  vec3 L,
  vec3 lightCol,
  float roughness
) {
  // Determine fiber/vein tangent vector T orthogonal to N
  vec3 T;
  if (matId == 9) {
    // Pine Needles: radial needle spine direction combined with vertical growth
    vec3 radialDir = normalize(vec3(sin(pos.x * 24.0 + pos.z * 18.0), 0.45, cos(pos.z * 24.0 - pos.x * 18.0)));
    T = normalize(radialDir - N * dot(radialDir, N));
  } else if (matId == 10) {
    // Maple Leaves: 5-lobed star palmate radial vein direction
    float a = atan(pos.z, pos.x);
    vec3 veinDir = normalize(vec3(cos(a * 5.0), sin(pos.y * 30.0) * 0.25, sin(a * 5.0)));
    T = normalize(veinDir - N * dot(veinDir, N));
  } else if (matId == 7) {
    // Grass/Iris: vertical longitudinal blade fiber tangent
    vec3 bladeDir = vec3(0.0, 1.0, 0.0);
    T = normalize(bladeDir - N * dot(bladeDir, N));
  } else {
    return vec3(0.0);
  }

  // Half-vector
  vec3 H = normalize(V + L);
  float TdotH = dot(T, H);
  float NdotL = clamp(dot(N, L), 0.0, 1.0);
  float NdotV = clamp(dot(N, V), 0.0, 1.0);

  // Kajiya-Kay sin(theta) highlight formulation along fiber cylinder
  float sinTH = sqrt(max(0.0, 1.0 - TdotH * TdotH));
  float shininess = mix(14.0, 96.0, (1.0 - roughness) * (1.0 - roughness));
  
  // Dual-lobe anisotropic highlight: sharp primary fiber streak + broad soft cuticle sheen
  float anisoLobe1 = pow(sinTH, shininess) * smoothstep(-0.1, 0.25, NdotL);
  float anisoLobe2 = pow(sinTH, shininess * 0.35) * 0.45;

  // Fiber-aligned anisotropic tint
  vec3 anisoColor = vec3(1.0);
  if (matId == 9) {
    // Pine needle: glossy golden-silvery fiber glint
    anisoColor = mix(vec3(0.85, 0.95, 0.75), vec3(1.0, 0.98, 0.90), 0.60);
  } else if (matId == 10) {
    // Maple leaf: warm ruby-amber specular streak along vein ridges
    anisoColor = mix(vec3(1.0, 0.85, 0.65), vec3(1.0, 0.45, 0.35), 0.45);
  } else if (matId == 7) {
    // Grass: crisp jade-gold fiber highlight
    anisoColor = vec3(0.90, 1.0, 0.75);
  }

  // Geometric attenuation
  float denom = max(0.08, sqrt(max(0.001, NdotL * NdotV)));
  float anisoSpec = (anisoLobe1 + anisoLobe2) / (4.0 * 3.14159265 * denom);

  return lightCol * anisoColor * clamp(anisoSpec, 0.0, 3.5) * NdotL;
}

void evaluateZenShoreMaterial(
  int matId,
  vec3 pos,
  inout vec3 N,
  float wetFactor,
  float aoFactor,
  out vec3 albedo,
  out float roughness,
  out float metallic,
  out float ao,
  out vec3 emission
) {
  metallic = 0.0;
  emission = vec3(0.0);
  ao = aoFactor;

  if (matId == 1) {
    // 1. Natural Blue-Schist & Granite Shoreline Boulders (호안석 / 護岸石)
    vec3 graniteBase = vec3(0.24, 0.26, 0.27) * (0.85 + 0.30 * vnoise(pos.xz * 10.0));
    float vein = smoothstep(0.88, 0.98, sin(pos.x * 12.0 + pos.z * 16.0 + vnoise(pos.xz * 5.0) * 3.5));
    albedo = mix(graniteBase, vec3(0.60, 0.64, 0.62), vein * 0.50);
    roughness = mix(0.86, 0.48, wetFactor); // Matte weathered granite, soft satin when wet
    if (N.y > 0.55 && wetFactor < 0.25) {
      float moss = smoothstep(0.55, 0.85, N.y) * smoothstep(0.35, 0.70, vnoise(pos.xz * 3.5));
      albedo = mix(albedo, vec3(0.09, 0.28, 0.08), moss * 0.80);
      roughness = mix(roughness, 0.96, moss);
    }
    albedo *= mix(1.0, 0.45, wetFactor);
  } else if (matId == 2) {
    // 2. Fine Shirakawa River Gravel & Raked Sand with Combed Ripples (사문 / 砂紋)
    float dShore = getPondWaterDist(pos.xz);
    float rakeRipple = sin(dShore * 48.0) * 0.5 + 0.5;
    vec3 gravelBase = mix(vec3(0.66, 0.62, 0.55), vec3(0.78, 0.74, 0.66), rakeRipple * 0.45);
    float microSand = vnoise(pos.xz * 50.0);
    albedo = gravelBase * (0.92 + 0.16 * microSand);
    roughness = mix(0.88, 0.72, rakeRipple * 0.5);
  } else if (matId == 3) {
    // 3. Hinoki Cedar Wooden Deck & Veranda (삼나무 툇마루 데크)
    float grain = vnoise(vec2(pos.x * 3.2, pos.z * 42.0));
    albedo = mix(vec3(0.44, 0.30, 0.18), vec3(0.58, 0.40, 0.25), grain);
    float plank = fract(pos.x * 3.2);
    if (plank < 0.05 || plank > 0.95) albedo *= 0.45;
    roughness = 0.65;
  } else if (matId == 4) {
    // 4. River Granite Stepping Stones (토비이시 / 징검다리 飛石)
    vec3 graniteBase = vec3(0.28, 0.29, 0.30) * (0.85 + 0.30 * vnoise(pos.xz * 14.0));
    albedo = graniteBase;
    roughness = mix(0.85, 0.48, wetFactor);
    albedo *= mix(1.0, 0.42, wetFactor);
  } else if (matId == 5) {
    // 5. Velvet Cushion Moss Garden (비단이끼 정원 / Sugi-goke & Hinoki-goke)
    // Micro-fiber velvet normal perturbation eliminates flat/smooth sheen
    N = perturbNormal(pos, N, 35.0, 0.50);
    N = perturbNormal(pos, N, 120.0, 0.28);

    float mCell = vnoise(pos.xz * 6.5);
    float mTuft = vnoise(pos.xz * 32.0);

    vec3 mossDeep = vec3(0.04, 0.14, 0.04);     // Deep shadowed cavity
    vec3 mossEmerald = vec3(0.10, 0.28, 0.08);  // Lush cushion body
    vec3 mossGoldTip = vec3(0.25, 0.46, 0.11);  // Sunlit velvet tuft tips
    vec3 soilHumus = vec3(0.14, 0.11, 0.08);    // Rich damp forest soil in crevices

    // Multi-tier organic coloration with shadowed cushion crevices
    vec3 mossColor = mix(mossDeep, mossEmerald, smoothstep(0.20, 0.80, mCell));
    mossColor = mix(mossColor, mossGoldTip, smoothstep(0.45, 0.90, mTuft) * 0.75);
    if (mCell < 0.22) {
      mossColor = mix(mossColor, soilHumus, smoothstep(0.22, 0.08, mCell));
    }

    albedo = mossColor;
    roughness = 0.98; // Pure velvet diffuse scattering, zero plastic gloss!
  } else if (matId == 6) {
    // 6. Kasuga Granite Stone Lantern (카스가 석등 / 春日燈籠)
    albedo = vec3(0.32, 0.32, 0.31) * (0.85 + 0.30 * vnoise(pos.xz * 7.5));
    roughness = 0.82;
    if (pos.y > 0.85 && pos.y < 1.08) {
      // Warm glowing lantern flame inside fire chamber
      emission = vec3(1.0, 0.78, 0.35) * 5.2;
    }
  } else if (matId == 7) {
    // 7. Ornamental Japanese Water Iris & Sedge (붓꽃 / 꽃창포 / 燕子花)
    N = perturbNormal(pos, N, 45.0, 0.45);
    float bladePattern = sin(pos.y * 65.0 + vnoise(pos.xz * 10.0) * 7.0);
    vec3 grassLush = mix(vec3(0.08, 0.36, 0.08), vec3(0.20, 0.46, 0.12), bladePattern * 0.5 + 0.5);
    float petalMask = smoothstep(0.72, 0.85, vnoise(pos.xz * 18.0 + vec2(3.5)));
    if (petalMask > 0.05 && pos.y > 0.12) {
      grassLush = mix(grassLush, vec3(0.28, 0.12, 0.48), petalMask * 0.85);
    }
    albedo = grassLush;
    roughness = 0.88; // Matte foliage blades
  } else if (matId == 8) {
    // 8. Weathered Japanese Black Pine Bark & Wooden Branches (흑송 고목의 거북등 귀갑 수피 및 나뭇가지 목질)
    // Deep vertical and horizontal armored fissured bark plates with wood fiber striation
    N = perturbNormal(pos, N, 28.0, 0.75);
    N = perturbNormal(pos, N, 85.0, 0.42);

    vec2 bp = vec2(pos.x * 22.0 + pos.z * 12.0, pos.y * 36.0);
    float furrow = smoothstep(0.25, 0.75, sin(bp.y + vnoise(bp) * 5.0));
    float plateTex = vnoise(pos * 48.0);
    float woodGrain = sin(pos.y * 70.0 + vnoise(pos.xz * 15.0) * 8.0) * 0.5 + 0.5;
    float lichen = smoothstep(0.65, 0.88, vnoise(pos * 20.0 + vec3(1.2, 5.4, 3.1)));

    vec3 creviceDark = vec3(0.05, 0.032, 0.018); // Deep shadowed fissure cavities
    vec3 barkAged    = vec3(0.20, 0.145, 0.095); // Weathered armored bark plates
    vec3 barkWarm    = vec3(0.35, 0.23, 0.14);   // Russet inner cork ridges & branch wood
    vec3 lichenGray  = vec3(0.35, 0.40, 0.30);   // Mountain rock lichen specks

    vec3 barkCol = mix(creviceDark, barkAged, furrow);
    barkCol = mix(barkCol, barkWarm, (plateTex * 0.6 + woodGrain * 0.4) * 0.65);
    if (lichen > 0.05 && N.y > 0.15) {
      barkCol = mix(barkCol, lichenGray, lichen * 0.65);
    }

    albedo = barkCol;
    roughness = 0.96; // Dry, rugged, matte fissured bark (zero slipperiness!)
  } else if (matId == 9) {
    // 9. Sculpted Cloud Pine Needle Rosettes (조형 흑송 솔잎 다발 / Kuromatsu 松葉)
    // Radial needle cluster micro-normals break up the shape into crisp tactile pine needles
    N = perturbNormal(pos, N, 60.0, 0.75);
    N = perturbNormal(pos, N, 160.0, 0.45);

    float needleBundle = vnoise(pos * 28.0);
    float needleFine = sin(pos.x * 110.0) * sin(pos.z * 110.0 + pos.y * 50.0);
    float needleTipMask = vnoise(pos * 180.0);

    vec3 pineShadow = vec3(0.02, 0.08, 0.025);   // Shadowed inner needle cavity
    vec3 pineCore   = vec3(0.065, 0.20, 0.06);   // Mature evergreen needle body
    vec3 pineLush   = vec3(0.13, 0.34, 0.095);   // Active radiating needle blades
    vec3 pineSunTip = vec3(0.32, 0.56, 0.13);    // Sunlit needle tips & young growth

    vec3 needleCol = mix(pineShadow, pineCore, smoothstep(0.18, 0.68, needleBundle));
    needleCol = mix(needleCol, pineLush, smoothstep(-0.3, 0.7, needleFine) * 0.75);
    if (N.y > 0.25 && needleTipMask > 0.55) {
      needleCol = mix(needleCol, pineSunTip, smoothstep(0.25, 0.85, N.y) * 0.85);
    }

    albedo = needleCol;
    roughness = 0.90; // Natural waxy needle texture with micro-facets (zero plastic!)
  } else if (matId == 10) {
    // 10. Weeping Japanese Autumn Maple (수양 붉은 단풍 / Momiji)
    // Overlapping leaf cluster normal faceting and 5-lobed star leaf veins
    N = perturbNormal(pos, N, 50.0, 0.70);
    N = perturbNormal(pos, N, 130.0, 0.38);

    float leafCluster = vnoise(pos * 24.0);
    float leafLobe = vnoise(pos * 68.0);
    float leafVeinPattern = sin(pos.x * 85.0 + pos.z * 85.0);
    float leafEdge = vnoise(pos * 160.0);

    vec3 wineDark       = vec3(0.35, 0.025, 0.04); // Deep shadowed inner foliage
    vec3 lacquerCrimson = vec3(0.80, 0.055, 0.055); // Vivid Japanese Momiji crimson
    vec3 fieryScarlet   = vec3(0.98, 0.17, 0.035);  // Sunlit scarlet leaf blade
    vec3 amberGold      = vec3(1.0, 0.60, 0.08);    // Autumn leaf margins & golden veins

    vec3 mapleCol = mix(wineDark, lacquerCrimson, smoothstep(0.15, 0.65, leafCluster));
    mapleCol = mix(mapleCol, fieryScarlet, smoothstep(0.28, 0.78, leafLobe));
    if (leafVeinPattern > 0.45) {
      mapleCol = mix(mapleCol, fieryScarlet * 1.15, 0.35);
    }
    if (N.y > 0.20 || leafEdge > 0.60) {
      mapleCol = mix(mapleCol, amberGold, smoothstep(0.20, 0.85, N.y) * 0.65 * smoothstep(0.35, 0.85, leafEdge));
    }

    albedo = mapleCol;
    roughness = 0.85; // Authentic delicate leaf cuticle (soft matte)
  } else if (matId == 11) {
    // 11. Traditional Bamboo Fence & Water Spout (대나무 담장 & 카케히)
    N = perturbNormal(pos, N, 30.0, 0.25);
    float bambooNode = sin(pos.y * 36.0) * 0.5 + 0.5;
    vec3 bambooGreen = vec3(0.24, 0.42, 0.14);
    vec3 bambooOchre = vec3(0.50, 0.46, 0.22);
    albedo = mix(bambooGreen, bambooOchre, smoothstep(0.75, 0.95, bambooNode));
    roughness = 0.55;
  } else if (matId == 12) {
    // 12. Tsukubai Stone Water Basin (쓰쿠바이 물확)
    if (pos.y < 0.22) {
      albedo = vec3(0.04, 0.12, 0.08); // Basin water pool
      roughness = 0.04;
    } else {
      albedo = vec3(0.28, 0.29, 0.30); // Chiseled granite basin rim
      roughness = 0.82;
    }
  } else if (matId == 13) {
    // 13. Clipped Satsuki Azalea Karikomi Evergreen Shrub (사츠키 왜철쭉)
    // Fine clipped leaf mosaic normal perturbation eliminates shiny plastic ball look
    N = perturbNormal(pos, N, 50.0, 0.55);
    N = perturbNormal(pos, N, 130.0, 0.28);

    float azaleaLeaf = vnoise(pos * 36.0);
    float azaleaTip = vnoise(pos * 90.0);

    vec3 azaleaShadow = vec3(0.04, 0.14, 0.04);
    vec3 azaleaBody = vec3(0.09, 0.28, 0.08);
    vec3 azaleaShoot = vec3(0.20, 0.45, 0.12);

    vec3 azCol = mix(azaleaShadow, azaleaBody, smoothstep(0.20, 0.70, azaleaLeaf));
    if (N.y > 0.30) {
      azCol = mix(azCol, azaleaShoot, smoothstep(0.30, 0.85, N.y) * smoothstep(0.40, 0.90, azaleaTip) * 0.60);
    }

    albedo = azCol;
    roughness = 0.88; // Natural soft clipped foliage (matte)
  } else if (matId == 14) {
    // 14. Fallen Autumn Maple Leaves on Moss / Gravel (단풍 낙엽 / 오치바)
    float leafHue = hash12(floor(pos.xz * 12.0));
    vec3 colLeaf = (leafHue > 0.6) ? vec3(0.95, 0.22, 0.06) : ((leafHue > 0.3) ? vec3(0.78, 0.06, 0.08) : vec3(1.0, 0.62, 0.12));
    albedo = colLeaf;
    roughness = 0.75;
  } else if (matId == 15) {
    // 15. Bamboo Water Ladle (히샤쿠 柄杓)
    albedo = vec3(0.58, 0.52, 0.32);
    roughness = 0.48;
  } else {
    albedo = vec3(0.28);
    roughness = 0.85;
  }
}

struct StoneHit {
  bool hit;
  float t;
  vec3 p;
  vec3 n;
  float wet;
};

StoneHit intersectSteppingStones(vec3 ro, vec3 rd) {
  StoneHit best;
  best.hit = false;
  best.t = 1e6;

  // 8 River Granite Stepping Stones curving along Catmull-Rom watercourse
  // Proportions: naturally rounded river slabs with flat top plateau and beveled rim
  vec3 centers[8];
  vec3 radii[8];
  centers[0] = vec3(0.65, 0.05, -0.15); radii[0] = vec3(0.38, 0.22, 0.34);
  centers[1] = vec3(0.96, 0.05, -0.68); radii[1] = vec3(0.37, 0.22, 0.33);
  centers[2] = vec3(1.28, 0.05, -1.26); radii[2] = vec3(0.36, 0.22, 0.32);
  centers[3] = vec3(1.56, 0.05, -1.88); radii[3] = vec3(0.35, 0.21, 0.31);
  centers[4] = vec3(1.72, 0.05, -2.55); radii[4] = vec3(0.34, 0.21, 0.30);
  centers[5] = vec3(1.74, 0.05, -3.26); radii[5] = vec3(0.34, 0.21, 0.30);
  centers[6] = vec3(1.58, 0.05, -3.98); radii[6] = vec3(0.33, 0.20, 0.29);
  centers[7] = vec3(1.32, 0.05, -4.68); radii[7] = vec3(0.32, 0.20, 0.28);

  for (int i = 0; i < 8; i++) {
    vec3 c = centers[i];
    vec3 r = radii[i];
    vec3 p0 = (ro - c) / r;
    vec3 d0 = rd / r;

    float a = dot(d0, d0);
    float b = 2.0 * dot(p0, d0);
    float cc = dot(p0, p0) - 1.0;
    float disc = b * b - 4.0 * a * cc;

    if (disc > 0.0) {
      float t0 = (-b - sqrt(disc)) / (2.0 * a);
      if (t0 > 0.05 && t0 < best.t) {
        vec3 hitP = ro + rd * t0;
        // Analytical normal of rounded stone with flat top walking plateau
        vec3 hitN = normalize((hitP - c) / (r * r));
        float topRatio = (hitP.y - c.y) / r.y;
        if (topRatio > 0.65) {
          float bevel = smoothstep(0.65, 0.95, topRatio);
          hitN = normalize(mix(hitN, vec3(0.0, 1.0, 0.0), bevel * 0.85));
        }

        best.hit = true;
        best.t = t0;
        best.p = hitP;
        best.n = hitN;
        best.wet = clamp((0.08 - hitP.y) / 0.12, 0.0, 1.0);
      }
    }
  }

  return best;
}

void main(){
  vec2 ndc = vUv*2.0-1.0;
  vec3 rd = normalize(uF + ndc.x*uAspect*uTanF*uR + ndc.y*uTanF*uU);
  vec3 wd = rd; wd.y = min(wd.y, -0.0015); wd = normalize(wd);

  // Surface intersection with flat water plane (if ray aims downwards)
  float t = -uCam.y / wd.y;

  vec3 overlayCol = vec3(0.0);
  float overlayAlpha = 0.0;
  bool hasOverlay = false;

  // 🌿 1. Exact Analytical Stepping Stones (우측 전경 화강암 디딤돌)
  if (uEnvironment == 0 && uPondBorderMode == 1) {
    StoneHit sHit = intersectSteppingStones(uCam, rd);
    if (sHit.hit && (rd.y >= 0.0 || sHit.t < t)) {
      vec3 graniteBase = vec3(0.28, 0.29, 0.30) * (0.85 + 0.30 * vnoise(sHit.p.xz * 14.0));

      vec3 ambZen = sky(vec3(0.0, 1.0, 0.0)) * 0.52;
      vec3 colStone = evaluatePBR(
        graniteBase * mix(1.0, 0.42, sHit.wet),
        mix(0.85, 0.48, sHit.wet),
        0.0,
        0.92,
        sHit.n,
        -rd,
        uSun,
        uSunColor,
        ambZen,
        sHit.wet
      );

      float distS = sHit.t;
      float hazeS = 1.0 - exp(-distS * 0.0035);
      vec3 baseHazeS = mix(vec3(0.68, 0.76, 0.84), vec3(0.55, 0.42, 0.28), clamp(uSun.y * 2.0, 0.08, 1.0));
      colStone = mix(colStone, baseHazeS, hazeS * 0.45);

      // Dynamic camera height opacity control (시점 하강 시 디딤돌 투명도 조절)
      float camHeightNorm = clamp((uCam.y - 0.22) / (1.20 - 0.22), 0.0, 1.0);
      float distFade = smoothstep(0.20, 1.8, sHit.t);
      float stoneAlpha = mix(mix(0.20, 0.85, distFade), 1.0, camHeightNorm) * uGardenOpacity;
      if (uGardenLowAngleTransparency == 0) stoneAlpha = 1.0 * uGardenOpacity;

      if (stoneAlpha >= 0.98) {
        o = vec4(max(colStone, 0.0), 1.0);
        return;
      } else {
        overlayCol = colStone;
        overlayAlpha = stoneAlpha;
        hasOverlay = true;
      }
    }
  }

  // 🌿 2. Unified 3D Volumetric Zen Garden Sphere Tracing (Trees, Rocks, Lantern, Basin, Fence, Terrain)
  if (uEnvironment == 0 && uPondBorderMode == 1 && !hasOverlay) {
    float tStart = 0.10;
    float tEnd = 16.0;

    // Only limit tEnd if ray aims downwards AND its intersection with the water plane y=0
    // is inside the pond water basin (dWaterCheck <= 0.0)!
    if (rd.y < -0.0005) {
      vec3 pWaterCheck = uCam + rd * t;
      float dWaterCheck = getPondWaterDist(pWaterCheck.xz);
      if (dWaterCheck <= 0.0) {
        tEnd = max(tStart, t - 0.02);
      }
    }

    if (tEnd > tStart) {
      float tCur = tStart;
      bool hitGarden = false;
      int mIdHit = 0; float wFactHit = 0.0, aoFactHit = 1.0;
      float tHit = tEnd;

      for (int step = 0; step < 110; step++) {
        vec3 Pstep = uCam + rd * tCur;
        int mId; float wFact, aoFact;
        float dist = mapGarden3D(Pstep, mId, wFact, aoFact);

        if (dist < 0.0035) {
          // Bisection / Secant refinement for sub-millimeter precision
          float tA = tCur - 0.01;
          float tB = tCur;
          for (int bi = 0; bi < 4; bi++) {
            float tMid = (tA + tB) * 0.5;
            vec3 Pmid = uCam + rd * tMid;
            float dMid = mapGarden3D(Pmid, mId, wFact, aoFact);
            if (dMid < 0.002) tB = tMid; else tA = tMid;
          }

          // 🌿 Alpha Cutout evaluation on foliage surfaces (나뭇잎/잔가지 알파 컷아웃 기법)
          if (mId == 9 || mId == 10 || mId == 7) {
            vec3 Pcut = uCam + rd * tB;
            float alphaCut = getFoliageCutoutAlpha(mId, Pcut);
            if (alphaCut < 0.42) {
              // Negative space air gap between individual needle spines or leaf lobes!
              // Punch through (cutout/discard) and continue raymarching forward!
              tCur = tB + 0.012;
              continue;
            }
          }

          tHit = tB;
          mIdHit = mId;
          wFactHit = wFact;
          aoFactHit = aoFact;
          hitGarden = true;
          break;
        }

        // Adaptive fine sphere trace step (never skips slender twigs or needle clusters)
        float stepSize = clamp(dist * 0.72, 0.006, 0.05);
        tCur += stepSize;
        if (tCur > tEnd) break;
      }

      if (hitGarden) {
        vec3 Phit = uCam + rd * tHit;
        vec3 Nhit = getGardenNormal(Phit);

        // 🌿 Apply dedicated procedural high-res normal map for leaves, needles, and bark (노멀 맵 기법)
        Nhit = getFoliageNormalMap(mIdHit, Phit, Nhit);

        // 🌿 Apply micro-bump map and light-angle dependent micro-shadowing (미세 범프 맵 & 광원 입체 음영)
        float microShadow = 1.0;
        Nhit = applyBotanicalMicroBump(mIdHit, Phit, Nhit, uSun, microShadow);

        vec3 albHit, emitHit;
        float roughHit, metalHit, aoHit;
        evaluateZenShoreMaterial(mIdHit, Phit, Nhit, wFactHit, aoFactHit, albHit, roughHit, metalHit, aoHit, emitHit);

        vec3 ambZen = sky(vec3(0.0, 1.0, 0.0)) * 0.52;
        vec3 colGarden = evaluatePBR(
          albHit,
          roughHit,
          metalHit,
          aoHit * microShadow, // Micro-bump shadow deepens cavities depending on light incidence angle
          Nhit,
          -rd,
          uSun,
          uSunColor * microShadow,
          ambZen,
          wFactHit
        ) + emitHit;

        // 🌿 Anisotropic Reflection Model (나뭇잎 이방성 반사 모델: 솔잎 바늘 결 및 단풍 잎맥 광택)
        if (mIdHit == 9 || mIdHit == 10 || mIdHit == 7) {
          vec3 anisoSpecular = evaluateBotanicalAnisotropy(
            mIdHit,
            Phit,
            Nhit,
            -rd,
            uSun,
            uSunColor,
            roughHit
          );
          colGarden += anisoSpecular;
        }

        // 🌿 Realistic Botanical Translucency & Subsurface Transmission (자연스러운 잎맥 투과광 & 반사)
        if (mIdHit == 9 || mIdHit == 10 || mIdHit == 13 || mIdHit == 7) {
          // Thin-sheet forward transmission: sunlight penetrating the leaf lamina towards camera
          float forwardTrans = max(dot(-rd, uSun), 0.0);
          float backScatter = max(dot(Nhit, -uSun), 0.0);
          
          vec3 transCol = albHit;
          if (mIdHit == 9) {
            // Pine Needle: vibrant golden-chartreuse backlit glow through chloroplasts
            transCol = vec3(0.40, 0.75, 0.14);
          } else if (mIdHit == 10) {
            // Autumn Maple: blazing fiery scarlet-amber translucent glow
            transCol = vec3(1.0, 0.42, 0.06);
          }
          
          float transIntensity = (pow(forwardTrans, 3.2) * 0.85 + pow(backScatter, 1.8) * 0.35);
          colGarden += transCol * uSunColor * transIntensity;

          // Organic Waxy Cuticle Fresnel Sheen (나뭇잎 표면 왁스질 큐티클의 자연스러운 프레넬 반사)
          float leafFresnel = pow(1.0 - max(dot(Nhit, -rd), 0.0), 3.5);
          vec3 leafReflCol = sky(reflect(rd, Nhit));
          colGarden += leafReflCol * leafFresnel * 0.28;
        } else if (mIdHit == 8) {
          // Bark diffuse rim lighting highlighting wood contours and fissures
          float barkRim = pow(1.0 - max(dot(Nhit, -rd), 0.0), 4.0);
          colGarden += ambZen * barkRim * 0.20;
        }

        // Subtle Komorebi dappled sun patches filtering through garden pine canopy
        float komorebi = 0.88 + 0.12 * sin(Phit.x * 2.5 + Phit.z * 1.8 + uTime * 0.35);
        colGarden *= komorebi;

        // Aerial atmospheric haze over garden distance
        float distG = tHit;
        float hazeG = 1.0 - exp(-distG * 0.0035);
        vec3 baseHazeG = mix(vec3(0.68, 0.76, 0.84), vec3(0.55, 0.42, 0.28), clamp(uSun.y * 2.0, 0.08, 1.0));
        colGarden = mix(colGarden, baseHazeG, hazeG * 0.45);

        // =========================================================================
        // 🌿 DYNAMIC TRANSPARENCY LOGIC (사용자 요청: 시점 하강 시 정원 요소 투명도 조절)
        // =========================================================================
        // When camera lowers towards pond water level (uCam.y drops),
        // objects below threshold height or foreground elements obstructing the water
        // dynamically fade out so the water surface, caustics, and koi are clearly visible!
        float camHeightNorm = clamp((uCam.y - 0.22) / (1.20 - 0.22), 0.0, 1.0);
        float heightThreshold = 0.85;
        float objHeightRel = clamp(Phit.y / heightThreshold, 0.0, 1.0);
        float distFactor = smoothstep(0.15, 2.0, tHit);
        
        float gardenAlpha = mix(mix(0.15, 0.85, objHeightRel * distFactor), 1.0, camHeightNorm) * uGardenOpacity;
        if (uGardenLowAngleTransparency == 0) gardenAlpha = 1.0 * uGardenOpacity;

        if (gardenAlpha >= 0.98) {
          o = vec4(max(colGarden, 0.0), 1.0);
          return;
        } else {
          overlayCol = colGarden;
          overlayAlpha = gardenAlpha;
          hasOverlay = true;
        }
      }
    }
  }

  // When looking at or above the water horizon into the serene open sky
  if (rd.y >= 0.0) {
    vec3 skyCol = sky(rd);
    if (hasOverlay) {
      skyCol = mix(skyCol, overlayCol, overlayAlpha);
    }
    o = vec4(skyCol, 1.0);
    return;
  }
  vec2 xz; vec4 A; vec4 B; vec4 R;
  const mat2 M = mat2(0.8, -0.6, 0.6, 0.8);
  const float SC = 0.41, WB = 0.10;
  float hsum = 0.0;
  for (int i=0;i<3;i++){
    xz = uCam.xz + wd.xz*t;
    vec2 chopDisp = -A.yz * (uChoppiness * 0.045);
    vec2 sxz = xz + (i > 0 ? chopDisp : vec2(0.0));
    A = texture(uSurf, sxz/uL);
    B = texture(uSurf, (M*sxz)/(uL*SC) + 0.37);
    vec2 ruv = (xz - uRipCenter)/uRipSize + 0.5;
    R = texture(uRip, ruv);
    float hAmbIter;
    vec2 sAmbIter = getAmbientRipples(sxz, uTime, uEnvironment, hAmbIter);
    hsum = A.x + WB*SC*B.x + R.x + hAmbIter;
    t = (hsum - uCam.y) / wd.y;
  }
  vec3 P = uCam + wd*t;
  vec2 chopDisp = -A.yz * (uChoppiness * 0.045);
  vec2 Pxz = P.xz + chopDisp;
  A = texBS(uSurf, Pxz/uL);
  B = texBS(uSurf, (M*Pxz)/(uL*SC) + 0.37);
  float ambH;
  vec2 ambSlope = getAmbientRipples(Pxz, uTime, uEnvironment, ambH);
  vec2 slope = A.yz + WB*(transpose(M)*B.yz) + R.yz + ambSlope;
  const mat2 M2 = mat2(0.28, 0.96, -0.96, 0.28);
  vec4 Cm = texture(uSurf, (M2*Pxz)/(uL*0.13) + 0.71);
  slope += 0.13*exp(-t*0.18)*(transpose(M2)*Cm.yz);
  float var = max(A.w - dot(A.yz,A.yz), 0.0) + WB*WB*max(B.w - dot(B.yz,B.yz), 0.0) + dot(ambSlope, ambSlope) * 0.40;
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
  float dist = t;

  vec3 v = -wd;
  float nv = dot(n, v);
  if (nv < 0.02) { n = normalize(n + v*(0.02-nv)); nv = dot(n,v); }
  float F = fresnel(nv, IOR);

  // Reflection
  vec3 rr = reflect(wd, n); rr.y = abs(rr.y);
  vec3 refl = sky(rr) * 1.25;

  // Sun glints
  float a2 = 0.00012 + 1.2*var;
  vec3 h = normalize(v + uSun);
  float nh = max(dot(n,h),0.0), nl = max(dot(n,uSun),0.0);
  float c2 = max(nh*nh, 1e-4); float tan2 = (1.0-c2)/c2;
  float D = exp(-tan2/a2)/(PI*a2*c2*c2);
  float Vis = 0.5/(nl*sqrt(nv*nv*(1.0-a2)+a2) + nv*sqrt(nl*nl*(1.0-a2)+a2) + 1e-5);
  float Fh = fresnel(max(dot(h,v),0.0), IOR);
  vec3 spec = uSunColor * min(D*Vis*Fh*nl, 12000.0);

  // Underwater Refraction
  vec3 tr = refract(wd, n, 1.0/IOR);
  float fy = -floorDepth(P.xz) * (uDepth / 1.6);
  float s = (fy - P.y)/tr.y; vec3 FP = P + tr*s;
  for (int i=0;i<2;i++){ fy = -floorDepth(FP.xz)*(uDepth/1.6); s = (fy - P.y)/tr.y; FP = P + tr*s; }
  s = max(s, 0.0);

  // Seabed zones
  float hgt, hgt2;
  vec3 floorNormal = vec3(0.0, 1.0, 0.0);
  float floorSpecVal = 0.0;
  float ao = 1.0;
  vec3 pf = pebbles(FP.xz, 1.0, hgt);
  vec3 pc = pebbles(FP.xz.yx*vec2(-1.0,1.0) + vec2(5.3), 1.7, hgt2);
  float coarse = smoothstep(0.45, 0.62, fbm2(FP.xz*0.21 + vec2(40.0)));
  vec3 alb = mix(pf, pc, coarse); hgt = mix(hgt, hgt2, coarse);
  float zone = fbm2(FP.xz*0.16 + vec2(3.0)) + 0.10*(vnoise(FP.xz*2.5)-0.5);
  float sandM = smoothstep(hgt + 0.02, hgt + 0.16, (zone - 0.46)*1.6);
  float marks = 0.5 + 0.5*sin(dot(FP.xz, vec2(0.93, 0.37))*16.0 + 3.0*vnoise(FP.xz*0.8));
  vec3 sand = vec3(0.60, 0.55, 0.44) * (0.82 + 0.22*vnoise(FP.xz*40.0) + 0.10*marks);
  sand = sand*sand*1.4;
  alb = mix(alb, sand, sandM); hgt = mix(hgt, 0.42 + 0.05*marks, sandM);
  alb = mix(vec3(dot(alb,vec3(0.3,0.55,0.15))), alb, 0.8) * vec3(1.10, 1.0, 0.86);

  float big = vnoise(FP.xz*0.45) * 0.65 + vnoise(FP.xz*1.3 + vec2(3.1)) * 0.35;
  float weed = smoothstep(0.55, 0.85, vnoise(FP.xz*0.32 + vec2(11.0)));
  alb *= mix(0.62, 1.22, big);
  alb = mix(alb, alb*vec3(0.55, 0.62, 0.40), weed*0.7);
  alb = mix(vec3(0.30,0.29,0.27), pow(alb, vec3(1.2)), 0.72) * 0.6;

  if (uEnvironment == 0) {
    // 🌿 Procedural Textured Pond Floor: Sand, Gravel & Velvet Cushion Moss
    float specVal, aoVal;
    getPondFloorPattern(FP.xz, alb, hgt, specVal, aoVal);
    floorSpecVal = specVal;
    ao = aoVal;

    // True physical 3D procedural normal perturbation across sand dunes, gravel domes, and moss cushions
    float eps = 0.016;
    float hX = getPondFloorHeightOnly(FP.xz + vec2(eps, 0.0));
    float hZ = getPondFloorHeightOnly(FP.xz + vec2(0.0, eps));
    floorNormal = normalize(vec3(-(hX - hgt) / eps * 0.45, 1.0, -(hZ - hgt) / eps * 0.45));
  }

  // Caustics projection with Dynamic FFT Wave Height & Slope Synchronization
  vec3 sunT = refract(-uSun, vec3(0.0, 1.0, 0.0), 1.0 / IOR);
  float Ts = 1.0 - fresnel(uSun.y, IOR);
  float depthHere = max(P.y - FP.y, 0.0);
  float sunSlope = 1.0 / max(-sunT.y, 0.05);

  // Trace back along refracted sunlight path to the exact surface wave entry point
  vec2 sunSurfPos = FP.xz - sunT.xz * (depthHere * sunSlope);
  vec4 waveA = texture(uSurf, sunSurfPos / uL);
  vec4 waveB = texture(uSurf, (M * sunSurfPos) / (uL * SC) + 0.37);
  vec2 ripUV = (sunSurfPos - uRipCenter) / uRipSize + 0.5;
  vec4 waveR = texture(uRip, ripUV);

  // Multi-octave wave height and surface slopes (dh/dx, dh/dz) from surface FFT ocean + ambient ripples
  float cAmbH;
  vec2 cAmbSlope = getAmbientRipples(sunSurfPos, uTime, uEnvironment, cAmbH);
  float waveH = waveA.x + WB * SC * waveB.x + waveR.x + cAmbH;
  vec2 waveSlope = waveA.yz + WB * (transpose(M) * waveB.yz) + waveR.yz + cAmbSlope;

  // True surface normal and Snell refraction at wave surface
  vec3 waveN = normalize(vec3(-waveSlope.x, 1.0, -waveSlope.y));
  vec3 waveRay = refract(-uSun, waveN, 1.0 / IOR);

  // Optical path length: wave crests add water depth, wave troughs subtract water depth
  float waveColDepth = max(depthHere + waveH, 0.05);

  // Seafloor displacement: light patterns shift and warp dynamically in sync with surface FFT waves
  vec2 floorHit = sunSurfPos + (waveRay.xz / max(-waveRay.y, 0.05)) * waveColDepth;
  vec2 flatHit = sunSurfPos + (sunT.xz * sunSlope) * depthHere;
  vec2 waveWarp = floorHit - flatHit;
  vec2 pebbleWarp = sunT.xz * sunSlope * (hgt - 0.35) * 0.06;

  // Real-time warped caustics coordinate
  vec2 cuv = (FP.xz - uCausShift + waveWarp + pebbleWarp) / uL;

  // Wave height & curvature lensing: crests concentrate caustics into brilliant bands, troughs diffuse
  float crestFocus = 1.0 + clamp(waveH * 2.8, -0.65, 3.2);
  float slopeCurv = clamp(dot(waveSlope, waveSlope) * 2.2, 0.0, 2.0);
  float waveLensMod = crestFocus * (1.0 + slopeCurv * 0.4);

  // Prismatic spectral dispersion across wave slope gradient
  vec2 dispDir = waveSlope * (0.012 + 0.024 * clamp(waveColDepth / 1.6, 0.4, 2.4));
  float causR = texture(uCaus, cuv + dispDir * 1.35, 1.0).r;
  float causG = texture(uCaus, cuv, 1.0).g;
  float causB = texture(uCaus, cuv - dispDir * 1.35, 1.0).b;
  vec3 caus = vec3(causR, causG, causB) * uCausticsIntensity * waveLensMod;

  if (uEnvironment == 0) {
    // Warm sun-drenched golden light caustics on pond floor pebble bed & stepping stones
    vec3 goldenCaustics = caus * vec3(1.06, 0.98, 0.88) * 1.15;
    vec3 ambientFill = vec3(0.85) * min(uCausticsIntensity, 1.25);
    caus = mix(goldenCaustics, ambientFill, 0.16);
  }

  // Ripple curvature micro-lensing
  float lap = waveR.a;
  caus *= clamp(1.0 / (1.0 + 0.14 * waveColDepth * lap), 0.45, 3.2);
  if (uEnvironment != 0) {
    ao = mix(0.55, 1.0, smoothstep(0.08, 0.42, hgt));
  }

  // Light extinction & in-scattering with physical Turbidity / Clarity
  // uTurbidity modulates volume scattering sigma_s as light penetrates deeper into water
  float turb = clamp(uTurbidity, 0.05, 3.5);
  vec3 effSigS = uSigS * turb;
  vec3 sigT = uSigA + effSigS;

  // In deeper turbid water, sharp caustic patterns diffuse into soft scattered ambient light
  float causDiffuse = clamp((turb - 0.35) * 0.22 * depthHere, 0.0, 0.85);
  vec3 causAtten = mix(caus, vec3(1.0), causDiffuse);

  // Dynamic Underwater Shadow cast by swimming fish, turtle, and floating debris onto seabed
  // Dynamically rotates, elongates, and sweeps along the refracted sun vector sunT
  float floorShadow = computeUnderwaterShadow(FP, sunT, turb);
  float floorNdotL = (-sunT.y);
  if (uEnvironment == 0) {
    floorNdotL = clamp(dot(floorNormal, -sunT), 0.12, 1.0);
  }
  vec3 Esun = uSunColor * Ts * exp(-sigT*depthHere/(-sunT.y)) * causAtten * floorNdotL * mix(0.75, 1.0, ao);
  Esun *= (1.0 - floorShadow * 0.88);
  if (uEnvironment == 0) {
    vec3 Hfloor = normalize(-sunT - tr);
    float NdotH = clamp(dot(floorNormal, Hfloor), 0.0, 1.0);
    float floorSpec = pow(NdotH, 24.0) * floorSpecVal * 0.65;
    Esun += uSunColor * floorSpec * causAtten;
  }
  causAtten = mix(causAtten, vec3(0.06), floorShadow * 0.85);

  vec3 skyIrr = mix(vec3(0.55, 0.32, 0.20), vec3(0.62, 0.70, 0.78), clamp(uSun.y*2.5, 0.08, 1.0)) * PI * 0.22;
  if (uEnvironment == 0) {
    // 🌿 Kyoto Zen Garden ambient light: warm daylight filtered by garden canopy
    skyIrr = mix(vec3(0.48, 0.45, 0.38), vec3(0.45, 0.54, 0.44), clamp(uSun.y*2.0, 0.10, 1.0)) * PI * 0.22;
  }
  vec3 Esky = skyIrr * exp(-(uSigA + 0.4*effSigS)*depthHere*1.25) * ao;
  vec3 Lfloor = alb/PI * (Esun + Esky);

  vec3 Tv = exp(-sigT*s);
  float cosS = dot(sunT, -tr);
  // Henyey-Greenstein asymmetry factor g: shifts from forward-peaked (g=0.84 in clear water) to more diffuse/isotropic (g=0.62 in turbid water)
  float g = mix(0.84, 0.62, clamp((turb - 0.5) * 0.35, 0.0, 0.65));
  float ph = (1.0-g*g)/(4.0*PI*pow(1.0+g*g-2.0*g*cosS, 1.5));
  vec3 Lmid = uSunColor*Ts*exp(-sigT*depthHere*0.5/(-sunT.y))*(ph+0.02) + skyIrr*exp(-uSigA*depthHere*0.6)/(4.0*PI);
  vec3 Lin = (effSigS / max(sigT, vec3(1e-4))) * Lmid * (1.0 - Tv) * (2.2 + 1.2 * min(turb, 2.0));
  if (uEnvironment == 0) {
    // Serene spring pond: keep shallow shoreline water crystal-clear so bottom pebbles and sand are distinctly visible
    Lin *= 0.32 * clamp(depthHere / 0.70, 0.20, 1.0);
  }
  vec3 under = Lfloor*Tv + Lin;
  float causFloorLum = max(causAtten.r, max(causAtten.g, causAtten.b));
  float causTransmitted = (1.0 - F) * causFloorLum * Ts * exp(-sigT.y * depthHere * sunSlope) * dot(Tv, vec3(0.333));

  // Floating particles
  if (uEnvironment != 0) {
    for (int k=0;k<3;k++){
      float dz = 0.22 + 0.38*float(k);
      float tt = dz / max(-tr.y, 0.05);
      vec2 q = (P.xz + tr.xz*tt)*48.0 + vec2(uTime*(0.05+0.03*float(k)), uTime*0.02) + float(k)*17.0;
      vec2 id = floor(q), f = fract(q) - 0.5;
      float r = hash12(id + float(k)*13.1);
      vec2 of = vec2(hash12(id+3.1), hash12(id+7.7)) - 0.5;
      float fw = fwidth(q.x) + fwidth(q.y);
      float dot_ = smoothstep(0.10 + fw, 0.0, length(f - of*0.6)) * step(0.988, r) * step(tt, s);
      float fade = exp(-sigT.g*tt*2.0) * smoothstep(1.2, 0.3, fw);
      float pGlow = mix(1.0, 1.7, clamp(turb * 0.4, 0.0, 1.0));
      under += dot_ * fade * uSunColor * Ts * 0.022 * pGlow * mix(vec3(0.9,1.0,0.95), vec3(0.4,0.35,0.3), step(0.992, r));
    }
  } else {
    // Pure spring pond: delicate sun motes without muddy sediment clumps
    float tt = 0.35 / max(-tr.y, 0.05);
    vec2 q = (P.xz + tr.xz * tt) * 36.0 + vec2(uTime * 0.03, uTime * 0.015);
    vec2 id = floor(q), f = fract(q) - 0.5;
    float r = hash12(id + 11.7);
    if (r > 0.996 && tt < s) {
      float dot_ = smoothstep(0.08, 0.01, length(f));
      under += dot_ * uSunColor * Ts * 0.016 * vec3(1.0, 0.96, 0.88);
    }
  }

  // 1. Volumetric God Rays (Light Shafts)
  if (uGodRayIntensity > 0.01 && uSun.y > 0.02) {
    float marchLen = min(s, 3.8);
    float stepDist = marchLen / 5.0;
    vec3 rayShafts = vec3(0.0);
    float dither = hash12(gl_FragCoord.xy + fract(uTime * 3.17));
    for (int st = 0; st < 5; st++) {
      float distM = (float(st) + dither) * stepDist;
      vec3 Q = P + tr * distM;
      float rayDepth = max(P.y - Q.y, 0.0);
      vec2 beamSurfPos = Q.xz - sunT.xz * (rayDepth * sunSlope);
      vec4 bSurf = texture(uSurf, beamSurfPos / uL);
      float bWaveH = bSurf.x;
      vec2 bWaveSlope = bSurf.yz;
      vec3 bWaveN = normalize(vec3(-bWaveSlope.x, 1.0, -bWaveSlope.y));
      vec3 bWaveRay = refract(-uSun, bWaveN, 1.0 / IOR);
      float bEffDepth = max(rayDepth + bWaveH, 0.05);
      vec2 bWarp = (bWaveRay.xz / max(-bWaveRay.y, 0.05)) * bEffDepth - (sunT.xz * sunSlope) * rayDepth;
      vec2 beamUV = (Q.xz - sunT.xz * (rayDepth * sunSlope) + bWarp - uCausShift) / uL;
      vec3 beamCaus = texture(uCaus, beamUV, 1.0).rgb * uCausticsIntensity * (1.0 + clamp(bWaveH * 2.2, -0.4, 2.0));
      float beamLensing = 0.72 + 0.28 * sin(dot(beamUV * 36.0, vec2(1.1, 0.8)) + uTime * 2.2);
      vec3 beamAtten = exp(-sigT * (bEffDepth * sunSlope + distM));
      rayShafts += beamCaus * beamLensing * beamAtten * stepDist;
    }
    float rayPhase = (1.0 - 0.75 * 0.75) / (4.0 * PI * pow(1.0 + 0.75 * 0.75 - 2.0 * 0.75 * cosS, 1.5));
    float sunElevFactor = smoothstep(0.02, 0.42, uSun.y);
    float turbFactor = clamp(0.5 + turb * 0.85, 0.5, 3.2);
    vec3 godRayCol = rayShafts * uSunColor * Ts * rayPhase * uGodRayIntensity * sunElevFactor * turbFactor * 0.75;
    under += godRayCol;
    causTransmitted += (1.0 - F) * max(rayShafts.r, max(rayShafts.g, rayShafts.b)) * 0.40;
  }

  // 1.5 Marine Snow (부유 유기 미립자 / 海洋雪) drifting with currents (Ocean only)
  if (uMarineSnowEnabled == 1 && uEnvironment != 0) {
    vec3 snowP = P + tr * min(s * 0.45, 1.8);
    vec2 sCoord = snowP.xz * 16.0 + vec2(uTime * 0.05, -uTime * 0.03);
    vec2 sId = floor(sCoord), sFract = fract(sCoord) - 0.5;
    float sHash = hash12(sId);
    if (sHash > 0.86) {
      vec2 sOf = (vec2(hash12(sId + vec2(1.2)), hash12(sId + vec2(4.5))) - 0.5) * 0.6;
      float sDot = smoothstep(0.09, 0.02, length(sFract - sOf));
      float sFade = exp(-sigT.g * min(s * 0.45, 1.8));
      under += sDot * sFade * uSunColor * Ts * 0.038 * vec3(0.85, 0.95, 1.0);
    }
  }

  // 1.6 Rising Micro-Bubbles (해저 조약돌 틈에서 피어오르는 기포 스트림)
  if (uBubbleEnabled == 1) {
    for (int bi = 0; bi < 3; bi++) {
      float bOff = float(bi) * 2.094;
      vec2 bOrigin = vec2(cos(bOff) * 0.75, sin(bOff) * 0.75);
      float bCycle = fract(uTime * 0.32 + float(bi) * 0.33);
      float bY = -uDepth + bCycle * uDepth;
      float bWobX = sin(uTime * 4.5 + float(bi) * 2.7) * 0.035;
      float bWobZ = cos(uTime * 3.8 + float(bi) * 1.9) * 0.035;
      vec3 bPos = vec3(bOrigin.x + bWobX, bY, bOrigin.y + bWobZ);

      vec3 oc = P - bPos;
      float bB = dot(oc, tr);
      float bC = dot(oc, oc) - 0.0006;
      float bDisc = bB*bB - bC;
      if (bDisc > 0.0) {
        float bT = -bB - sqrt(bDisc);
        if (bT > 0.02 && bT < s) {
          vec3 bNorm = normalize((P + tr * bT) - bPos);
          float bGlint = pow(max(dot(bNorm, normalize(-tr + uSun)), 0.0), 32.0);
          vec3 bCol = vec3(0.92, 0.96, 1.0) * (0.35 + bGlint * 1.4) * uSunColor;
          under = mix(under, bCol, 0.72 * exp(-sigT.g * bT));
        }
      }
    }
  }

  // 2. 3D Fish School & Sea Turtle underwater intersection & shading
  float closestMarineT = s;
  vec3 marineNormal = vec3(0.0, 1.0, 0.0);
  vec3 marineColor = vec3(0.0);
  float marineSpec = 0.5;
  float marineRoughness = 0.28;
  float marineSSS = 0.5;
  vec3 marineSSSCol = vec3(0.9, 0.4, 0.2);
  float marineIrid = 0.0;
  float marineThickness = 0.15;
  bool hitMarine = false;

  // 1.8 Submerged Aquatic Plants & Water Lily Stems (수초 군락 및 연잎 줄기)
  if (uEnvironment == 0) {
    AquaticPlantHit ph = intersectPondVegetation(P, tr, closestMarineT);
    if (ph.t > 0.005 && ph.t < closestMarineT) {
      closestMarineT = ph.t;
      marineNormal = ph.n;
      marineColor = ph.col;
      marineSpec = 0.42;
      marineRoughness = 0.25;
      marineSSS = ph.sssAmount;
      marineSSSCol = ph.sssCol;
      marineIrid = 0.0;
      marineThickness = ph.thickness;
      hitMarine = true;
    }
  }

  // Fish School (Up to 12 Fish)
  if (uFishEnabled == 1) {
    for (int fi = 0; fi < 12; fi++) {
      if (fi >= uFishCount) break;
      FishHit fh = intersectFish(P, tr, uFishPos[fi], uFishDir[fi], uFishCol[fi]);
      if (fh.t > 0.005 && fh.t < closestMarineT) {
        closestMarineT = fh.t;
        marineNormal = fh.n;
        marineColor = fh.col;
        marineSpec = fh.spec;
        marineRoughness = fh.roughness;
        marineSSS = fh.sssAmount;
        marineSSSCol = fh.sssCol;
        marineIrid = fh.irid;
        marineThickness = fh.thickness;
        hitMarine = true;
      }
    }
  }

  // 3D Majestic Green Sea Turtle (Chelonia mydas)
  if (uTurtleEnabled == 1) {
    TurtleHit th = intersectTurtle(P, tr, uTurtlePos, uTurtleDir, uTurtleCol);
    if (th.t > 0.005 && th.t < closestMarineT) {
      closestMarineT = th.t;
      marineNormal = th.n;
      marineColor = th.col;
      marineSpec = th.spec;
      marineRoughness = th.roughness;
      marineSSS = th.sssAmount;
      marineSSSCol = th.sssCol;
      marineIrid = th.irid;
      marineThickness = th.thickness;
      hitMarine = true;
    }
  }

  if (hitMarine) {
    vec3 QMarine = P + tr * closestMarineT;
    float marineDepth = max(P.y - QMarine.y, 0.0);
    vec2 mSurfPos = QMarine.xz - sunT.xz * (marineDepth * sunSlope);
    vec4 mSurfWave = texture(uSurf, mSurfPos / uL);
    float mWaveH = mSurfWave.x;
    vec2 mWaveSlope = mSurfWave.yz;
    vec3 mWaveN = normalize(vec3(-mWaveSlope.x, 1.0, -mWaveSlope.y));
    vec3 mWaveRay = refract(-uSun, mWaveN, 1.0 / IOR);
    float mEffDepth = max(marineDepth + mWaveH, 0.05);
    vec2 mWarp = (mWaveRay.xz / max(-mWaveRay.y, 0.05)) * mEffDepth - (sunT.xz * sunSlope) * marineDepth;
    vec2 cuvMarine = (QMarine.xz - uCausShift + mWarp) / uL;
    vec2 mDisp = mWaveSlope * 0.015 * (mEffDepth / 1.6);
    float mCausR = texture(uCaus, cuvMarine + mDisp * 1.3, 1.0).r;
    float mCausG = texture(uCaus, cuvMarine, 1.0).g;
    float mCausB = texture(uCaus, cuvMarine - mDisp * 1.3, 1.0).b;
    vec3 causMarine = vec3(mCausR, mCausG, mCausB) * uCausticsIntensity * (1.0 + clamp(mWaveH * 2.5, -0.5, 2.4));

    vec3 L = -sunT; // Refracted sun vector pointing toward sun
    vec3 V = -tr;   // Eye view vector pointing toward camera
    vec3 N = marineNormal;

    // 1. Multi-wavelength wrapped subsurface diffusion (Curvature SSS)
    // Red wavelengths penetrate deeper through biological tissue/blood than green/blue
    vec3 sssWrap = vec3(0.50, 0.36, 0.24);
    vec3 diffuseWrap = clamp((dot(N, L) + sssWrap) / (vec3(1.0) + sssWrap), 0.0, 1.0);
    vec3 sunAtten = exp(-sigT * (marineDepth / max(-sunT.y, 0.05)));

    // Focused caustics modulate sunlit surfaces
    float causticsFactor = clamp(causMarine.g * 1.25, 0.55, 2.2) * (0.35 + 0.65 * max(N.y, 0.0));
    vec3 sunKey = min(uSunColor, vec3(2.6));
    // Calibrated direct lighting scale prevents tone mapping overexposure so koi pigments stay deeply saturated
    float directScale = (uEnvironment == 0) ? 0.42 : 0.85;
    vec3 surfaceDirect = sunKey * Ts * sunAtten * diffuseWrap * causticsFactor * directScale;

    // 2. Dermal Subsurface Bleeding (Penumbra / Shadow Terminator Glow)
    float terminator = 1.0 - abs(dot(N, L));
    float dermalScatter = pow(clamp(terminator, 0.0, 1.0), 3.0) * marineSSS;
    vec3 dermalGlow = marineSSSCol * dermalScatter * sunKey * Ts * sunAtten * (uEnvironment == 0 ? 0.45 : 1.15);

    // 3. Forward Translucency / Backlight SSS (Thin Fins, Tail, Flippers, Margins)
    vec3 transLightDir = L + N * 0.28;
    float forwardScatter = pow(clamp(dot(V, -transLightDir), 0.0, 1.0), 4.5);
    vec3 tissueAttenuation = exp(-vec3(1.2, 2.6, 4.2) * (marineThickness / 0.04));
    vec3 sssTransmitted = sunKey * Ts * sunAtten * forwardScatter * tissueAttenuation * marineSSSCol * marineSSS * (uEnvironment == 0 ? 0.95 : 2.2);
    sssTransmitted *= (0.65 + 0.35 * clamp(causMarine.g * 1.3, 0.4, 2.0));

    // 4. Ambient skylight & Internal Volume Scattering
    float skyHemisphere = max(N.y * 0.5 + 0.5, 0.0);
    vec3 surfaceAmbient = skyIrr * exp(-(uSigA + 0.35 * effSigS) * marineDepth) * (0.45 + 0.55 * skyHemisphere);
    vec3 internalAmbient = surfaceAmbient * marineSSSCol * (0.40 + 0.60 * marineSSS);

    // 5. Upwelling diffuse seabed bounce
    float underBounceFactor = max(-N.y, 0.0);
    vec3 seabedBounce = alb * 0.22 * sunKey * Ts * exp(-sigT * depthHere * 0.65) * underBounceFactor;

    // 6. Guanine Platelet Iridescent Thin-Film Interference
    float cosNV = clamp(dot(N, V), 0.0, 1.0);
    vec3 iridSpectrum = 0.5 + 0.5 * cos(6.28318 * (vec3(0.12, 0.48, 0.85) + (1.0 - cosNV) * 1.25));
    vec3 iridEffect = iridSpectrum * marineIrid * 0.55;

    // 7. Dual-Lobe Physically-Based Specular Sheen (24K Gold Metallic vs Dielectric wet sheen)
    vec3 H = normalize(V + L);
    float NdotH = max(dot(N, H), 0.0);
    float wetGlint = pow(NdotH, 64.0) * marineSpec * 0.65;
    float roughExp = mix(28.0, 8.0, marineRoughness);
    float roughGlint = pow(NdotH, roughExp) * (1.0 - marineRoughness * 0.5) * 0.35;
    bool isMetallicGold = (uEnvironment == 0 && marineSpec > 1.2);
    vec3 specTint = isMetallicGold ? vec3(1.0, 0.88, 0.42) : vec3(1.0);
    float F0 = isMetallicGold ? 0.62 : 0.04;
    float fresnelSpec = F0 + (1.0 - F0) * pow(1.0 - cosNV, 5.0);
    vec3 specularLight = min(uSunColor, vec3(2.4)) * specTint * (wetGlint * 0.70 + roughGlint * 0.30) * fresnelSpec * (uEnvironment == 0 ? 0.88 : 1.4) * causticsFactor;

    // Composite total scattered radiance with rich, unclipped color saturation
    vec3 albedoWithIrid = marineColor + iridEffect;
    vec3 diffuseLight = surfaceDirect + surfaceAmbient + seabedBounce + dermalGlow + internalAmbient;
    vec3 Lmarine = albedoWithIrid * diffuseLight + sssTransmitted + specularLight;

    vec3 TvMarine = exp(-sigT * closestMarineT);
    vec3 LinMarine = (effSigS / max(sigT, vec3(1e-4))) * Lmid * (1.0 - TvMarine) * (2.0 + 1.0 * min(turb, 2.0));
    under = Lmarine * TvMarine + LinMarine;
  }

  float surfFresnel = (uEnvironment == 0) ? max(F, 0.042) : F;
  vec3 col = surfFresnel*refl + (1.0-surfFresnel)*under + spec;

  // Water Surface Meniscus & Air-Water Liquid Boundary distinction (수면 밖과 안의 경계 구분 명확화)
  if (hitMarine) {
    vec3 QMarine = P + tr * closestMarineT;
    float mDepth = max(P.y - QMarine.y, 0.0);
    // Subtle physical water surface film & meniscus liquid sheen
    float meniscus = (1.0 - smoothstep(0.01, 0.22, mDepth));
    vec3 waterSheen = mix(vec3(0.02, 0.07, 0.05), refl, 0.35) * meniscus * 0.22;
    col += waterSheen * (1.0 - surfFresnel);
  }

  // 🌿 Procedural Water Lily Pads (연잎) & Lotus Blossoms (수련 꽃) on surface across the expansive watercourse
  if (uEnvironment == 0 || uDebrisEnabled == 1) {
    for (int pi = 0; pi < 16; pi++) {
      if (pi >= uLilyCount) break;
      vec2 padBasePos = uLilyData[pi].xy;
      float padRad = uLilyData[pi].z;
      float padAng = uLilyData[pi].w;
      int padFlower = int(uLilyMeta[pi].x + 0.5);
      float flowerScale = uLilyMeta[pi].y;

      // 🌊 Sample FFT Wave Spectrum Displacement at the lily pad's base location
      vec4 padWaveA = texture(uSurf, padBasePos / uL);
      vec4 padWaveB = texture(uSurf, (M * padBasePos) / (uL * SC) + 0.37);
      vec2 padRuv = (padBasePos - uRipCenter) / uRipSize + 0.5;
      vec4 padWaveR = texture(uRip, padRuv);
      float padAmbH;
      vec2 padAmbSlope = getAmbientRipples(padBasePos, uTime, uEnvironment, padAmbH);

      // Local wave slope vector from FFT wave spectrum + interactive ripples
      vec2 padWaveSlope = padWaveA.yz + WB * (transpose(M) * padWaveB.yz) + padWaveR.yz + padAmbSlope;

      // Trochoidal choppy orbital wave displacement (Lagrangian horizontal particle motion)
      vec2 padChopDisp = -padWaveSlope * (uChoppiness * 0.052);

      // Gentle natural surface current & hydrodynamic bobbing
      vec2 padHydroDrift = vec2(
        sin(uTime * 0.72 + float(pi) * 1.55),
        cos(uTime * 0.62 + float(pi) * 2.25)
      ) * 0.026;

      // Dynamic floating pad center following FFT wave simulation parameters in real-time
      vec2 floatingPadPos = padBasePos + padChopDisp + padHydroDrift;

      // Local floating coordinates on the wave-displaced pad
      vec2 rel = P.xz - floatingPadPos;
      float r = length(rel);

      // Underlying wave surface normal dynamically tilting the floating pad
      vec3 padWaveN = normalize(vec3(-padWaveSlope.x, 1.0, -padWaveSlope.y));

      // Step 1: Green Water Lily Pad with characteristic V-notch cleft (연잎 먼저 렌더링)
      if (r < padRad) {
        float phi = atan(rel.y, rel.x + 1e-6) - padAng;
        float phiNorm = abs(atan(sin(phi), cos(phi)));
        // Characteristic V-notch cleft of water lily pad
        if (phiNorm > 0.20) {
          float uR = r / padRad;
          float veins = 0.5 + 0.5 * cos(phi * 18.0);
          float rim = smoothstep(0.82, 0.98, uR);

          // Waxy deep forest-jade leaf green with radiating veins & bronze rim
          vec3 leafDark = vec3(0.04, 0.22, 0.06);
          vec3 leafMid = vec3(0.08, 0.32, 0.10);
          vec3 leafAlbedo = mix(leafDark, leafMid, veins * 0.45);
          vec3 rimCol = vec3(0.38, 0.22, 0.08); // Bronze rim
          leafAlbedo = mix(leafAlbedo, rimCol, rim);

          // Leaf normal: rides on top of padWaveN + gentle raised outer rim (C^1 continuous)
          vec2 normRel = normalize(rel + vec2(1e-4));
          vec3 leafN = normalize(padWaveN + vec3(normRel.x * rim * 0.38, 0.0, normRel.y * rim * 0.38));

          // Shimmering waxy specular sheen aligned with wave tilt
          float leafNdotL = max(dot(leafN, uSun), 0.0);
          vec3 leafH = normalize(v + uSun);
          float leafGlint = pow(max(dot(leafN, leafH), 0.0), 32.0) * 0.55;

          // Translucent Chlorophyll Subsurface Scattering (Wrapped SSS) through waxy leaf
          float leafSSS = max(0.0, dot(-leafN, uSun) * 0.5 + 0.5);
          vec3 leafTranslucency = vec3(0.09, 0.38, 0.08) * pow(leafSSS, 2.0) * min(uSunColor, vec3(2.0)) * 0.35;

          // Water surface tension meniscus ring along the outer perimeter (수면 표면장력 메니스커스 광채)
          float meniscusMask = smoothstep(0.92, 1.0, uR) * (1.0 - smoothstep(1.0, 1.06, uR));
          vec3 meniscusSheen = min(uSunColor, vec3(3.0)) * pow(max(dot(reflect(wd, padWaveN), uSun), 0.0), 48.0) * meniscusMask * 0.65;

          // Shimmering natural circular water droplet beads on waxy cuticle
          float dropHash = hash12(floor(rel * 36.0 + vec2(0.3)) + float(pi) * 7.1);
          vec2 dropFract = fract(rel * 36.0 + vec2(0.3)) - 0.5;
          float dropDist = length(dropFract);
          float isBead = step(0.982, dropHash) * smoothstep(0.35, 0.08, dropDist);
          leafGlint += isBead * 1.5;

          vec3 ambientPlant = vec3(0.24, 0.26, 0.20);
          vec3 leafLighting = leafAlbedo * (ambientPlant + min(uSunColor, vec3(2.5)) * (leafNdotL * 0.70 + 0.30))
                            + leafTranslucency
                            + min(uSunColor, vec3(2.5)) * leafGlint
                            + meniscusSheen;

          // Smooth edge anti-aliasing against water
          float edgeAlpha = smoothstep(1.0, 0.94, uR) * smoothstep(0.20, 0.25, phiNorm);
          col = mix(col, leafLighting, edgeAlpha);
        }
      }

      // Step 2: Blooming Lotus Blossom (수련 꽃) - elevated radiant petals bobbing with FFT waves
      if (padFlower > 0 && r < padRad * flowerScale) {
        float flowerR = padRad * flowerScale;
        float uF = r / flowerR;
        float flowerPhi = atan(rel.y, rel.x + 1e-6) - float(pi) * 1.57;

        // Multi-tier petals: 8 outer petals + 8 inner petals + central golden stamens
        float outerPetals = cos(flowerPhi * 8.0) * 0.5 + 0.5;
        float innerPetals = cos(flowerPhi * 8.0 + 0.392) * 0.5 + 0.5;
        float petalBound = mix(0.72, 1.0, outerPetals);
        if (uF < 0.65) petalBound = mix(0.40, 0.78, innerPetals);

        if (uF < petalBound) {
          // Petal colors: 
          // 1. Nelumbo Sacred Rose-Magenta Lotus (padFlower == 1): Vibrant magenta-rose with silky cream base
          vec3 petalRoseMagenta = vec3(0.96, 0.12, 0.46);
          vec3 petalRoseCream = vec3(1.0, 0.85, 0.92);
          vec3 petalTip = (padFlower == 1) ? petalRoseMagenta : vec3(0.98, 0.98, 1.0);
          vec3 flowerCol = mix(petalRoseCream, petalTip, smoothstep(0.18, 0.90, uF));

          // 2. Pure White Jade Lotus (padFlower == 2): Silky crystalline white with jade base and soft blush
          if (padFlower == 2) {
            flowerCol = mix(vec3(0.78, 0.92, 0.76), vec3(0.98, 0.98, 0.99), smoothstep(0.08, 0.42, uF));
            flowerCol = mix(flowerCol, vec3(0.98, 0.50, 0.70), smoothstep(0.72, 1.0, uF) * 0.40);
          }

          // Luminous golden stamen core with jade torus seedpod (연밥)
          if (uF < 0.28) {
            float stamenP = sin(flowerPhi * 16.0) * 0.5 + 0.5;
            vec3 stamenGold = mix(vec3(1.0, 0.78, 0.02), vec3(1.0, 0.60, 0.01), stamenP);
            vec3 seedpodJade = vec3(0.20, 0.55, 0.16);
            flowerCol = mix(seedpodJade, stamenGold, smoothstep(0.08, 0.18, uF));
          }

          // Flower normal: petals cup upward from wave surface normal
          vec2 normRel = normalize(rel + vec2(1e-5));
          vec3 flowerN = normalize(padWaveN + vec3(normRel.x * uF * 0.42, 0.0, normRel.y * uF * 0.42));
          float fNdotL = max(dot(flowerN, uSun), 0.0);
          vec3 fH = normalize(v + uSun);
          float flowerGlint = pow(max(dot(flowerN, fH), 0.0), 32.0) * 0.55;

          vec3 fAmbient = vec3(0.24, 0.25, 0.22);
          vec3 flowerLighting = flowerCol * (fAmbient + min(uSunColor, vec3(2.5)) * (fNdotL * 0.65 + 0.35))
                              + min(uSunColor, vec3(2.5)) * flowerGlint;
          float flowerAlpha = smoothstep(petalBound, petalBound - 0.04, uF);
          col = mix(col, flowerLighting, flowerAlpha);
        }
      }
    }

    // Floating Japanese Momiji Autumn Maple Leaves drifting on calm pond water
    vec2 leafUV = P.xz * 0.85;
    vec2 leafCell = floor(leafUV);
    float leafSeed = hash12(leafCell);
    if (leafSeed > 0.86) {
      vec2 leafCenter = (leafCell + vec2(hash12(leafCell + vec2(1.2)), hash12(leafCell + vec2(3.7)))) / 0.85;
      vec2 leafRel = P.xz - leafCenter;
      float dM = length(leafRel);
      if (dM < 0.065) {
        float aM = atan(leafRel.y, leafRel.x) + leafSeed * 6.28;
        float lobes = 0.045 + 0.020 * (cos(aM * 5.0) + 0.5 * cos(aM * 10.0));
        if (dM < lobes) {
          vec3 mapleCol = mix(vec3(0.82, 0.16, 0.08), vec3(0.95, 0.42, 0.10), hash12(leafCell + vec2(9.1)));
          float mNdotL = max(uSun.y, 0.0);
          vec3 mapleLight = mapleCol * (sky(vec3(0.0, 1.0, 0.0)) * 0.40 + uSunColor * mNdotL * 0.85);
          float mapleAlpha = smoothstep(lobes, lobes * 0.85, dM);
          col = mix(col, mapleLight, mapleAlpha * 0.92);
        }
      }
    }
  }

  // Floating Debris on surface (driftwood in River/Ocean)
  if (uDebrisEnabled == 1 && uEnvironment != 0) {
    float closestDebT = dist;
    vec3 debNormal = vec3(0.0, 1.0, 0.0);
    vec3 debColor = vec3(0.0);
    float debSpec = 0.25;
    bool hitAnyDebris = false;

    for (int di = 0; di < 4; di++) {
      DebrisHit dh = intersectDebris(uCam, wd, uDebrisPos[di], uDebrisRot[di]);
      if (dh.t > 0.01 && dh.t < closestDebT) {
        closestDebT = dh.t;
        debNormal = dh.n;
        debColor = dh.col;
        debSpec = dh.spec;
        hitAnyDebris = true;
      }
    }

    if (hitAnyDebris) {
      vec3 debRefl = sky(reflect(wd, debNormal));
      float debNdotL = max(dot(debNormal, uSun), 0.0);
      vec3 debH = normalize(v + uSun);
      float debGlint = pow(max(dot(debNormal, debH), 0.0), 24.0) * debSpec;
      vec3 debLighting = debColor * (sky(vec3(0.0, 1.0, 0.0)) * 0.45 + uSunColor * debNdotL) + debRefl * 0.15 + uSunColor * debGlint;
      col = debLighting;
    }
  }

  // Distant haze
  float haze = 1.0 - exp(-dist*0.004);
  float muh = max(dot(normalize(vec3(wd.x,0.0,wd.z)), uSun), 0.0);
  vec3 baseHaze = mix(vec3(0.72, 0.45, 0.28), vec3(0.60, 0.71, 0.82), clamp(uSun.y*2.2, 0.08, 1.0));
  vec3 hazeC = baseHaze + normalize(uSunColor + 1e-4)*(0.22*pow(muh,6.0)+0.3*pow(muh,64.0));
  col = mix(col, hazeC*0.95, haze*0.8);

  // Horizon & Sky
  vec3 skyc = sky(rd);
  float mu = dot(rd, uSun);
  skyc += uSunColor*3.0*smoothstep(0.99996, 0.999985, mu);
  float hz = smoothstep(-0.0005, 0.0015, rd.y);
  col = mix(col, skyc, hz);

  // 🌿 Blend translucent garden/stone elements smoothly over the water surface
  if (hasOverlay) {
    col = mix(col, overlayCol, overlayAlpha);
  }

  o = vec4(max(col, 0.0), 1.0);
}`,
      'water'
    );

    // 8. Post-processing Programs
    this.pBright = this.createProgram(
      VS,
      HEAD +
        `
uniform sampler2D uSrc; uniform float uThr;
void main(){
  vec2 px = 1.0/vec2(textureSize(uSrc,0));
  vec3 c = vec3(0);
  for (int y=-1;y<=2;y++) for (int x=-1;x<=2;x++) c += texture(uSrc, vUv + (vec2(x,y)-0.5)*px*1.0).rgb;
  c /= 16.0;
  float l = max(max(c.r,c.g),c.b);
  float k = max(l - uThr, 0.0) / max(l, 1e-4);
  o = vec4(min(c*k, vec3(160.0)), 1);
}`,
      'bright'
    );

    this.pBlur = this.createProgram(
      VS,
      HEAD +
        `
uniform sampler2D uSrc; uniform vec2 uDir;
void main(){
  vec2 px = uDir/vec2(textureSize(uSrc,0));
  vec3 c = texture(uSrc, vUv).rgb*0.2270270270;
  c += (texture(uSrc, vUv+px*1.3846153846).rgb + texture(uSrc, vUv-px*1.3846153846).rgb)*0.3162162162;
  c += (texture(uSrc, vUv+px*3.2307692308).rgb + texture(uSrc, vUv-px*3.2307692308).rgb)*0.0702702703;
  o = vec4(c,1);
}`,
      'blur'
    );

    this.pCopy = this.createProgram(
      VS,
      HEAD + `uniform sampler2D uSrc; uniform float uK; void main(){ o = vec4(texture(uSrc,vUv).rgb*uK,1); }`,
      'copy'
    );

    this.pRaw = this.createProgram(
      VS,
      HEAD + `uniform sampler2D uSrc; void main(){ o = texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0); }`,
      'raw'
    );

    this.pFinal = this.createProgram(
      VS,
      HEAD +
        `
uniform sampler2D uHdr, uStreak, uB1, uB2; uniform float uExp, uTime, uNoPost, uBloomMul, uGlareMul, uHdrToneMap, uHdrHeadroom; uniform vec2 uRes;
vec3 bicubic(sampler2D t, vec2 uv){
  vec2 ts = vec2(textureSize(t,0)); vec2 p = uv*ts - 0.5; vec2 f = fract(p); p = floor(p);
  vec2 w0 = f*(-0.5+f*(1.0-0.5*f)), w1 = 1.0+f*f*(-2.5+1.5*f), w2 = f*(0.5+f*(2.0-1.5*f)), w3 = f*f*(-0.5+0.5*f);
  vec2 g0 = w0+w1, g1 = w2+w3; vec2 h0 = (w1/g0 - 0.5 + p)/ts, h1 = (w3/g1 + 1.5 + p)/ts;
  return (texture(t, vec2(h0.x,h0.y)).rgb*g0.x + texture(t, vec2(h1.x,h0.y)).rgb*g1.x)*g0.y + (texture(t, vec2(h0.x,h1.y)).rgb*g0.x + texture(t, vec2(h1.x,h1.y)).rgb*g1.x)*g1.y;
}
vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
vec3 reinhard(vec3 x){ return clamp(x / (vec3(1.0) + x), 0.0, 1.0); }
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec2 uv = vUv;
  vec2 cc = uv-0.5; float ca = 0.0012*dot(cc,cc)*4.0;
  vec3 c;
  c.r = texture(uHdr, uv + cc*ca).r; c.g = texture(uHdr, uv).g; c.b = texture(uHdr, uv - cc*ca).b;
  if (uNoPost < 0.5) c += texture(uStreak, uv).rgb * (0.9 * uGlareMul);
  if (uNoPost < 0.5) c += (texture(uB1, uv).rgb * 0.035 + bicubic(uB2, uv) * 0.035) * uBloomMul;
  if (uNoPost > 1.5) c = texture(uStreak, uv).rgb * 0.55 * 20.0 * uGlareMul;
  c *= uExp;
  float vig = 1.0 - 0.22*dot(cc*vec2(1.0,0.8), cc*vec2(1.0,0.8))*2.2;
  c *= vig;

  // Tone Mapping: Chrominance-preserving tone curve prevents saturation blowout and pastel washout
  vec3 hdrMapped = aces(c * max(0.5, uHdrHeadroom));
  float inLum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 sdrMapped = c / (vec3(1.0) + vec3(inLum * 0.90));
  c = mix(sdrMapped, hdrMapped, clamp(uHdrToneMap, 0.0, 1.0));

  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Rich natural biological saturation: vibrant koi pigments, lush emerald moss, and radiant lotus blossoms
  c = mix(vec3(lum), c, 1.14);
  c = clamp(c, 0.0, 1.0);
  c = pow(c, vec3(1.0/2.2));
  float g = hash(gl_FragCoord.xy + fract(uTime*7.13)*917.0) - 0.5;
  c += g * 0.015 * (1.0 - c*0.6);
  o = vec4(c, 1);
}`,
      'final'
    );

    // 9. Glare FFT Programs
    this.pFFTg = this.createProgram(
      VS,
      HEAD +
        `
uniform sampler2D uSrc; uniform int uP, uHoriz, uHalf; uniform float uSign;
vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x-a.y*b.y, a.x*b.y+a.y*b.x); }
void main(){
  ivec2 id = ivec2(gl_FragCoord.xy);
  int j = uHoriz==1 ? id.x : id.y;
  int k = j & (uP-1);
  int i = ((j - (j & (2*uP-1))) >> 1) + k;
  bool y1 = (j & uP) != 0;
  ivec2 a = uHoriz==1 ? ivec2(i, id.y) : ivec2(id.x, i);
  ivec2 b = uHoriz==1 ? ivec2(i+uHalf, id.y) : ivec2(id.x, i+uHalf);
  vec4 x0 = texelFetch(uSrc, a, 0), x1 = texelFetch(uSrc, b, 0);
  float ang = uSign*3.14159265359*float(k)/float(uP);
  vec2 w = vec2(cos(ang), sin(ang));
  vec4 wx = vec4(cmul(w,x1.xy), cmul(w,x1.zw));
  o = y1 ? x0-wx : x0+wx;
}`,
      'fftGlare'
    );

    this.pGSrc = this.createProgram(
      VS,
      HEAD +
        `
uniform sampler2D uSrc; uniform float uThr, uWhich;
void main(){
  vec2 px = 1.0/vec2(textureSize(uSrc,0));
  vec3 c = vec3(0);
  for (int y=0;y<2;y++) for (int x=0;x<2;x++) c += texture(uSrc, vUv + (vec2(x,y)-0.5)*px*2.0).rgb;
  c *= 0.25;
  float l = max(max(c.r,c.g),c.b);
  c *= max(l - uThr, 0.0)/max(l, 1e-4);
  c = min(c, vec3(80000.0)) * 1e-3;
  o = uWhich < 0.5 ? vec4(c.r, 0.0, c.g, 0.0) : vec4(c.b, 0.0, 0.0, 0.0);
}`,
      'glareSrc'
    );

    this.pGMul = this.createProgram(
      VS,
      HEAD +
        `
uniform sampler2D uSrc, uK;
vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x-a.y*b.y, a.x*b.y+a.y*b.x); }
void main(){ ivec2 id = ivec2(gl_FragCoord.xy); vec4 a = texelFetch(uSrc,id,0), k = texelFetch(uK,id,0); o = vec4(cmul(a.xy,k.xy), cmul(a.zw,k.zw)); }`,
      'glareMul'
    );

    this.pGOut = this.createProgram(
      VS,
      HEAD +
        `
uniform sampler2D uA, uB;
void main(){ ivec2 id = ivec2(gl_FragCoord.xy); vec4 a = texelFetch(uA,id,0), b = texelFetch(uB,id,0);
  o = vec4(max(vec3(a.x, a.z, b.x), 0.0)*1e3, 1); }`,
      'glareOut'
    );
  }

  /* ---------------- FFT Wave Spectrum ---------------- */
  private buildH0(targetSlope: number, windSpeed = 6.0): WebGLTexture {
    const gl = this.gl;
    const N = this.N;
    const L = this.L;
    // Peak wavelength in meters scales dynamically with wind speed (Phillips/Pierson-Moskowitz model)
    const peakWavelength = Math.max(0.12, 0.18 + 0.075 * windSpeed);
    const kp = (2 * Math.PI) / peakWavelength;
    const kcut = (2 * Math.PI) / 0.045;
    const swellWavelength = Math.max(0.4, 0.5 + 0.18 * windSpeed);
    const wd = [0.8, 0.6];
    const re = new Float32Array(N * N);
    const im = new Float32Array(N * N);

    let seed = 7;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = () => {
      let u = 0,
        v = 0;
      while (!u) u = rnd();
      v = rnd();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    let s2 = 0;
    for (let m = 0; m < N; m++) {
      for (let n = 0; n < N; n++) {
        const nx = n < N / 2 ? n : n - N;
        const nz = m < N / 2 ? m : m - N;
        const kx = (2 * Math.PI * nx) / L;
        const kz = (2 * Math.PI * nz) / L;
        const k = Math.hypot(kx, kz);
        let P = 0;
        if (k > 1e-6) {
          const lk = Math.log(k / kp);
          const bump = Math.exp(-0.5 * Math.pow(lk / 0.36, 2));
          const tail = 0.035 * Math.exp(-Math.pow(kp / k, 2)) * Math.exp(-Math.pow(k / kcut, 2));
          const swell = 0.35 * Math.exp(-0.5 * Math.pow(Math.log(k / ((2 * Math.PI) / swellWavelength)) / 0.3, 2));
          const c = (kx * wd[0] + kz * wd[1]) / k;
          // Directional spreading sharpens with increasing wind speed
          const windExp = Math.min(4.0, 1.2 + windSpeed * 0.15);
          const spread = (0.2 + 0.8 * Math.pow(Math.max(0.0, c), windExp)) * (c < 0 ? 0.25 : 1.0);
          P = ((bump + tail + swell) * spread) / (k * k * k * k);
        }
        const a = Math.sqrt(P / 2);
        const i = m * N + n;
        re[i] = gauss() * a;
        im[i] = gauss() * a;
        s2 += 2 * k * k * (re[i] * re[i] + im[i] * im[i]);
      }
    }

    // Physical wave amplitude scale driven by wind speed
    const effectiveSlope = targetSlope * Math.pow(windSpeed / 6.0, 0.55);
    const sc = effectiveSlope / Math.sqrt(Math.max(s2, 1e-8));
    const data = new Float32Array(N * N * 4);
    for (let m = 0; m < N; m++) {
      for (let n = 0; n < N; n++) {
        const i = m * N + n;
        const j = ((N - m) % N) * N + ((N - n) % N);
        data[i * 4] = re[i] * sc;
        data[i * 4 + 1] = im[i] * sc;
        data[i * 4 + 2] = re[j] * sc;
        data[i * 4 + 3] = -im[j] * sc;
      }
    }

    const t = this.createTexture(N, N, gl.RGBA32F, { filter: gl.NEAREST, wrap: gl.REPEAT });
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RGBA, gl.FLOAT, data);
    return t;
  }

  public updateWaveSpectrum(slope?: number, windSpeed?: number) {
    const s = slope ?? this.config.waveScale;
    const w = windSpeed ?? this.config.windSpeed ?? 6.0;
    if (this.h0Tex) {
      this.gl.deleteTexture(this.h0Tex);
    }
    this.h0Tex = this.buildH0(s, w);
  }

  public updateWaveSlope(slope: number) {
    this.updateWaveSpectrum(slope, this.config.windSpeed);
  }

  private runFFT(t: number) {
    const gl = this.gl;
    if (!this.fftA || !this.fftB || !this.surfRT || !this.h0Tex) return;

    gl.disable(gl.BLEND);
    this.setTarget(this.fftA);
    gl.useProgram(this.pSpec.p);
    this.bindT(0, this.h0Tex);
    gl.uniform1i(this.pSpec.u.uH0, 0);
    gl.uniform1f(this.pSpec.u.uT, t);
    gl.uniform1f(this.pSpec.u.uL, this.L);

    // Dynamic wave phase frequency and real-time amplitude modulation
    const wind = this.config.windSpeed ?? 6.0;
    const freqMult = 0.72 + 0.28 * Math.sqrt(wind / 6.0);
    const ampMult = Math.pow(wind / 6.0, 0.45);
    gl.uniform1f(this.pSpec.u.uFreqMult, freqMult);
    gl.uniform1f(this.pSpec.u.uAmpMult, ampMult);

    this.drawFullscreen();

    gl.useProgram(this.pFFT.p);
    gl.uniform1i(this.pFFT.u.uSrc, 0);
    let src = this.fftA;
    let dst = this.fftB;

    for (let horiz = 1; horiz >= 0; horiz--) {
      for (let s = 0; s < this.LOGN; s++) {
        this.setTarget(dst);
        this.bindT(0, src.t);
        gl.uniform1i(this.pFFT.u.uP, 1 << s);
        gl.uniform1i(this.pFFT.u.uHoriz, horiz);
        this.drawFullscreen();
        const tmp = src;
        src = dst;
        dst = tmp;
      }
    }

    this.setTarget(this.surfRT);
    gl.useProgram(this.pResolve.p);
    this.bindT(0, src.t);
    gl.uniform1i(this.pResolve.u.uSrc, 0);
    gl.uniform1f(this.pResolve.u.uChoppiness, this.config.choppiness ?? 1.1);
    this.drawFullscreen();

    gl.bindTexture(gl.TEXTURE_2D, this.surfRT.t);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  /* ---------------- Interactive Ripples ---------------- */
  private stepRipples(shiftUV: [number, number]) {
    const gl = this.gl;
    if (!this.ripN || this.rip.length < 2) return;

    gl.disable(gl.BLEND);
    gl.useProgram(this.pRipple.p);
    gl.uniform1i(this.pRipple.u.uSrc, 0);

    const src = this.rip[this.ripIdx];
    const dst = this.rip[1 - this.ripIdx];
    this.setTarget(dst);
    this.bindT(0, src.t);
    gl.uniform2f(this.pRipple.u.uShift, shiftUV[0], shiftUV[1]);

    const d = this.drops.shift();
    gl.uniform4f(this.pRipple.u.uDrop, d ? d[0] : 0, d ? d[1] : 0, d ? d[2] : 0, d ? d[3] : 0);
    this.drawFullscreen();
    this.ripIdx = 1 - this.ripIdx;

    this.setTarget(this.ripN);
    gl.useProgram(this.pRipN.p);
    this.bindT(0, this.rip[this.ripIdx].t);
    gl.uniform1i(this.pRipN.u.uSrc, 0);
    gl.uniform1f(this.pRipN.u.uTexel, this.RSIZE / this.RN);
    this.drawFullscreen();
  }

  public triggerRipple(u: number, v: number, radius = 0.024, strength = 0.075) {
    this.drops.push([u, v, radius, strength]);
    this.ripActive = 0;
  }

  public addDisturbance(wx: number, wz: number, radius = 0.03, strength = 0.05) {
    if (!this.ripCenter) return;
    const u = (wx - this.ripCenter[0]) / this.RSIZE + 0.5;
    const v = (wz - this.ripCenter[1]) / this.RSIZE + 0.5;
    if (u >= 0.02 && u <= 0.98 && v >= 0.02 && v <= 0.98) {
      this.triggerRipple(u, v, radius, strength);
    }
  }

  /* ---------------- Caustics ---------------- */
  private renderCaustics(sun: [number, number, number]) {
    const gl = this.gl;
    if (!this.causRT || !this.surfRT || !this.gridVAO) return;

    this.setTarget(this.causRT);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.pCaus.p);
    this.bindT(0, this.surfRT.t);
    gl.uniform1i(this.pCaus.u.uSurf, 0);
    gl.uniform1f(this.pCaus.u.uL, this.L);
    gl.uniform1f(this.pCaus.u.uDepth, this.config.waterDepth);
    gl.uniform3fv(this.pCaus.u.uSun, sun);
    gl.uniform1f(this.pCaus.u.uNorm, (this.C / this.L) * (this.C / this.L));

    const sy = sun[1];
    const sinI = Math.sqrt(Math.max(0, 1 - sy * sy));
    const sinT = sinI / this.IORS[1];
    const cosT = Math.sqrt(Math.max(0, 1 - sinT * sinT));
    const hd = Math.hypot(sun[0], sun[2]) || 1;
    const tanT = sinT / cosT;
    this.causShift = [(-sun[0] / hd) * this.config.waterDepth * tanT, (-sun[2] / hd) * this.config.waterDepth * tanT];
    gl.uniform2fv(this.pCaus.u.uShift, this.causShift);

    gl.bindVertexArray(this.gridVAO);
    const masks: [boolean, boolean, boolean, boolean][] = [
      [true, false, false, false],
      [false, true, false, false],
      [false, false, true, false],
    ];

    const disp = this.config.dispersionStrength;
    const adjustedIors = [
      1.3335 - 0.002 * disp,
      1.3335,
      1.3335 + 0.003 * disp,
    ];

    for (let c = 0; c < 3; c++) {
      gl.colorMask(...masks[c]);
      gl.uniform1f(this.pCaus.u.uIor, adjustedIors[c]);
      gl.drawElementsInstanced(gl.TRIANGLES, this.G * this.G * 6, gl.UNSIGNED_INT, 0, 9);
    }
    gl.colorMask(true, true, true, true);
    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, this.causRT.t);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  /* ---------------- Pebbles Texture Setup ---------------- */
  private initPebbleTexture() {
    const gl = this.gl;
    this.pebTex = this.createTexture(1024, 1024, gl.SRGB8_ALPHA8, { wrap: gl.REPEAT, mip: true, aniso: 16 });

    // Try loading /pebbles.png
    const img = new Image();
    img.onload = () => {
      if (this.disposed || !this.pebTex) return;
      gl.bindTexture(gl.TEXTURE_2D, this.pebTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.pebReady = true;
    };
    img.onerror = () => {
      // Procedural pebble fallback
      this.generateProceduralPebbles();
    };
    img.src = pebblesAsset;
  }

  private generateProceduralPebbles() {
    const gl = this.gl;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#b0a695';
    ctx.fillRect(0, 0, 512, 512);

    // Draw pebble clusters
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 8 + Math.random() * 18;
      const shade = 140 + Math.floor(Math.random() * 70);
      ctx.fillStyle = `rgb(${shade}, ${shade - 10}, ${shade - 25})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.4), Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.pebTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.pebTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.pebReady = true;
    }
  }

  /* ---------------- Glare & Post Processing ---------------- */
  private fft1(re: Float32Array, im: Float32Array, n: number, inv: boolean) {
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = ((2 * Math.PI) / len) * (inv ? 1 : -1);
      const wr = Math.cos(ang),
        wi = Math.sin(ang);
      const h = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1,
          ci = 0;
        for (let k = 0; k < h; k++) {
          const a = i + k,
            b = a + h;
          const xr = re[b] * cr - im[b] * ci;
          const xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
          const t = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = t;
        }
      }
    }
  }

  private fft2(re: Float32Array, im: Float32Array, w: number, h: number, inv: boolean) {
    const rr = new Float32Array(w),
      ri = new Float32Array(w);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      rr.set(re.subarray(o, o + w));
      ri.set(im.subarray(o, o + w));
      this.fft1(rr, ri, w, inv);
      re.set(rr, o);
      im.set(ri, o);
    }
    const cr = new Float32Array(h),
      ci = new Float32Array(h);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        cr[y] = re[y * w + x];
        ci[y] = im[y * w + x];
      }
      this.fft1(cr, ci, h, inv);
      for (let y = 0; y < h; y++) {
        re[y * w + x] = cr[y];
        im[y * w + x] = ci[y];
      }
    }
  }

  private buildPSF() {
    const n = 512,
      R = n * 0.11,
      SS = 3,
      D = Math.PI / 180;
    const re = new Float32Array(n * n),
      im = new Float32Array(n * n);
    const flats = [0, 1, 2, 3, 4, 5].map((k) => (15 + k * 60) * D);
    const scratches = [
      { a: 21 * D, o: 0.12 * R, w: 2.2 },
      { a: 22.5 * D, o: -0.38 * R, w: 1.6 },
      { a: 19 * D, o: 0.55 * R, w: 1.2 },
      { a: 152 * D, o: 0.25 * R, w: 1.0 },
      { a: 84 * D, o: -0.2 * R, w: 0.8 },
    ];
    let seed = 3;
    const r2 = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const dust = Array.from({ length: 7 }, () => ({
      x: (r2() - 0.5) * 1.4 * R,
      y: (r2() - 0.5) * 1.4 * R,
      r: (0.015 + 0.03 * r2()) * R,
    }));

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let acc = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const dx = x - n / 2 + (sx + 0.5) / SS - 0.5;
            const dy = y - n / 2 + (sy + 0.5) / SS - 0.5;
            if (dx * dx + dy * dy > R * R) continue;
            let ok = true;
            for (const f of flats) {
              if (dx * Math.cos(f) + dy * Math.sin(f) > R * 0.955) {
                ok = false;
                break;
              }
            }
            if (ok) {
              for (const sc of scratches) {
                if (Math.abs(dx * Math.cos(sc.a) + dy * Math.sin(sc.a) - sc.o) < sc.w * 0.5) {
                  ok = false;
                  break;
                }
              }
            }
            if (ok) {
              for (const d of dust) {
                if ((dx - d.x) ** 2 + (dy - d.y) ** 2 < d.r * d.r) {
                  ok = false;
                  break;
                }
              }
            }
            if (ok) acc++;
          }
        }
        re[y * n + x] = acc / (SS * SS);
      }
    }

    this.fft2(re, im, n, n, false);
    const P = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = ((y + n / 2) % n) * n + ((x + n / 2) % n);
        P[y * n + x] = re[i] * re[i] + im[i] * im[i];
      }
    }

    const bands: [number, [number, number, number]][] = [
      [440, [0.1, 0.0, 0.85]],
      [470, [0.0, 0.15, 1.0]],
      [500, [0.0, 0.6, 0.55]],
      [530, [0.05, 1.0, 0.15]],
      [560, [0.45, 0.95, 0.0]],
      [590, [0.95, 0.55, 0.0]],
      [620, [1.0, 0.2, 0.0]],
      [650, [0.7, 0.05, 0.0]],
    ];
    const out = new Float32Array(n * n * 3);
    const sum = [0, 0, 0];
    const samp = (u: number, v: number) => {
      if (u < 0 || v < 0 || u >= n - 1 || v >= n - 1) return 0;
      const x0 = u | 0,
        y0 = v | 0,
        fx = u - x0,
        fy = v - y0,
        i = y0 * n + x0;
      return (P[i] * (1 - fx) + P[i + 1] * fx) * (1 - fy) + (P[i + n] * (1 - fx) + P[i + n + 1] * fx) * fy;
    };

    for (const [lam, w] of bands) {
      const s = lam / 550;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const val = samp(n / 2 + (x - n / 2) / s, n / 2 + (y - n / 2) / s) / (s * s);
          const o = (y * n + x) * 3;
          out[o] += val * w[0];
          out[o + 1] += val * w[1];
          out[o + 2] += val * w[2];
        }
      }
    }

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const r = Math.hypot(x - n / 2, y - n / 2);
        const w = 1 + 7 * Math.min(1, Math.max(0, (r - 3) / 30));
        const o = (y * n + x) * 3;
        out[o] *= w;
        out[o + 1] *= w;
        out[o + 2] *= w;
      }
    }
    for (let i = 0; i < n * n; i++) for (let c = 0; c < 3; c++) sum[c] += out[i * 3 + c];
    for (let i = 0; i < n * n; i++) for (let c = 0; c < 3; c++) out[i * 3 + c] /= sum[c];

    this.PSF = { n, rgb: out };
  }

  private allocGlare() {
    const gl = this.gl;
    for (const r of [...this.gA, ...this.gB]) {
      gl.deleteTexture(r.t);
      gl.deleteFramebuffer(r.fb);
    }
    if (this.gK1) {
      gl.deleteTexture(this.gK1);
      gl.deleteTexture(this.gK2);
    }
    this.gX = this.W >= this.H ? 512 : 256;
    this.gY = this.W >= this.H ? 256 : 512;
    const f = Math.min((this.gX * 0.75) / this.W, (this.gY * 0.75) / this.H);
    this.gSW = Math.max(1, Math.round(this.W * f));
    this.gSH = Math.max(1, Math.round(this.H * f));
    this.gA = [0, 1].map(() => this.createRT(this.gX, this.gY, this.FFT_FMT, { filter: gl.NEAREST }));
    this.gB = [0, 1].map(() => this.createRT(this.gX, this.gY, this.FFT_FMT, { filter: gl.NEAREST }));

    if (!this.PSF) this.buildPSF();
    const n = this.PSF!.n;
    const KH = 1.15 * this.gSH;
    const sc = n / KH;
    const kr = [0, 1, 2].map(() => ({ re: new Float32Array(this.gX * this.gY), im: new Float32Array(this.gX * this.gY) }));
    const tot = [0, 0, 0];
    for (let gy = -this.gY / 2; gy < this.gY / 2; gy++) {
      for (let gx = -this.gX / 2; gx < this.gX / 2; gx++) {
        const u = n / 2 + gx * sc,
          v = n / 2 + gy * sc;
        if (u < 0 || v < 0 || u >= n - 1 || v >= n - 1) continue;
        const x0 = u | 0,
          y0 = v | 0,
          fx = u - x0,
          fy = v - y0,
          i = ((gy + this.gY) % this.gY) * this.gX + ((gx + this.gX) % this.gX);
        for (let c = 0; c < 3; c++) {
          const P = this.PSF!.rgb,
            a = (y0 * n + x0) * 3 + c;
          const val = (P[a] * (1 - fx) + P[a + 3] * fx) * (1 - fy) + (P[a + n * 3] * (1 - fx) + P[a + n * 3 + 3] * fx) * fy;
          kr[c].re[i] = val;
          tot[c] += val;
        }
      }
    }
    const norm = 1 / (this.gX * this.gY);
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < this.gX * this.gY; i++) kr[c].re[i] *= norm / tot[c];
      this.fft2(kr[c].re, kr[c].im, this.gX, this.gY, false);
    }
    const d1 = new Float32Array(this.gX * this.gY * 4),
      d2 = new Float32Array(this.gX * this.gY * 4);
    for (let i = 0; i < this.gX * this.gY; i++) {
      d1[i * 4] = kr[0].re[i];
      d1[i * 4 + 1] = kr[0].im[i];
      d1[i * 4 + 2] = kr[1].re[i];
      d1[i * 4 + 3] = kr[1].im[i];
      d2[i * 4] = kr[2].re[i];
      d2[i * 4 + 1] = kr[2].im[i];
    }
    this.gK1 = this.createTexture(this.gX, this.gY, gl.RGBA32F, { filter: gl.NEAREST });
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gX, this.gY, gl.RGBA, gl.FLOAT, d1);
    this.gK2 = this.createTexture(this.gX, this.gY, gl.RGBA32F, { filter: gl.NEAREST });
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gX, this.gY, gl.RGBA, gl.FLOAT, d2);
  }

  private fftGrid(pair: Array<{ t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }>, sign: number) {
    const gl = this.gl;
    gl.useProgram(this.pFFTg.p);
    gl.uniform1i(this.pFFTg.u.uSrc, 0);
    gl.uniform1f(this.pFFTg.u.uSign, sign);
    let src = 0;
    for (const [horiz, len] of [
      [1, this.gX],
      [0, this.gY],
    ]) {
      gl.uniform1i(this.pFFTg.u.uHoriz, horiz);
      gl.uniform1i(this.pFFTg.u.uHalf, len / 2);
      for (let p = 1; p < len; p <<= 1) {
        this.setTarget(pair[1 - src]);
        this.bindT(0, pair[src].t);
        gl.uniform1i(this.pFFTg.u.uP, p);
        this.drawFullscreen();
        src = 1 - src;
      }
    }
    return src;
  }

  private renderGlare() {
    const gl = this.gl;
    if (!this.hdrRT || !this.streakRT || !this.gK1 || !this.gK2) return;

    gl.disable(gl.BLEND);
    gl.useProgram(this.pGSrc.p);
    this.bindT(0, this.hdrRT.t);
    gl.uniform1i(this.pGSrc.u.uSrc, 0);
    gl.uniform1f(this.pGSrc.u.uThr, 14.0);

    for (const [pair, which] of [
      [this.gA, 0],
      [this.gB, 1],
    ] as const) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, pair[0].fb);
      gl.viewport(0, 0, this.gX, this.gY);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.viewport(0, 0, this.gSW, this.gSH);
      gl.uniform1f(this.pGSrc.u.uWhich, which);
      this.drawFullscreen();
    }

    const res: Array<{ t: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }> = [];
    for (const [pair, K] of [
      [this.gA, this.gK1],
      [this.gB, this.gK2],
    ] as const) {
      let s = this.fftGrid(pair, -1);
      this.setTarget(pair[1 - s]);
      gl.useProgram(this.pGMul.p);
      this.bindT(0, pair[s].t);
      this.bindT(1, K);
      gl.uniform1i(this.pGMul.u.uSrc, 0);
      gl.uniform1i(this.pGMul.u.uK, 1);
      this.drawFullscreen();
      s = 1 - s;
      if (s !== 0) {
        this.setTarget(pair[0]);
        gl.useProgram(this.pRaw.p);
        this.bindT(0, pair[1].t);
        gl.uniform1i(this.pRaw.u.uSrc, 0);
        this.drawFullscreen();
      }
      res.push(pair[this.fftGrid(pair, 1)]);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.streakRT.fb);
    gl.viewport(0, 0, this.streakRT.w, this.streakRT.h);
    gl.useProgram(this.pGOut.p);
    this.bindT(0, res[0].t);
    this.bindT(1, res[1].t);
    gl.uniform1i(this.pGOut.u.uA, 0);
    gl.uniform1i(this.pGOut.u.uB, 1);
    this.drawFullscreen();
  }

  public handleResize() {
    const gl = this.gl;
    const DPR = Math.min(window.devicePixelRatio || 1, 2.0);
    const rect = this.canvas.getBoundingClientRect();
    const targetW = Math.max(1, Math.round((rect.width || window.innerWidth) * DPR * this.quality));
    const targetH = Math.max(1, Math.round((rect.height || window.innerHeight) * DPR * this.quality));

    if (targetW === this.W && targetH === this.H) return;
    this.W = targetW;
    this.H = targetH;
    this.canvas.width = this.W;
    this.canvas.height = this.H;

    for (const r of [this.hdrRT, this.qA, this.qB, this.streakRT, this.b1, this.b2, this.b2t]) {
      if (r) {
        gl.deleteTexture(r.t);
        gl.deleteFramebuffer(r.fb);
      }
    }

    this.hdrRT = this.createRT(this.W, this.H, gl.RGBA16F);
    const qw = Math.max(1, this.W >> 1);
    const qh = Math.max(1, this.H >> 1);
    this.qA = this.createRT(qw, qh, gl.RGBA16F);
    this.qB = this.createRT(qw, qh, gl.RGBA16F);

    if (this.GLARE_ON && this.config.glareEnabled) {
      this.allocGlare();
      this.streakRT = this.createRT(this.gSW, this.gSH, gl.RGBA16F);
    } else {
      this.streakRT = this.createRT(4, 4, gl.RGBA16F);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.streakRT.fb);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    this.b1 = this.createRT(qw, qh, gl.RGBA16F);
    this.b2 = this.createRT(Math.max(1, qw >> 2), Math.max(1, qh >> 2), gl.RGBA16F);
    this.b2t = this.createRT(this.b2.w, this.b2.h, gl.RGBA16F);
  }

  private post(t: number) {
    const gl = this.gl;
    if (!this.hdrRT || !this.qA || !this.qB || !this.b1 || !this.b2 || !this.b2t || !this.streakRT) return;

    gl.disable(gl.BLEND);
    gl.useProgram(this.pBright.p);
    this.bindT(0, this.hdrRT.t);
    gl.uniform1i(this.pBright.u.uSrc, 0);
    this.setTarget(this.qA);
    gl.uniform1f(this.pBright.u.uThr, 2.5);
    this.drawFullscreen();

    // Lens diffraction post-processing effect integrated with bloom intensity to adjust the intensity of light glares
    const diffraction = this.config.diffractionIntensity ?? 1.0;
    const bloom = this.config.bloomIntensity ?? 1.0;
    const glareMul = this.config.glareEnabled ? (diffraction * (0.4 + 0.6 * Math.max(0.0, bloom))) : 0.0;

    if (this.GLARE_ON && this.config.glareEnabled && glareMul > 0.001) {
      if (this.gA.length === 0 || !this.gK1 || (this.streakRT && this.streakRT.w <= 4)) {
        this.allocGlare();
        this.streakRT = this.createRT(this.gSW, this.gSH, gl.RGBA16F);
      }
      const every = this.quality < 0.6 ? 3 : 1;
      if (this.glareTick++ % every === 0) {
        this.renderGlare();
      }
    }

    // Bloom passes
    gl.useProgram(this.pBlur.p);
    gl.uniform1i(this.pBlur.u.uSrc, 0);
    this.setTarget(this.qB);
    this.bindT(0, this.qA.t);
    gl.uniform2f(this.pBlur.u.uDir, 1, 0);
    this.drawFullscreen();

    this.setTarget(this.b1);
    this.bindT(0, this.qB.t);
    gl.uniform2f(this.pBlur.u.uDir, 0, 1);
    this.drawFullscreen();

    gl.useProgram(this.pCopy.p);
    this.setTarget(this.b2);
    this.bindT(0, this.b1.t);
    gl.uniform1i(this.pCopy.u.uSrc, 0);
    gl.uniform1f(this.pCopy.u.uK, 1.0);
    this.drawFullscreen();

    gl.useProgram(this.pBlur.p);
    for (let i = 0; i < 2; i++) {
      this.setTarget(this.b2t);
      this.bindT(0, this.b2.t);
      gl.uniform2f(this.pBlur.u.uDir, 1.5, 0);
      this.drawFullscreen();

      this.setTarget(this.b2);
      this.bindT(0, this.b2t.t);
      gl.uniform2f(this.pBlur.u.uDir, 0, 1.5);
      this.drawFullscreen();
    }

    // View Modes
    if (this.config.viewMode === 'caus' && this.causRT) {
      this.setTarget(null);
      gl.useProgram(this.pCopy.p);
      this.bindT(0, this.causRT.t);
      gl.uniform1i(this.pCopy.u.uSrc, 0);
      gl.uniform1f(this.pCopy.u.uK, 0.25);
      this.drawFullscreen();
      return;
    }

    this.setTarget(null);
    gl.useProgram(this.pFinal.p);
    this.bindT(0, this.hdrRT.t);
    this.bindT(1, this.streakRT.t);
    this.bindT(2, this.b1.t);
    this.bindT(3, this.b2.t);

    gl.uniform1i(this.pFinal.u.uHdr, 0);
    gl.uniform1i(this.pFinal.u.uStreak, 1);
    gl.uniform1i(this.pFinal.u.uB1, 2);
    gl.uniform1i(this.pFinal.u.uB2, 3);
    gl.uniform1f(this.pFinal.u.uExp, this.config.exposure);
    gl.uniform1f(this.pFinal.u.uBloomMul, this.config.bloomIntensity ?? 1.0);
    gl.uniform1f(this.pFinal.u.uGlareMul, glareMul);

    const isHdr = (this.config.toneMappingMode ?? 'hdr') === 'hdr';
    gl.uniform1f(this.pFinal.u.uHdrToneMap, isHdr ? 1.0 : 0.0);
    gl.uniform1f(this.pFinal.u.uHdrHeadroom, this.config.hdrExposureBoost ?? 1.0);

    const noPostVal = this.config.viewMode === 'nopost' ? 1 : this.config.viewMode === 'glare' ? 2 : 0;
    gl.uniform1f(this.pFinal.u.uNoPost, noPostVal);
    gl.uniform1f(this.pFinal.u.uTime, t);
    gl.uniform2f(this.pFinal.u.uRes, this.W, this.H);
    this.drawFullscreen();
  }

  /* ---------------- Camera Basis ---------------- */
  private camBasis(t: number) {
    // Smoothly ease camera 3D position and orientation towards target
    const ease = 0.08;
    this.cam.x += (this.cam.targetX - this.cam.x) * ease;
    this.cam.y += (this.cam.targetY - this.cam.y) * ease;
    this.cam.z += (this.cam.targetZ - this.cam.z) * ease;
    this.cam.yaw += (this.cam.targetYaw - this.cam.yaw) * ease;
    this.cam.pitch += (this.cam.targetPitch - this.cam.pitch) * ease;

    const curYaw = this.cam.yaw + 0.008 * Math.sin(t * 0.31) + 0.004 * Math.sin(t * 0.83 + 1.3);
    const curPit = this.cam.pitch + 0.005 * Math.sin(t * 0.47 + 2.0) + 0.002 * Math.sin(t * 1.13);
    const roll = 0.004 * Math.sin(t * 0.39 + 0.4);

    const f: [number, number, number] = [Math.sin(curYaw) * Math.cos(curPit), Math.sin(curPit), -Math.cos(curYaw) * Math.cos(curPit)];
    const r: [number, number, number] = [Math.cos(curYaw), 0, Math.sin(curYaw)];
    const u: [number, number, number] = [
      r[1] * f[2] - r[2] * f[1],
      r[2] * f[0] - r[0] * f[2],
      r[0] * f[1] - r[1] * f[0],
    ];

    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const r2: [number, number, number] = [r[0] * cr + u[0] * sr, r[1] * cr + u[1] * sr, r[2] * cr + u[2] * sr];
    const u2: [number, number, number] = [u[0] * cr - r[0] * sr, u[1] * cr - r[1] * sr, u[2] * cr - r[2] * sr];

    const undulateH =
      this.config.autoOrbit && this.config.cinematicUndulate !== false
        ? 0.04 * Math.sin(t * 0.15)
        : 0;

    const pos: [number, number, number] = [
      this.cam.x + 0.02 * Math.sin(t * 0.21),
      this.cam.y + 0.01 * Math.sin(t * 0.57) + undulateH,
      this.cam.z + 0.02 * Math.cos(t * 0.17),
    ];
    return { f, r: r2, u: u2, pos };
  }

  /* ---------------- 3D Fish School Simulation (WebGPU / threejs-fish Architecture) ---------------- */
  private initFish() {
    this.fishes = [];
    // Species baseline scales & speed profiles (Environment-aware):
    // Pond: 0: Kohaku (1.35), 1: Taisho Sanshoku (1.30), 2: Yamabuki Ogon (1.36 regal 24K gold), 3: Hi Utsuri (1.28), 4: Asagi (1.25), 5: Crucian Carp / 붕어 (0.92)
    // Ocean/River: 0: Tuna (1.35), 1: Blue Tang (0.95), 2: Clownfish (0.58), 3: Emperor Angelfish (1.08), 4: Moorish Idol (1.00), 5: Golden Butterflyfish (0.82)
    const isPond = this.config.waterEnvironment === 'pond';
    const speciesBaseScale = isPond
      ? [1.35, 1.30, 1.36, 1.28, 1.25, 0.92]
      : [1.35, 0.95, 0.58, 1.08, 1.00, 0.82];
    const speciesBaseSpeed = isPond
      ? [0.52, 0.48, 0.45, 0.48, 0.46, 0.50]
      : [0.72, 0.58, 0.36, 0.48, 0.45, 0.50];
    const speciesDepthOffset = isPond
      ? [-0.02, 0.04, -0.05, 0.02, -0.04, 0.05]
      : [0.08, -0.05, -0.42, -0.15, -0.08, 0.02];

    for (let i = 0; i < 12; i++) {
      const species = i % 6;
      const angle = (i / 12) * Math.PI * 2;
      const dist = isPond ? (1.5 + (i % 6) * 1.2) : (0.55 + (i % 4) * 0.32);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const y = -0.45 + speciesDepthOffset[species] - (i % 3) * 0.12;
      const dirX = -Math.sin(angle);
      const dirZ = Math.cos(angle);
      const colorVariant = ((i * 7 + 3) % 11) / 10.0;
      const individualScale = (0.92 + ((i * 13) % 7) * 0.03) * speciesBaseScale[species];
      const individualSpeed = (0.92 + ((i * 5) % 5) * 0.04) * speciesBaseSpeed[species];

      const fish = new FishAgent(
        x,
        y,
        z,
        species,
        individualScale,
        individualSpeed,
        colorVariant,
        speciesDepthOffset[species]
      );
      fish.vx = dirX * individualSpeed * 0.5;
      fish.vz = dirZ * individualSpeed * 0.5;
      fish.dirX = dirX;
      fish.dirZ = dirZ;
      fish.wanderAngle = angle + Math.PI / 2;
      this.fishes.push(fish);
    }
  }

  private updateFish(dt: number) {
    const choppiness = this.config.choppiness ?? 1.1;
    const turbidity = this.config.turbidity ?? 1.0;
    const depth = this.config.waterDepth ?? 1.6;
    const count = Math.min(12, Math.max(1, this.config.fishCount ?? 10));
    const formation = this.config.fishFormation ?? 'swarm';
    const speciesType = this.config.fishSpeciesType ?? 'mixed';
    const time = this.tSim;

    // Reacting to choppiness: when water is choppy, fish dive deeper away from wave turbulence
    const targetDepthBase = -0.32 - Math.min(1.0, choppiness * 0.32);
    const maxSafeDepth = Math.max(0.4, depth * 0.82);

    // Shockwave timer decay
    if (this.shockwaveTimer > 0) {
      this.shockwaveTimer = Math.max(0, this.shockwaveTimer - dt * 1.5);
    }

    // Species baseline parameters (scaled appropriately for majestic Koi in pond!)
    const isPond = this.config.waterEnvironment === 'pond';
    const speciesBaseScale = isPond
      ? [1.32, 1.28, 1.30, 1.25, 1.22, 1.35] // All 6 Koi varieties are large, majestic Nishikigoi!
      : [1.35, 0.95, 0.58, 1.08, 1.00, 0.82];
    const speciesBaseSpeed = isPond
      ? [0.52, 0.48, 0.45, 0.48, 0.46, 0.50] // Stately, graceful, calm Koi cruising
      : [0.72, 0.58, 0.36, 0.48, 0.45, 0.50];
    const speciesDepthOffset = isPond
      ? [-0.02, 0.04, -0.05, 0.02, -0.04, 0.05]
      : [0.08, -0.05, -0.42, -0.15, -0.08, 0.02];
    const burstPeriods = isPond
      ? [3.4, 3.2, 3.6, 3.2, 3.5, 3.0]
      : [3.0, 1.6, 1.1, 2.6, 2.4, 1.8];
    const burstRatios = isPond
      ? [0.32, 0.35, 0.28, 0.32, 0.30, 0.38]
      : [0.35, 0.55, 0.60, 0.40, 0.45, 0.50];
    const maxSpeciesTurnRate = isPond
      ? [1.6, 1.8, 1.5, 1.6, 1.5, 1.8]
      : [1.8, 3.2, 3.8, 2.2, 2.4, 3.4]; // Maximum angular velocity constraints (rad/s)

    // Calculate global school center and species-specific sub-school centroids
    let centerX = 0, centerZ = 0;
    const speciesCount = [0, 0, 0, 0, 0, 0];
    const speciesCenterX = [0, 0, 0, 0, 0, 0];
    const speciesCenterY = [0, 0, 0, 0, 0, 0];
    const speciesCenterZ = [0, 0, 0, 0, 0, 0];
    const speciesVelX = [0, 0, 0, 0, 0, 0];
    const speciesVelZ = [0, 0, 0, 0, 0, 0];

    for (let k = 0; k < count; k++) {
      const f = this.fishes[k];
      if (speciesType === 'sardine_silver') {
        f.species = 0;
      } else if (speciesType === 'tropical_reef') {
        f.species = (k % 5) + 1;
      } else {
        f.species = k % 6;
      }
      f.scale = (0.92 + ((k * 13) % 7) * 0.03) * speciesBaseScale[f.species];
      f.speed = (0.92 + ((k * 5) % 5) * 0.04) * speciesBaseSpeed[f.species];
      f.preferredDepthOffset = speciesDepthOffset[f.species];

      centerX += f.x;
      centerZ += f.z;

      const sp = f.species;
      speciesCount[sp]++;
      speciesCenterX[sp] += f.x;
      speciesCenterY[sp] += f.y;
      speciesCenterZ[sp] += f.z;
      speciesVelX[sp] += f.vx;
      speciesVelZ[sp] += f.vz;
    }
    centerX /= count;
    centerZ /= count;

    for (let s = 0; s < 6; s++) {
      if (speciesCount[s] > 0) {
        speciesCenterX[s] /= speciesCount[s];
        speciesCenterY[s] /= speciesCount[s];
        speciesCenterZ[s] /= speciesCount[s];
        speciesVelX[s] /= speciesCount[s];
        speciesVelZ[s] /= speciesCount[s];
      }
    }

    for (let i = 0; i < count; i++) {
      const f = this.fishes[i];
      const sp = f.species;

      // Decay panic state
      f.panic = Math.max(0, f.panic - dt * 1.5);

      // --- Pointer Scare & Panic Ripple Propagation ---
      if (this.pointerWorldPos && this.config.fishPanicReaction !== false) {
        const dPtr = Math.hypot(f.x - this.pointerWorldPos[0], f.z - this.pointerWorldPos[2]);
        if (dPtr < 0.75) {
          f.panic = Math.min(1.0, f.panic + 0.85);
          const fleeX = (f.x - this.pointerWorldPos[0]) / (dPtr + 0.08);
          const fleeZ = (f.z - this.pointerWorldPos[2]) / (dPtr + 0.08);
          f.vx += fleeX * 2.2 * dt;
          f.vz += fleeZ * 2.2 * dt;
          f.vy -= 1.0 * dt; // dive down when scared
        }
      }

      // Propagate panic wave to nearby neighbors
      if (f.panic > 0.4 && this.config.fishPanicReaction !== false) {
        for (let j = 0; j < count; j++) {
          if (i === j) continue;
          const other = this.fishes[j];
          const distN = Math.hypot(f.x - other.x, f.z - other.z);
          if (distN < 0.45 && other.panic < f.panic * 0.8) {
            other.panic = f.panic * 0.82;
          }
        }
      }

      // --- Shockwave Impulse (from tap/click) ---
      if (this.shockwaveTimer > 0 && this.config.fishPanicReaction !== false) {
        const dShock = Math.hypot(f.x - this.shockwaveOrigin[0], f.z - this.shockwaveOrigin[1]);
        const waveRadius = (1.0 - this.shockwaveTimer) * 2.4;
        if (Math.abs(dShock - waveRadius) < 0.45) {
          const impulse = (0.45 - Math.abs(dShock - waveRadius)) * 3.2 * this.shockwaveTimer;
          const shockDirX = (f.x - this.shockwaveOrigin[0]) / (dShock + 0.08);
          const shockDirZ = (f.z - this.shockwaveOrigin[1]) / (dShock + 0.08);
          f.vx += shockDirX * impulse;
          f.vz += shockDirZ * impulse;
          f.panic = 1.0;
        }
      }

      // Update animation speed scaling & phase delays from config
      f.setAnimSpeed(this.config.fishAnimSpeed ?? 1.0);
      const delayMult = this.config.fishPhaseDelay ?? 1.0;
      f.tailPhaseDelay = 0.42 * delayMult;
      f.finPhaseDelay = 0.65 * delayMult;
      f.pecPhaseDelay = 0.85 * delayMult;

      // --- Sine-Interpolated Burst-and-Glide Locomotion Gait ---
      f.swimTimer += dt * f.animSpeed;
      const bPeriod = burstPeriods[sp];
      const bRatio = burstRatios[sp];
      const cycle = ((f.swimTimer * 0.45 + i * 0.35) % bPeriod) / bPeriod;

      // Sine-wave eased acceleration & deceleration stroke (prevents sudden step changes):
      let burstFactor = 0.25;
      if (cycle < bRatio) {
        const p = cycle / bRatio; // 0.0 -> 1.0
        const sineStroke = Math.sin(p * Math.PI); // 0 -> 1 -> 0
        burstFactor = 0.25 + 0.75 * sineStroke;
      }
      const tailActivity = Math.min(1.0, burstFactor + f.panic * 0.65);

      // --- Multi-Species Flocking & Boids Forces ---
      let ax = 0, ay = 0, az = 0;

      if (formation === 'ball') {
        // 🌀 Multi-Species Bait Ball: Concentric stratified vortex
        // Larger predators (Tuna) orbit outer boundary, smaller reef fish swirl in inner core
        const layerR = (sp === 0) ? 0.88 : (0.45 + (sp % 3) * 0.16);
        const orbitAngle = time * (0.75 + (sp === 0 ? 0.30 : 0.0)) + (i / count) * Math.PI * 2;
        const tx = Math.cos(orbitAngle) * layerR;
        const tz = Math.sin(orbitAngle) * layerR;
        const ty = targetDepthBase + f.preferredDepthOffset + Math.sin(orbitAngle * 2.0 + i) * 0.14;

        ax += (tx - f.x) * 2.5;
        ay += (ty - f.y) * 2.5;
        az += (tz - f.z) * 2.5;

        const tangX = -Math.sin(orbitAngle) * (sp === 0 ? 0.85 : 0.60);
        const tangZ = Math.cos(orbitAngle) * (sp === 0 ? 0.85 : 0.60);
        f.vx += (tangX - f.vx) * dt * 2.5;
        f.vz += (tangZ - f.vz) * dt * 2.5;
      } else if (formation === 'tornado') {
        // 🌪️ Fish Tornado: Vertical ascending helical spiral with species heights
        const tCycle = ((time * 0.14 + (i / count)) % 1.0);
        const ty = -maxSafeDepth + tCycle * (maxSafeDepth - 0.28);
        const radius = 0.32 + 0.42 * tCycle * (sp === 0 ? 1.25 : 0.95);
        const spiralAngle = time * 1.35 + tCycle * Math.PI * 5.0;
        const tx = Math.cos(spiralAngle) * radius;
        const tz = Math.sin(spiralAngle) * radius;

        ax += (tx - f.x) * 2.8;
        ay += (ty - f.y) * 2.8;
        az += (tz - f.z) * 2.8;

        const tangX = -Math.sin(spiralAngle) * 0.75;
        const tangZ = Math.cos(spiralAngle) * 0.75;
        f.vx += (tangX - f.vx) * dt * 2.8;
        f.vz += (tangZ - f.vz) * dt * 2.8;
      } else if (formation === 'ring') {
        // ⭕ Ring Formation: Multi-tiered concentric schooling rings
        const ringAngle = time * 0.62 + (i / count) * Math.PI * 2;
        const ringR = (sp === 0) ? 1.45 : (1.10 + (i % 2) * 0.20);
        const tx = Math.cos(ringAngle) * ringR;
        const tz = Math.sin(ringAngle) * ringR;
        const ty = targetDepthBase + f.preferredDepthOffset;

        ax += (tx - f.x) * 2.2;
        ay += (ty - f.y) * 2.2;
        az += (tz - f.z) * 2.2;

        const tangX = -Math.sin(ringAngle) * 0.6;
        const tangZ = Math.cos(ringAngle) * 0.6;
        f.vx += (tangX - f.vx) * dt * 2.4;
        f.vz += (tangZ - f.vz) * dt * 2.4;
      } else {
        // 🌊 Species-Differentiated Free Flocking & Swarming
        // 1) Species-specific wandering patterns
        let wanderRate = 0.45;
        let wanderSpeed = 0.40;

        if (isPond) {
          // 🌿 Japanese Garden Pond: Stately, graceful, tranquil Koi gliding
          f.wanderAngle += (Math.sin(time * 0.16 + i * 1.8) * 0.24) * dt;
          wanderSpeed = 0.38 + 0.05 * (sp % 3);
        } else if (sp === 0) {
          // Tuna: Wide sweeping pelagic patrol circuits
          f.wanderAngle += (Math.sin(time * 0.18 + i * 1.5) * 0.28) * dt;
          wanderSpeed = 0.55;
        } else if (sp === 1) {
          // Tang: Agile reef explorer with responsive directional shifts
          f.wanderAngle += (Math.sin(time * 0.45 + i * 2.1) * 0.65) * dt;
          wanderSpeed = 0.46;
        } else if (sp === 2) {
          // Clownfish: Localized hovering & iconic vertical bobbing gait
          f.wanderAngle += (Math.sin(time * 0.50 + i * 2.8) * 0.85) * dt;
          wanderSpeed = 0.24;
          // Characteristic Clownfish vertical undulation
          ay += Math.sin(time * 3.6 + i * 1.5) * 0.38;
        } else if (sp === 3) {
          // Angelfish: Regal stately glide
          f.wanderAngle += (Math.sin(time * 0.22 + i * 1.8) * 0.32) * dt;
          wanderSpeed = 0.38;
        } else if (sp === 4) {
          // Moorish Idol: Flowing graceful drift
          f.wanderAngle += (Math.sin(time * 0.26 + i * 2.0) * 0.36) * dt;
          wanderSpeed = 0.36;
        } else {
          // Butterflyfish: Peck-and-dash fluttering
          f.wanderAngle += (Math.sin(time * 0.55 + i * 2.4) * 0.72) * dt;
          wanderSpeed = 0.40;
          // Intermittent peck/hover pauses
          const isPeckPause = ((time * 0.8 + i * 0.4) % 2.8) > 2.0;
          if (isPeckPause) wanderSpeed *= 0.35;
        }

        ax += (Math.cos(f.wanderAngle) * wanderSpeed - f.vx * 0.35) * 1.2;
        az += (Math.sin(f.wanderAngle) * wanderSpeed - f.vz * 0.35) * 1.2;

        // Depth wandering respecting species vertical strata
        const targetY = targetDepthBase + f.preferredDepthOffset + Math.sin(time * 0.25 + i * 1.3) * 0.08;
        ay += (targetY - f.y) * 1.4;

        // 2) Intra-Species Cohesion (Stay grouped with same-species peers)
        if (speciesCount[sp] > 1) {
          const spDist = Math.hypot(f.x - speciesCenterX[sp], f.z - speciesCenterZ[sp]);
          if (spDist > 0.65) {
            ax += (speciesCenterX[sp] - f.x) * 0.45;
            az += (speciesCenterZ[sp] - f.z) * 0.45;
          }
          // Align velocity with sub-school
          ax += (speciesVelX[sp] - f.vx) * 0.55;
          az += (speciesVelZ[sp] - f.vz) * 0.55;
        }

        // Global school soft pull (prevents lone fish from straying too far across scene)
        const dCenter = Math.hypot(f.x - centerX, f.z - centerZ);
        if (dCenter > 1.15) {
          ax += (centerX - f.x) * 0.22;
          az += (centerZ - f.z) * 0.22;
        }

        // 3) Pairwise Boids Interactions (Intra-species vs Inter-species) with C^1 continuous Hermite envelope & lubrication
        for (let j = 0; j < count; j++) {
          if (i === j) continue;
          const o = this.fishes[j];
          const dx = f.x - o.x;
          const dy = f.y - o.y;
          const dz = f.z - o.z;
          const distO = Math.hypot(dx, dy, dz);
          if (distO < 0.001) continue;

          const normX = dx / distO;
          const normY = dy / distO;
          const normZ = dz / distO;

          if (f.species === o.species) {
            // --- Same Species: Harmonious flocking & smooth repulsion ---
            const sepRadius = (isPond ? 0.72 : 0.48) * f.scale;
            if (distO < sepRadius) {
              const uSep = 1.0 - distO / sepRadius;
              // Smooth Hermite polynomial (C^1 continuous, force and slope start at 0)
              const smoothSep = uSep * uSep * (3.0 - 2.0 * uSep);
              const sep = smoothSep * (isPond ? 2.4 : 1.8);
              ax += normX * sep;
              ay += normY * sep * 0.4;
              az += normZ * sep;

              // Hydrodynamic lubrication / relative closing velocity damping prevents collision
              const relClose = (f.vx - o.vx) * normX + (f.vz - o.vz) * normZ;
              if (relClose < 0) {
                ax -= normX * relClose * 0.45;
                az -= normZ * relClose * 0.45;
              }
            } else if (distO < 1.1) {
              // Smoothly blended velocity alignment
              const alignWeight = Math.max(0, 1.0 - (distO - sepRadius) / (1.1 - sepRadius));
              const smoothAlign = alignWeight * alignWeight * (3.0 - 2.0 * alignWeight);
              ax += (o.vx - f.vx) * 0.30 * smoothAlign;
              az += (o.vz - f.vz) * 0.30 * smoothAlign;
            }
          } else {
            // --- Different Species: Polite personal space with smooth Hermite envelope ---
            const interSepRadius = (isPond ? 0.78 : 0.54) * (f.scale + o.scale) * 0.5;
            if (distO < interSepRadius) {
              const uSep = 1.0 - distO / interSepRadius;
              const smoothSep = uSep * uSep * (3.0 - 2.0 * uSep);
              const sep = smoothSep * (isPond ? 2.8 : 2.0);
              ax += normX * sep;
              ay += normY * sep * 0.4;
              az += normZ * sep;

              const relClose = (f.vx - o.vx) * normX + (f.vz - o.vz) * normZ;
              if (relClose < 0) {
                ax -= normX * relClose * 0.50;
                az -= normZ * relClose * 0.50;
              }
            }
            // Small reef fish yield space to large cruising Tuna smoothly
            if (o.species === 0 && f.species !== 0 && distO < 0.85) {
              const uYield = 1.0 - distO / 0.85;
              const yieldForce = uYield * uYield * (3.0 - 2.0 * uYield) * 1.4;
              ax += normX * yieldForce;
              az += normZ * yieldForce;
            }
          }
        }

        // 4) Dynamic Sea Turtle Avoidance (Smooth falloff)
        if (this.config.turtleEnabled) {
          const tdx = f.x - this.turtle.x;
          const tdy = f.y - this.turtle.y;
          const tdz = f.z - this.turtle.z;
          const dTurtle = Math.hypot(tdx, tdy, tdz);
          if (dTurtle < 1.30 && dTurtle > 0.01) {
            const uT = 1.0 - dTurtle / 1.30;
            const turtleAvoid = uT * uT * (3.0 - 2.0 * uT) * 2.4;
            ax += (tdx / dTurtle) * turtleAvoid;
            az += (tdz / dTurtle) * turtleAvoid;
            ay += (tdy / dTurtle) * turtleAvoid * 0.4;
          }
        }
      }

      // 5) Aquatic Vegetation & Water Lily Stalk Obstacle Avoidance (수초 사이 및 연잎 줄기 우회 기동)
      if (this.config.waterEnvironment === 'pond' || this.config.debrisEnabled) {
        const [obsX, obsY, obsZ] = computeAquaticObstacleAvoidance(
          f.x, f.y, f.z,
          f.dirX, f.dirY, f.dirZ,
          f.speed,
          this.pondLilyObstacles,
          0.65
        );
        ax += obsX;
        ay += obsY;
        az += obsZ;
      }

      // 6) Terrain-Aware Pathfinding & Moss Bed Navigation (바닥의 이끼 지형 및 징검다리 수로 인식 경로 탐색)
      if (this.config.waterEnvironment === 'pond') {
        const [terrX, terrY, terrZ] = computeTerrainAwarePathfinding(
          f.x, f.y, f.z,
          f.dirX, f.dirY, f.dirZ,
          f.speed,
          (tx, tz) => this.getPondFloorDepth(tx, tz),
          depth,
          0.32 + (i % 3) * 0.08
        );
        ax += terrX;
        ay += terrY;
        az += terrZ;
      }

      // --- Proactive Lookahead Boundary Steering (Curving arcs, zero abrupt wall-snaps) ---
      if (this.config.waterEnvironment === 'pond') {
        const dWater = this.getPondWaterDist(f.x, f.z);
        if (dWater > -0.85) {
          const eps = 0.08;
          const gx = (this.getPondWaterDist(f.x + eps, f.z) - this.getPondWaterDist(f.x - eps, f.z)) / (2 * eps);
          const gz = (this.getPondWaterDist(f.x, f.z + eps) - this.getPondWaterDist(f.x, f.z - eps)) / (2 * eps);
          const gLen = Math.hypot(gx, gz) || 1;
          const uRep = Math.min(1.0, (dWater - (-0.85)) / 0.85);
          const steerForce = uRep * uRep * (3.0 - 2.0 * uRep) * 2.8;
          ax -= (gx / gLen) * steerForce;
          az -= (gz / gLen) * steerForce;
        }
      }

      const boundaryR = (this.config.waterEnvironment === 'pond')
        ? 6.8 // Expansive Catmull-Rom garden watercourse roaming expanse
        : 1.75;
      const [bSteerX, bSteerY, bSteerZ] = computeBoundarySteering(
        f.x, f.y, f.z,
        f.dirX, f.dirY, f.dirZ,
        f.speed,
        boundaryR,
        -maxSafeDepth,
        -0.20,
        0.85
      );
      ax += bSteerX;
      ay += bSteerY;
      az += bSteerZ;

      // Behavioral state classification and smooth transition interpolation (유영 상태 전환 보간)
      let targetState: 'cruise' | 'burst' | 'evade' | 'turn' = 'cruise';
      if (f.panic > 0.25) {
        targetState = 'evade';
      } else if (cycle < bRatio && burstFactor > 0.42) {
        targetState = 'burst';
      } else if (Math.hypot(ax, az) > 1.25) {
        targetState = 'turn';
      } else {
        targetState = 'cruise';
      }
      f.updateState(targetState, dt, 0.35);

      // Target locomotion speed with species calibration & sine-eased burst factor
      const baseSpeed = f.speed * (0.85 + 0.25 * Math.min(2.0, choppiness));
      const targetSpeed = baseSpeed * (0.70 + 0.50 * burstFactor) * (1.0 + f.panic * 1.4);

      // Smooth sine-based speed interpolation
      f.currentSwimSpeed = FishAgent.sineLerp(f.currentSwimSpeed || targetSpeed, targetSpeed, dt * 2.2);

      // Inter-frame acceleration smoothing filter (프레임 간 가속도 평활화 알고리즘: 급격한 자극 제거)
      const [sAx, sAy, sAz] = f.filterAcceleration(ax, ay, az, dt, 4.2);

      // Desired velocity vector combining current momentum and smoothed steering acceleration forces
      const steerDamping = isPond ? 0.70 : 1.1;
      const desiredVx = f.dirX * f.currentSwimSpeed + sAx * dt * steerDamping;
      const desiredVy = f.dirY * f.currentSwimSpeed + sAy * dt * steerDamping;
      const desiredVz = f.dirZ * f.currentSwimSpeed + sAz * dt * steerDamping;
      const desiredSpeed = Math.hypot(desiredVx, desiredVy, desiredVz) || 1.0;
      const targetDirX = desiredVx / desiredSpeed;
      const targetDirY = Math.max(-0.40, Math.min(0.40, desiredVy / desiredSpeed));
      const targetDirZ = desiredVz / desiredSpeed;
      const targetNorm = Math.hypot(targetDirX, targetDirY, targetDirZ) || 1.0;

      // Strict physical angular velocity constraint (SLERP on S^2 sphere)
      // Fish can never snap instantaneously; they sweep along natural hydrodynamic arcs
      const oldDirX = f.dirX;
      const oldDirZ = f.dirZ;
      const maxTurnRate = maxSpeciesTurnRate[sp] * (1.0 + f.panic * 0.45); // rad/sec
      const [newDirX, newDirY, newDirZ] = constrainAngularVelocity(
        f.dirX, f.dirY, f.dirZ,
        targetDirX / targetNorm, targetDirY / targetNorm, targetDirZ / targetNorm,
        maxTurnRate * dt
      );
      f.dirX = newDirX;
      f.dirY = newDirY;
      f.dirZ = newDirZ;

      // Hydrodynamic locomotion with sine-interpolated speed and lateral keel resistance
      const [nVx, nVy, nVz] = applyHydrodynamicLocomotion(
        f.vx, f.vy, f.vz,
        f.dirX, f.dirY, f.dirZ,
        f.currentSwimSpeed,
        2.2, // axial acceleration towards target speed
        6.0, // lateral hydrodynamic drag (strictly prevents sideways slipping)
        dt
      );

      // Inter-frame velocity smoothing filter (프레임 간 속도 평활화 알고리즘: 미세 떨림 완벽 제거)
      f.filterVelocity(nVx, nVy, nVz, dt, 5.0);

      // Continuous position integration
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;

      // Strict water surface submersion ceiling:
      // Prevents koi body/dorsal fin from sticking out of water into air,
      // which previously caused rays from the water surface to miss the top of fish body or render transparent
      const maxFishY = -0.16 * f.scale;
      if (f.y > maxFishY) {
        f.y = maxFishY;
        if (f.vy > 0) f.vy = 0;
      }

      // Living water surface interaction: subtle wake disturbances when swimming near surface
      if (f.y > -0.34 && f.currentSwimSpeed > 0.22) {
        if (Math.sin(f.tailPhase) > 0.88 && Math.random() < 0.24) {
          this.addDisturbance(f.x - f.dirX * (0.24 * f.scale), f.z - f.dirZ * (0.24 * f.scale), 0.024 * f.scale, 0.018 * f.scale);
        }
      }

      // Inward banking roll with smooth low-pass filtered yaw angular velocity
      // Eliminates high-frequency shudder/jitter during turning
      const yawDelta = (f.dirX * -oldDirZ + f.dirZ * oldDirX);
      const instantYawRate = yawDelta / Math.max(0.008, dt);
      const targetBank = Math.max(-0.35, Math.min(0.35, instantYawRate * 0.16));
      f.bank += (targetBank - f.bank) * (1.0 - Math.exp(-2.5 * dt));

      // Tail undulation smoothly coupled to forward swim speed, burst gait, and animSpeed scaling
      // True biological cruising rhythm: ~0.50 ~ 1.00 Hz
      const currentSpeed = Math.hypot(f.vx, f.vy, f.vz);
      let baseSwimFreq = 0.60;
      if (this.config.waterEnvironment === 'pond') {
        baseSwimFreq = 0.50; // Stately, majestic, lazy koi cruising
      } else if (this.config.waterEnvironment === 'river') {
        baseSwimFreq = 0.68; // Clean river current navigation
      } else {
        baseSwimFreq = 0.60; // Pelagic ocean gliding
      }
      const swimFreq = (baseSwimFreq + currentSpeed * 0.85) * (0.75 + 0.35 * burstFactor) * (1.0 + f.panic * 0.6) * f.animSpeed;
      f.tailPhase += dt * swimFreq * Math.PI * 2;

      // Update spline-interpolated body curve control knots
      f.updateSpineKnots(tailActivity);
    }

    // --- Physical Non-Penetration Resolution (Soft Relaxation & Damped Velocity, Zero Heading Jitter) ---
    // Smooth capsule representation: Head (0.32*s), Trunk (0.0), Peduncle (-0.38*s)
    const getFishSpheres = (f: FishAgent) => {
      const fwdLen = 0.32 * f.scale;
      const rearLen = 0.38 * f.scale;
      return [
        { x: f.x + f.dirX * fwdLen, y: f.y + f.dirY * fwdLen, z: f.z + f.dirZ * fwdLen, r: 0.12 * f.scale },
        { x: f.x, y: f.y, z: f.z, r: 0.15 * f.scale },
        { x: f.x - f.dirX * rearLen, y: f.y - f.dirY * rearLen, z: f.z - f.dirZ * rearLen, r: 0.11 * f.scale },
      ];
    };

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < count; i++) {
        const fi = this.fishes[i];
        const spheresI = getFishSpheres(fi);

        // 1) Fish-to-Fish Mutual Non-Penetration (부드러운 위치 완충 및 상대속도 감쇠)
        for (let j = i + 1; j < count; j++) {
          const fj = this.fishes[j];
          const spheresJ = getFishSpheres(fj);

          for (let si = 0; si < 3; si++) {
            const sA = spheresI[si];
            for (let sj = 0; sj < 3; sj++) {
              const sB = spheresJ[sj];
              const dx = sA.x - sB.x;
              const dy = (sA.y - sB.y) * 1.5;
              const dz = sA.z - sB.z;
              const dist3D = Math.hypot(dx, dy, dz);
              const minSafeDist = (sA.r + sB.r) * 1.05;

              if (dist3D < minSafeDist && dist3D > 0.0001) {
                const overlap = minSafeDist - dist3D;
                const nx = dx / dist3D;
                const ny = dy / (dist3D * 1.5);
                const nz = dz / dist3D;

                // Soft position de-penetration without mutating heading vectors
                const pushForce = overlap * 0.38;
                fi.x += nx * pushForce;
                fi.y = Math.min(-0.16 * fi.scale, fi.y + ny * pushForce * 0.30);
                fi.z += nz * pushForce;
                fj.x -= nx * pushForce;
                fj.y = Math.min(-0.16 * fj.scale, fj.y - ny * pushForce * 0.30);
                fj.z -= nz * pushForce;

                // Relative velocity damping prevents bounce-back
                const relV = (fi.vx - fj.vx) * nx + (fi.vz - fj.vz) * nz;
                if (relV < 0) {
                  fi.vx -= nx * relV * 0.45;
                  fi.vz -= nz * relV * 0.45;
                  fj.vx += nx * relV * 0.45;
                  fj.vz += nz * relV * 0.45;
                }
              }
            }
          }
        }

        // 2) Fish-to-Lily Stem & Bogwood Driftwood Non-Penetration
        if (isPond || this.config.debrisEnabled) {
          for (const obs of this.pondLilyObstacles) {
            for (let si = 0; si < 3; si++) {
              const s = spheresI[si];

              if (obs.x2 !== undefined && obs.z2 !== undefined) {
                // Segment obstacle
                const bax = obs.x2 - obs.x;
                const baz = obs.z2 - obs.z;
                const pax = s.x - obs.x;
                const paz = s.z - obs.z;
                const lenSq = bax * bax + baz * baz;
                const tSeg = lenSq > 1e-6 ? Math.max(0, Math.min(1, (pax * bax + paz * baz) / lenSq)) : 0;
                const projX = obs.x + tSeg * bax;
                const projZ = obs.z + tSeg * baz;
                const sDx = s.x - projX;
                const sDz = s.z - projZ;
                const dSeg = Math.hypot(sDx, sDz);
                const minObstacleDist = s.r + (obs.stemRadius ?? obs.radius);

                if (dSeg < minObstacleDist && dSeg > 0.001) {
                  const sOverlap = minObstacleDist - dSeg;
                  const sNx = sDx / dSeg;
                  const sNz = sDz / dSeg;
                  fi.x += sNx * sOverlap * 0.85;
                  fi.z += sNz * sOverlap * 0.85;

                  const dotObs = fi.vx * sNx + fi.vz * sNz;
                  if (dotObs < 0) {
                    fi.vx -= sNx * dotObs * 0.85;
                    fi.vz -= sNz * dotObs * 0.85;
                  }
                }
              } else {
                // Cylinder obstacle
                const sDx = s.x - obs.x;
                const sDz = s.z - obs.z;
                const dStem = Math.hypot(sDx, sDz);
                const minObstacleDist = s.r + (obs.stemRadius ?? 0.08);

                if (dStem < minObstacleDist && dStem > 0.001) {
                  const sOverlap = minObstacleDist - dStem;
                  const sNx = sDx / dStem;
                  const sNz = sDz / dStem;
                  fi.x += sNx * sOverlap * 0.85;
                  fi.z += sNz * sOverlap * 0.85;

                  const dotStem = fi.vx * sNx + fi.vz * sNz;
                  if (dotStem < 0) {
                    fi.vx -= sNx * dotStem * 0.85;
                    fi.vz -= sNz * dotStem * 0.85;
                  }
                }
              }
            }
          }
        }
      }
    }

    for (let i = 0; i < count; i++) {
      const f = this.fishes[i];
      const sp = f.species;
      const bPeriod = burstPeriods[sp];
      const bRatio = burstRatios[sp];
      const cycle = ((f.swimTimer * 0.45 + i * 0.35) % bPeriod) / bPeriod;
      let burstFactor = 0.25;
      if (cycle < bRatio) {
        const p = cycle / bRatio;
        burstFactor = 0.25 + 0.75 * Math.sin(p * Math.PI);
      }
      const tailActivity = Math.min(1.0, burstFactor + f.panic * 0.65);
      // Pack into uniform buffers
      const off = i * 4;
      this.fishPosBuffer[off] = f.x;
      this.fishPosBuffer[off + 1] = f.y;
      this.fishPosBuffer[off + 2] = f.z;
      this.fishPosBuffer[off + 3] = f.scale;

      this.fishDirBuffer[off] = f.dirX;
      this.fishDirBuffer[off + 1] = f.dirY;
      this.fishDirBuffer[off + 2] = f.dirZ;
      this.fishDirBuffer[off + 3] = f.tailPhase;

      this.fishColBuffer[off] = f.species * 0.1;
      this.fishColBuffer[off + 1] = tailActivity;
      this.fishColBuffer[off + 2] = f.colorVariant;
      this.fishColBuffer[off + 3] = f.bank;
    }
  }

  /* ---------------- 3D Green Sea Turtle Simulation (Chelonia mydas) ---------------- */
  private updateTurtle(dt: number) {
    const t = this.turtle;
    const depth = this.config.waterDepth ?? 1.6;
    const targetDepth = -Math.min(depth * 0.55, 0.75);

    // Wander angle changes slowly and smoothly for majestic curves
    t.wanderAngle += (Math.sin(this.tSim * 0.08) * 0.35 + Math.cos(this.tSim * 0.05) * 0.20) * dt;

    // Proactive lookahead boundary steering for sea turtle (1.6s future projection)
    const [bSteerX, bSteerY, bSteerZ] = computeBoundarySteering(
      t.x, t.y, t.z,
      t.dirX, t.dirY, t.dirZ,
      t.speed,
      1.55,
      -Math.max(0.6, depth * 0.78),
      -0.30,
      1.6
    );

    let targetDirX = Math.cos(t.wanderAngle) + bSteerX;
    let targetDirZ = Math.sin(t.wanderAngle) + bSteerZ;
    let targetDirY = (targetDepth - t.y) * 0.30 + bSteerY;

    const targetLen = Math.hypot(targetDirX, targetDirY, targetDirZ) || 1.0;
    targetDirX /= targetLen;
    targetDirY /= targetLen;
    targetDirZ /= targetLen;

    // Strict angular velocity constraint on sea turtle (maximum turn rate ~0.75 rad/s / ~43 deg/s)
    // Ensures large, majestic turning arcs with realistic rotational inertia
    const oldDirX = t.dirX;
    const oldDirZ = t.dirZ;
    const maxTurtleTurnRate = 0.75; // rad/s
    const [newDirX, newDirY, newDirZ] = constrainAngularVelocity(
      t.dirX, t.dirY, t.dirZ,
      targetDirX, targetDirY, targetDirZ,
      maxTurtleTurnRate * dt
    );
    t.dirX = newDirX;
    t.dirY = newDirY;
    t.dirZ = newDirZ;

    // Flipper stroke cycle with speed-adaptive frequency (active flap ~1.8-2.0s tempo)
    t.strokeTimer += dt;
    const strokeFreq = 0.48 + (t.speed / 0.3) * 0.12;
    t.flipperPhase += dt * strokeFreq * Math.PI * 2;

    // Asymmetric power stroke propulsion: power downstroke pushes forward
    const downstroke = Math.pow(Math.max(0, Math.sin(t.flipperPhase)), 1.3);
    const cruiseSpeed = 0.20 + downstroke * 0.14;
    t.speed = cruiseSpeed;

    // Anisotropic hydrodynamic locomotion (strong lateral resistance, smooth forward glide)
    const [nVx, nVy, nVz] = applyHydrodynamicLocomotion(
      t.vx, t.vy, t.vz,
      t.dirX, t.dirY, t.dirZ,
      cruiseSpeed,
      1.4, // axial responsiveness
      5.2, // lateral keel drag
      dt
    );
    t.vx = nVx;
    t.vy = nVy;
    t.vz = nVz;

    // Continuous position step
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    t.z += t.vz * dt;

    // Inward banking roll coupled to actual yaw rate
    const yawDelta = (t.dirX * -oldDirZ + t.dirZ * oldDirX);
    const targetBank = Math.max(-0.45, Math.min(0.45, (yawDelta / Math.max(1e-4, dt)) * 0.35));
    t.bank += (targetBank - t.bank) * (1.0 - Math.exp(-2.5 * dt));

    // Pack into buffers
    this.turtlePosBuffer[0] = t.x;
    this.turtlePosBuffer[1] = t.y;
    this.turtlePosBuffer[2] = t.z;
    this.turtlePosBuffer[3] = t.scale;

    this.turtleDirBuffer[0] = t.dirX;
    this.turtleDirBuffer[1] = t.dirY;
    this.turtleDirBuffer[2] = t.dirZ;
    this.turtleDirBuffer[3] = t.flipperPhase;

    this.turtleColBuffer[0] = t.bank;
    this.turtleColBuffer[1] = 0.0;
    this.turtleColBuffer[2] = 0.0;
    this.turtleColBuffer[3] = 0.0;
  }

  /* ---------------- Floating Marine Debris ---------------- */
  private initDebris() {
    this.debrisList = [
      { x: -0.85, y: 0, z: 1.25, dirX: 0.85, dirZ: 0.52, size: 1.1, type: 0 },
      { x: 1.4, y: 0, z: -0.7, dirX: -0.7, dirZ: 0.71, size: 0.85, type: 0 },
      { x: 0.45, y: 0, z: 0.95, dirX: 0.3, dirZ: 0.95, size: 1.15, type: 1 },
      { x: -1.35, y: 0, z: -0.85, dirX: -0.6, dirZ: -0.8, size: 0.95, type: 1 },
    ];
  }

  private updateDebris(dt: number, time: number) {
    const windFactor = (this.config.windSpeed ?? 6.0) / 6.0;
    const filterType = this.config.debrisType ?? 'both';

    for (let i = 0; i < this.debrisList.length; i++) {
      const d = this.debrisList[i];
      d.x += Math.cos(time * 0.12 + i * 1.5) * 0.06 * dt * windFactor;
      d.z += Math.sin(time * 0.10 + i * 1.5) * 0.06 * dt * windFactor;
      if (Math.hypot(d.x, d.z) > 4.2) {
        d.x *= 0.96;
        d.z *= 0.96;
      }

      let activeType = d.type;
      if (filterType === 'driftwood') activeType = 0;
      else if (filterType === 'seaweed') activeType = 1;

      const off = i * 4;
      this.debrisPosBuffer[off] = d.x;
      this.debrisPosBuffer[off + 1] = 0.0;
      this.debrisPosBuffer[off + 2] = d.z;
      this.debrisPosBuffer[off + 3] = d.size;

      this.debrisRotBuffer[off] = d.dirX;
      this.debrisRotBuffer[off + 1] = 0.0;
      this.debrisRotBuffer[off + 2] = d.dirZ;
      this.debrisRotBuffer[off + 3] = activeType;
    }
  }

  /* ---------------- Interactive Ripples ---------------- */
  public tapToDrop(sx: number, sy: number, radius?: number, strength?: number) {
    const B = this.camBasis(this.tSim);
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((sx - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((sy - rect.top) / rect.height) * 2;
    const vfov = (this.config.cameraFov * Math.PI) / 180;
    const tf = Math.tan(vfov / 2);
    const asp = this.W / this.H;

    const d: [number, number, number] = [
      B.f[0] + nx * asp * tf * B.r[0] + ny * tf * B.u[0],
      B.f[1] + nx * asp * tf * B.r[1] + ny * tf * B.u[1],
      B.f[2] + nx * asp * tf * B.r[2] + ny * tf * B.u[2],
    ];

    if (d[1] >= -0.01) return;
    const t = -B.pos[1] / d[1];
    const px = B.pos[0] + d[0] * t;
    const pz = B.pos[2] + d[2] * t;
    const u = (px - this.ripCenter[0]) / this.RSIZE + 0.5;
    const v = (pz - this.ripCenter[1]) / this.RSIZE + 0.5;

    if (u < 0.02 || u > 0.98 || v < 0.02 || v > 0.98) return;

    const r = radius ?? this.config.rippleDisturbanceRadius ?? 0.026;
    const s = strength ?? this.config.rippleDisturbanceStrength ?? 0.085;
    this.triggerRipple(u, v, r, s);
    waterAudio.playDrop(0.7, nx);

    // Shockwave burst in fish school (threejs-fish Shockwave interaction)
    this.shockwaveOrigin = [px, pz];
    this.shockwaveTimer = 1.0;
  }

  public updatePointerWorldPos(sx: number, sy: number) {
    const B = this.camBasis(this.tSim);
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((sx - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((sy - rect.top) / rect.height) * 2;
    const vfov = (this.config.cameraFov * Math.PI) / 180;
    const tf = Math.tan(vfov / 2);
    const asp = this.W / this.H;

    const d: [number, number, number] = [
      B.f[0] + nx * asp * tf * B.r[0] + ny * tf * B.u[0],
      B.f[1] + nx * asp * tf * B.r[1] + ny * tf * B.u[1],
      B.f[2] + nx * asp * tf * B.r[2] + ny * tf * B.u[2],
    ];

    if (d[1] < -0.01) {
      const t = -B.pos[1] / d[1];
      this.pointerWorldPos = [B.pos[0] + d[0] * t, 0, B.pos[2] + d[2] * t];
    }
  }

  public triggerDragRipple(sx: number, sy: number) {
    const now = performance.now();
    const dist = Math.hypot(sx - this.lastDragRipplePos.x, sy - this.lastDragRipplePos.y);
    const elapsed = now - this.lastDragRipplePos.t;
    if (dist > 18 || elapsed > 90) {
      const r = (this.config.rippleDisturbanceRadius ?? 0.026) * 0.85;
      const s = (this.config.rippleDisturbanceStrength ?? 0.085) * 0.72;
      this.tapToDrop(sx, sy, r, s);
      this.lastDragRipplePos = { x: sx, y: sy, t: now };
    }
  }

  /* ---------------- Pointer Interaction Handlers ---------------- */
  public onPointerDown(e: PointerEvent) {
    this.isDragging = true;
    this.dragStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.lastDragRipplePos = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.updatePointerWorldPos(e.clientX, e.clientY);
    // Immediately spawn circular ripple disturbance on click/tap!
    this.tapToDrop(e.clientX, e.clientY);
  }

  public onPointerMove(e: PointerEvent, mode: 'orbit' | 'ripple' | 'both') {
    this.updatePointerWorldPos(e.clientX, e.clientY);
    if (!this.isDragging) return;

    if (mode === 'ripple') {
      this.triggerDragRipple(e.clientX, e.clientY);
      return;
    }

    if (mode === 'both' && this.config.rippleDragWake !== false) {
      this.triggerDragRipple(e.clientX, e.clientY);
    }

    const rect = this.canvas.getBoundingClientRect();
    const k = 1.35 / Math.min(rect.width, rect.height);
    const dx = (e.clientX - this.dragStart.x) * k;
    const dy = (e.clientY - this.dragStart.y) * k;

    this.cam.yaw -= dx;
    this.cam.pitch += dy;
    this.cam.pitch = Math.max(-1.45, Math.min(0.35, this.cam.pitch));
    this.cam.targetYaw = this.cam.yaw;
    this.cam.targetPitch = this.cam.pitch;
    this.cam.vy = -dx;
    this.cam.vp = dy;

    this.dragStart.x = e.clientX;
    this.dragStart.y = e.clientY;
  }

  public onPointerUp(e: PointerEvent, mode: 'orbit' | 'ripple' | 'both') {
    if (this.isDragging) {
      const dist = Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y);
      const elapsed = performance.now() - this.dragStart.t;
      if (dist < 10 && elapsed < 350) {
        this.tapToDrop(e.clientX, e.clientY);
      }
    }
    this.isDragging = false;
  }

  /* ---------------- Main Render Loop ---------------- */
  private renderLoop = (now: number) => {
    if (this.disposed) return;

    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const windFactor = 0.8 + 0.2 * ((this.config.windSpeed ?? 6.0) / 6.0);
    this.tSim += dt * this.config.waveSpeed * windFactor;
    const t = this.tSim;

    // Smooth camera inertia & Cinematic Auto-Orbit
    if (!this.isDragging) {
      if (this.config.autoOrbit) {
        const speed = this.config.cinematicSpeed ?? 1.0;
        // Continuous time-based smooth yaw rotation around the water surface
        this.cam.yaw += dt * 0.16 * speed;

        // Dynamic pitch undulation for dramatic cinematic perspective
        if (this.config.cinematicUndulate !== false) {
          const targetPitch = -0.68 + 0.12 * Math.sin(t * 0.18);
          this.cam.pitch = this.cam.pitch * 0.985 + targetPitch * 0.015;
        }
      }
      this.cam.yaw += this.cam.vy * 0.9;
      this.cam.pitch += this.cam.vp * 0.9;
      this.cam.vy *= 0.9;
      this.cam.vp *= 0.9;
      this.cam.pitch = Math.max(-1.45, Math.min(0.35, this.cam.pitch));
    }

    // Auto Rain generator
    if (this.config.rainMode) {
      this.rainTimer += dt;
      const interval = 1.0 / Math.max(1, this.config.rainIntensity);
      if (this.rainTimer >= interval) {
        this.rainTimer = 0;
        const ru = 0.15 + Math.random() * 0.7;
        const rv = 0.15 + Math.random() * 0.7;
        this.triggerRipple(ru, rv, 0.015 + Math.random() * 0.015, 0.04 + Math.random() * 0.04);
        waterAudio.playDrop(0.35, (ru - 0.5) * 1.8);
      }
    }

    if (!this.pebReady) {
      this.animId = requestAnimationFrame(this.renderLoop);
      return;
    }

    const gl = this.gl;
    const B = this.camBasis(t);

    // Compute sun direction vector from Azimuth & Elevation
    const elRad = (this.config.sunElevation * Math.PI) / 180;
    const azRad = (this.config.sunAzimuth * Math.PI) / 180;
    const sunV: [number, number, number] = [
      Math.sin(azRad) * Math.cos(elRad),
      Math.sin(elRad),
      -Math.cos(azRad) * Math.cos(elRad),
    ];

    // 1. FFT Waves
    this.runFFT(t * 0.9);

    // 2. Ripples
    const look = -B.pos[1] / Math.min(B.f[1], -0.2);
    const want = [B.pos[0] + B.f[0] * look * 0.9, B.pos[2] + B.f[2] * look * 0.9];
    const tx = this.RSIZE / this.RN;
    const dxT = Math.round((want[0] - this.ripCenter[0]) / tx);
    const dzT = Math.round((want[1] - this.ripCenter[1]) / tx);

    if (this.ripActive < 900) {
      this.stepRipples([dxT / this.RN, dzT / this.RN]);
      this.ripCenter = [this.ripCenter[0] + dxT * tx, this.ripCenter[1] + dzT * tx];
      this.ripActive++;
    } else {
      this.ripCenter = [this.ripCenter[0] + dxT * tx, this.ripCenter[1] + dzT * tx];
    }

    // 3. Caustics
    this.renderCaustics(sunV);

    // 4. Main Water Surface Pass
    if (this.hdrRT && this.surfRT && this.causRT && this.pebTex && this.ripN) {
      this.setTarget(this.hdrRT);
      gl.disable(gl.BLEND);
      gl.useProgram(this.pMain.p);

      this.bindT(0, this.surfRT.t);
      this.bindT(1, this.causRT.t);
      this.bindT(2, this.pebTex);
      this.bindT(3, this.ripN.t);

      const u = this.pMain.u;
      gl.uniform1i(u.uSurf, 0);
      gl.uniform1i(u.uCaus, 1);
      gl.uniform1i(u.uPeb, 2);
      gl.uniform1i(u.uRip, 3);

      gl.uniform3fv(u.uCam, B.pos);
      gl.uniform3fv(u.uR, B.r);
      gl.uniform3fv(u.uU, B.u);
      gl.uniform3fv(u.uF, B.f);
      gl.uniform3fv(u.uSun, sunV);

      const sunCol = this.config.sunColor.map((c) => c * this.config.sunIntensity) as [number, number, number];
      gl.uniform3fv(u.uSunColor, sunCol);
      gl.uniform3fv(u.uSigA, this.config.absorption);
      gl.uniform3fv(u.uSigS, this.config.scattering);

      const vfov = (this.config.cameraFov * Math.PI) / 180;
      gl.uniform1f(u.uTanF, Math.tan(vfov / 2));
      gl.uniform1f(u.uAspect, this.W / this.H);
      gl.uniform1f(u.uL, this.L);
      gl.uniform1f(u.uDepth, this.config.waterDepth);
      gl.uniform1f(u.uTime, t);
      const causticsVal = this.config.underwaterCausticsIntensity ?? this.config.causticsIntensity ?? 1.0;
      gl.uniform1f(u.uCausticsIntensity, causticsVal);
      gl.uniform1f(u.uFishPhaseDelay, this.config.fishPhaseDelay ?? 1.0);
      gl.uniform1f(u.uUnderwaterShadowIntensity, this.config.underwaterShadowIntensity ?? 1.0);
      gl.uniform1f(u.uUnderwaterShadowSoftness, this.config.underwaterShadowSoftness ?? 1.0);
      gl.uniform1f(u.uGodRayIntensity, this.config.godRayIntensity ?? 1.2);
      gl.uniform1f(u.uChoppiness, this.config.choppiness ?? 1.1);
      gl.uniform1f(u.uTurbidity, this.config.turbidity ?? 1.0);
      gl.uniform1f(u.uRipSize, this.RSIZE);
      gl.uniform2fv(u.uRipCenter, this.ripCenter);
      gl.uniform2fv(u.uCausShift, this.causShift);

      // Water Environment: 0 = Pond (연못), 1 = River (강), 2 = Ocean (바다)
      const envVal = this.config.waterEnvironment === 'pond' ? 0 : this.config.waterEnvironment === 'ocean' ? 2 : 1;
      gl.uniform1i(u.uEnvironment, envVal);
      // Pond Border Mode: 0 = fullscreen (전체 화면 광활한 연못 수면), 1 = framed (3D 정원 수변 테두리 프레임)
      const isFramedPond = (this.config.pondBorderMode ?? 'framed') === 'framed';
      gl.uniform1i(u.uPondBorderMode, isFramedPond ? 1 : 0);

      // Dynamic Garden Transparency & Visibility
      const gardenOpacity = this.config.gardenObjectOpacity ?? 1.0;
      gl.uniform1f(u.uGardenOpacity, gardenOpacity);
      const lowAngleFade = this.config.gardenLowAngleTransparency !== false;
      gl.uniform1i(u.uGardenLowAngleTransparency, lowAngleFade ? 1 : 0);

      // Update and pass 3D fish school
      this.updateFish(dt);
      gl.uniform1i(u.uFishEnabled, (this.config.fishEnabled !== false) ? 1 : 0);
      gl.uniform1i(u.uFishCount, Math.min(12, this.config.fishCount ?? 10));
      gl.uniform4fv(u.uFishPos, this.fishPosBuffer);
      gl.uniform4fv(u.uFishDir, this.fishDirBuffer);
      gl.uniform4fv(u.uFishCol, this.fishColBuffer);

      // Update and pass 3D Green Sea Turtle
      this.updateTurtle(dt);
      gl.uniform1i(u.uTurtleEnabled, (this.config.turtleEnabled !== false) ? 1 : 0);
      gl.uniform4fv(u.uTurtlePos, this.turtlePosBuffer);
      gl.uniform4fv(u.uTurtleDir, this.turtleDirBuffer);
      gl.uniform4fv(u.uTurtleCol, this.turtleColBuffer);

      // Marine Snow & Bubbles
      gl.uniform1i(u.uMarineSnowEnabled, (this.config.marineSnowEnabled !== false) ? 1 : 0);
      gl.uniform1i(u.uBubbleEnabled, (this.config.bubbleStreamEnabled !== false) ? 1 : 0);

      // Update and pass floating marine debris
      this.updateDebris(dt, t);
      gl.uniform1i(u.uDebrisEnabled, (this.config.debrisEnabled === true) ? 1 : 0);
      gl.uniform4fv(u.uDebrisPos, this.debrisPosBuffer);
      gl.uniform4fv(u.uDebrisRot, this.debrisRotBuffer);

      // Pass Procedural Aquatic Vegetation & Lotus Ecosystem Uniforms
      gl.uniform1i(u.uLilyCount, this.proceduralEco.uLilyCount);
      gl.uniform4fv(u.uLilyData, this.proceduralEco.uLilyData);
      gl.uniform4fv(u.uLilyMeta, this.proceduralEco.uLilyMeta);
      gl.uniform1i(u.uPlantCount, this.proceduralEco.uPlantCount);
      gl.uniform4fv(u.uPlantData, this.proceduralEco.uPlantData);

      this.drawFullscreen();
    }

    // 5. Post Process
    this.post(t);

    // Frame metrics & Adaptive Resolution
    this.ftAvg = this.ftAvg * 0.95 + dt * 1000 * 0.05;
    this.frames++;
    if (this.frames > 60) {
      if (this.ftAvg > 24 && this.quality > 0.45) {
        this.quality = Math.max(0.45, this.quality * 0.9);
        this.handleResize();
      } else if (this.ftAvg < 14 && this.quality < 1.0) {
        this.quality = Math.min(1.0, this.quality * 1.08);
        this.handleResize();
      }
      this.frames = 0;
      if (this.onStats) {
        this.onStats({
          fps: Math.round(1000 / Math.max(1, this.ftAvg)),
          width: this.W,
          height: this.H,
          quality: Math.round(this.quality * 100),
        });
      }
    }

    this.animId = requestAnimationFrame(this.renderLoop);
  };

  public captureSnapshot(): string {
    return this.canvas.toDataURL('image/png');
  }

  public dispose() {
    this.disposed = true;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    const gl = this.gl;
    if (this.triVAO) gl.deleteVertexArray(this.triVAO);
    if (this.gridVAO) gl.deleteVertexArray(this.gridVAO);
    if (this.h0Tex) gl.deleteTexture(this.h0Tex);
    if (this.pebTex) gl.deleteTexture(this.pebTex);
    for (const r of [
      this.fftA,
      this.fftB,
      this.surfRT,
      this.causRT,
      ...this.rip,
      this.ripN,
      this.hdrRT,
      this.qA,
      this.qB,
      this.streakRT,
      this.b1,
      this.b2,
      this.b2t,
      ...this.gA,
      ...this.gB,
    ]) {
      if (r) {
        gl.deleteTexture(r.t);
        gl.deleteFramebuffer(r.fb);
      }
    }
  }
}
