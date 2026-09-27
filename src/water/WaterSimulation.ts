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

  // Camera & Input State
  public cam = {
    yaw: 0,
    pitch: -0.72,
    vy: 0,
    vp: 0,
    h: 1.55,
  };
  public isDragging = false;
  private dragStart = { x: 0, y: 0, t: 0 };
  private lastTapPos: [number, number] | null = null;
  private rainTimer = 0;

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
void main(){
  ivec2 off = ivec2(gl_InstanceID % 3 - 1, gl_InstanceID / 3 - 1);
  vec4 s = textureLod(uSurf, aUV, 0.0);
  vec3 n = normalize(vec3(-s.y, 1.0, -s.z));
  vec3 r = refract(-uSun, n, 1.0/uIor);
  vec3 P = vec3(aUV.x*uL, s.x, aUV.y*uL);
  vec3 F = P + r*((-uDepth - s.x)/r.y);
  vSrc = aUV*uL;
  vec2 c = (F.xz - uShift)/uL + vec2(off);
  gl_Position = vec4(c*2.0-1.0, 0.0, 1.0);
}`,
      `#version 300 es
precision highp float;
in vec2 vSrc; out vec4 o; uniform float uNorm;
void main(){
  vec2 a = dFdx(vSrc), b = dFdy(vSrc);
  float area = abs(a.x*b.y - a.y*b.x);
  float I = min(area*uNorm, 40.0);
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
uniform float uCausticsIntensity;
uniform vec2 uCausShift, uRipCenter;

const float IOR = 1.3335;
const float PI = 3.14159265359;

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }

float ridge(float a){
  return 0.040 + 0.016*sin(a*2.0+0.7) + 0.011*sin(a*5.0+2.1) + 0.006*sin(a*11.0+0.3) + 0.003*sin(a*23.0+1.7);
}
float fbm2(vec2 p){ float v=0., a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p=p*2.03+17.1; a*=0.5; } return v; }

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

  // Distant headlands
  float a = atan(d.z, d.x);
  float r = ridge(a) + 0.0045*(vnoise(vec2(a*260.0, 0.0))-0.5) + 0.002*(vnoise(vec2(a*900.0, 3.0))-0.5);
  float back = smoothstep(-0.3, 0.95, dot(normalize(vec2(d.x,d.z)+1e-5), normalize(vec2(uSun.x,uSun.z))));
  float u = clamp(e / max(r, 1e-3), 0.0, 1.0);
  vec2 q = vec2(a*420.0, e*420.0);
  float tex = fbm2(q);
  vec3 pine = vec3(0.045, 0.070, 0.042) * (0.6 + 0.8*tex) * dayMix;
  vec3 rock = vec3(0.30, 0.28, 0.23) * (0.55 + 0.7*fbm2(q*1.7+5.0)) * dayMix;
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

float floorDepth(vec2 xz){
  float shelf = 0.95 + 0.17*clamp(-xz.y + 1.5, 0.0, 14.0);
  return shelf + 0.30*(vnoise(xz*0.22)-0.5) + 0.10*(vnoise(xz*0.9+7.0)-0.5);
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

void main(){
  vec2 ndc = vUv*2.0-1.0;
  vec3 rd = normalize(uF + ndc.x*uAspect*uTanF*uR + ndc.y*uTanF*uU);
  vec3 wd = rd; wd.y = min(wd.y, -0.0015); wd = normalize(wd);

  // Surface intersection
  float t = -uCam.y / wd.y;
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
    hsum = A.x + WB*SC*B.x + R.x;
    t = (hsum - uCam.y) / wd.y;
  }
  vec3 P = uCam + wd*t;
  vec2 chopDisp = -A.yz * (uChoppiness * 0.045);
  vec2 Pxz = P.xz + chopDisp;
  A = texBS(uSurf, Pxz/uL);
  B = texBS(uSurf, (M*Pxz)/(uL*SC) + 0.37);
  vec2 slope = A.yz + WB*(transpose(M)*B.yz) + R.yz;
  const mat2 M2 = mat2(0.28, 0.96, -0.96, 0.28);
  vec4 Cm = texture(uSurf, (M2*Pxz)/(uL*0.13) + 0.71);
  slope += 0.13*exp(-t*0.18)*(transpose(M2)*Cm.yz);
  float var = max(A.w - dot(A.yz,A.yz), 0.0) + WB*WB*max(B.w - dot(B.yz,B.yz), 0.0);
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
  vec3 pf = pebbles(FP.xz, 1.0, hgt);
  vec3 pc = pebbles(FP.xz.yx*vec2(-1.0,1.0) + 5.3, 1.7, hgt2);
  float coarse = smoothstep(0.45, 0.62, fbm2(FP.xz*0.21 + 40.0));
  vec3 alb = mix(pf, pc, coarse); hgt = mix(hgt, hgt2, coarse);
  float zone = fbm2(FP.xz*0.16 + 3.0) + 0.10*(vnoise(FP.xz*2.5)-0.5);
  float sandM = smoothstep(hgt + 0.02, hgt + 0.16, (zone - 0.46)*1.6);
  float marks = 0.5 + 0.5*sin(dot(FP.xz, vec2(0.93, 0.37))*16.0 + 3.0*vnoise(FP.xz*0.8));
  vec3 sand = vec3(0.60, 0.55, 0.44) * (0.82 + 0.22*vnoise(FP.xz*40.0) + 0.10*marks);
  sand = sand*sand*1.4;
  alb = mix(alb, sand, sandM); hgt = mix(hgt, 0.42 + 0.05*marks, sandM);
  alb = mix(vec3(dot(alb,vec3(0.3,0.55,0.15))), alb, 0.8) * vec3(1.10, 1.0, 0.86);

  float big = vnoise(FP.xz*0.45) * 0.65 + vnoise(FP.xz*1.3+3.1) * 0.35;
  float weed = smoothstep(0.55, 0.85, vnoise(FP.xz*0.32 + 11.0));
  alb *= mix(0.62, 1.22, big);
  alb = mix(alb, alb*vec3(0.55, 0.62, 0.40), weed*0.7);
  alb = mix(vec3(0.30,0.29,0.27), pow(alb, vec3(1.2)), 0.72) * 0.6;

  // Caustics projection
  vec3 sunT = refract(-uSun, vec3(0,1,0), 1.0/IOR);
  float Ts = 1.0 - fresnel(uSun.y, IOR);
  float depthHere = max(P.y - FP.y, 0.0);
  vec2 cuv = (FP.xz - uCausShift + sunT.xz/(-sunT.y)*(hgt-0.35)*0.05)/uL;
  vec3 caus = texture(uCaus, cuv, 1.0).rgb * uCausticsIntensity;

  // Ripple curvature lensing
  vec2 S = FP.xz - sunT.xz*depthHere/(-sunT.y);
  float lap = texture(uRip, (S - uRipCenter)/uRipSize + 0.5).a;
  caus *= clamp(1.0/(1.0 + 0.12*depthHere*lap), 0.45, 3.0);
  float ao = mix(0.55, 1.0, smoothstep(0.08, 0.42, hgt));

  // Light extinction & in-scattering with physical Turbidity / Clarity
  // uTurbidity modulates volume scattering sigma_s as light penetrates deeper into water
  float turb = clamp(uTurbidity, 0.05, 3.5);
  vec3 effSigS = uSigS * turb;
  vec3 sigT = uSigA + effSigS;

  // In deeper turbid water, sharp caustic patterns diffuse into soft scattered ambient light
  float causDiffuse = clamp((turb - 0.35) * 0.22 * depthHere, 0.0, 0.85);
  vec3 causAtten = mix(caus, vec3(1.0), causDiffuse);

  vec3 Esun = uSunColor * Ts * exp(-sigT*depthHere/(-sunT.y)) * causAtten * (-sunT.y) * mix(0.75, 1.0, ao);
  vec3 skyIrr = mix(vec3(0.55, 0.32, 0.20), vec3(0.62, 0.70, 0.78), clamp(uSun.y*2.5, 0.08, 1.0)) * PI * 0.22;
  vec3 Esky = skyIrr * exp(-(uSigA + 0.4*effSigS)*depthHere*1.25) * ao;
  vec3 Lfloor = alb/PI * (Esun + Esky);

  vec3 Tv = exp(-sigT*s);
  float cosS = dot(sunT, -tr);
  // Henyey-Greenstein asymmetry factor g: shifts from forward-peaked (g=0.84 in clear water) to more diffuse/isotropic (g=0.62 in turbid water)
  float g = mix(0.84, 0.62, clamp((turb - 0.5) * 0.35, 0.0, 0.65));
  float ph = (1.0-g*g)/(4.0*PI*pow(1.0+g*g-2.0*g*cosS, 1.5));
  vec3 Lmid = uSunColor*Ts*exp(-sigT*depthHere*0.5/(-sunT.y))*(ph+0.02) + skyIrr*exp(-uSigA*depthHere*0.6)/(4.0*PI);
  vec3 Lin = (effSigS / max(sigT, vec3(1e-4))) * Lmid * (1.0 - Tv) * (2.2 + 1.2 * min(turb, 2.0));
  vec3 under = Lfloor*Tv + Lin;

  // Floating particles
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

  vec3 col = F*refl + (1.0-F)*under + spec;

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

  // Tone Mapping: HDR Mode (ACES Filmic with expanded dynamic range) vs Standard Mode (Reinhard SDR)
  vec3 hdrMapped = aces(c * max(0.5, uHdrHeadroom));
  vec3 sdrMapped = reinhard(c * 1.08);
  c = mix(sdrMapped, hdrMapped, clamp(uHdrToneMap, 0.0, 1.0));

  float lum = dot(c, vec3(0.2126,0.7152,0.0722));
  c = mix(vec3(lum), c, 0.90);
  c = mix(c, c*vec3(0.96,1.0,1.05), 1.0 - smoothstep(0.0, 0.35, lum));
  c = pow(c, vec3(1.0/2.2));
  float g = hash(gl_FragCoord.xy + fract(uTime*7.13)*917.0) - 0.5;
  c += g * 0.018 * (1.0 - c*0.6);
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

    const glareMul = this.config.glareEnabled ? (this.config.diffractionIntensity ?? 1.0) : 0.0;

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
    const yaw = this.cam.yaw + 0.01 * Math.sin(t * 0.31) + 0.005 * Math.sin(t * 0.83 + 1.3);
    const pit = this.cam.pitch + 0.007 * Math.sin(t * 0.47 + 2.0) + 0.003 * Math.sin(t * 1.13);
    const roll = 0.006 * Math.sin(t * 0.39 + 0.4);

    const f: [number, number, number] = [Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)];
    const r: [number, number, number] = [Math.cos(yaw), 0, Math.sin(yaw)];
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
        ? 0.06 * Math.sin(t * 0.15)
        : 0;

    const pos: [number, number, number] = [
      0.03 * Math.sin(t * 0.21),
      this.config.cameraHeight + 0.015 * Math.sin(t * 0.57) + undulateH,
      0.03 * Math.cos(t * 0.17),
    ];
    return { f, r: r2, u: u2, pos };
  }

  public tapToDrop(sx: number, sy: number) {
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

    this.triggerRipple(u, v, 0.024, 0.08);
    waterAudio.playDrop(0.7, nx);
  }

  /* ---------------- Pointer Interaction Handlers ---------------- */
  public onPointerDown(e: PointerEvent) {
    this.isDragging = true;
    this.dragStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  public onPointerMove(e: PointerEvent, mode: 'orbit' | 'ripple' | 'both') {
    if (!this.isDragging) return;

    if (mode === 'ripple') {
      this.tapToDrop(e.clientX, e.clientY);
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const k = 1.35 / Math.min(rect.width, rect.height);
    const dx = (e.clientX - this.dragStart.x) * k;
    const dy = (e.clientY - this.dragStart.y) * k;

    this.cam.yaw -= dx;
    this.cam.pitch += dy;
    this.cam.vy = -dx;
    this.cam.vp = dy;
    this.cam.pitch = Math.max(-1.45, Math.min(0.35, this.cam.pitch));

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
      gl.uniform1f(u.uCausticsIntensity, this.config.causticsIntensity);
      gl.uniform1f(u.uChoppiness, this.config.choppiness ?? 1.1);
      gl.uniform1f(u.uTurbidity, this.config.turbidity ?? 1.0);
      gl.uniform1f(u.uRipSize, this.RSIZE);
      gl.uniform2fv(u.uRipCenter, this.ripCenter);
      gl.uniform2fv(u.uCausShift, this.causShift);

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
