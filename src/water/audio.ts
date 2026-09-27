/**
 * Procedural Web Audio Ambient Soundscape & SFX Engine
 * Real-time continuous procedural synthesis for ocean waves, light rain, and droplet ripples.
 * Zero external audio assets, zero loading latency, infinite organic variation.
 */

export type AmbientSoundMode = 'waves' | 'rain' | 'both' | 'calm';

class WaterAudio {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = true;
  private masterVolume: number = 0.6;
  private ambientVolume: number = 0.5;
  private sfxVolume: number = 0.7;
  private ambientMode: AmbientSoundMode = 'waves';
  private rainActive: boolean = false;
  private windSpeed: number = 6.0;

  // Master & Bus Gains
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Ocean Waves ambient nodes
  private waveGain: GainNode | null = null;
  private waveFilter: BiquadFilterNode | null = null;
  private waveSource: AudioBufferSourceNode | null = null;
  private waveLfo: OscillatorNode | null = null;
  private waveLfoGain: GainNode | null = null;

  // Rain ambient nodes
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;

  // Precomputed Noise Buffers (Brown noise for deep ocean swell, Pink noise for water foam & rain)
  private pinkNoiseBuffer: AudioBuffer | null = null;
  private brownNoiseBuffer: AudioBuffer | null = null;

  public init() {
    if (this.ctx) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master output
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : this.masterVolume;
      this.masterGain.connect(this.ctx.destination);

      // SFX Bus
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);

      // Generate procedural noise buffers
      this.generateNoiseBuffers();

      // Setup continuous ambient audio graph
      this.setupAmbientGraph();
    } catch (err) {
      console.warn('Web Audio Context not initialized:', err);
    }
  }

  private generateNoiseBuffers() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const duration = 6.0; // 6 seconds seamless looping noise
    const length = Math.floor(sampleRate * duration);

    // 1. Pink Noise Buffer (Paul Kellet / Voss filter approximation)
    const pinkBuf = this.ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = pinkBuf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
    this.pinkNoiseBuffer = pinkBuf;

    // 2. Brown Noise Buffer (Integrated white noise for rich low-frequency ocean swells)
    const brownBuf = this.ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = brownBuf.getChannelData(ch);
      let last = 0.0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (last + 0.02 * white) / 1.02;
        last = data[i];
        data[i] *= 3.4; // Compensate amplitude
      }
    }
    this.brownNoiseBuffer = brownBuf;
  }

  private setupAmbientGraph() {
    if (!this.ctx || !this.masterGain || !this.pinkNoiseBuffer || !this.brownNoiseBuffer) return;

    // Ambient Master Gain Node
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = this.isMuted ? 0 : this.ambientVolume;
    this.ambientGain.connect(this.masterGain);

    // --- Ocean Waves Chain ---
    this.waveSource = this.ctx.createBufferSource();
    this.waveSource.buffer = this.brownNoiseBuffer;
    this.waveSource.loop = true;

    this.waveFilter = this.ctx.createBiquadFilter();
    this.waveFilter.type = 'lowpass';
    this.waveFilter.frequency.value = 420;
    this.waveFilter.Q.value = 2.2;

    this.waveGain = this.ctx.createGain();
    this.waveGain.gain.value = 0.55;

    // Slow LFO for natural ocean swell wash-in and wash-out cycles
    this.waveLfo = this.ctx.createOscillator();
    this.waveLfo.type = 'sine';
    const swellPeriodHz = 0.12 + 0.02 * (this.windSpeed / 6.0); // ~6-8 seconds cycle
    this.waveLfo.frequency.value = swellPeriodHz;

    this.waveLfoGain = this.ctx.createGain();
    this.waveLfoGain.gain.value = 320; // Filter cutoff sweep (+/- 320 Hz)

    this.waveLfo.connect(this.waveLfoGain);
    this.waveLfoGain.connect(this.waveFilter.frequency);

    this.waveSource.connect(this.waveFilter);
    this.waveFilter.connect(this.waveGain);
    this.waveGain.connect(this.ambientGain);

    try {
      this.waveSource.start();
      this.waveLfo.start();
    } catch {
      // ignore start errors if already started
    }

    // --- Light Rain Chain ---
    this.rainSource = this.ctx.createBufferSource();
    this.rainSource.buffer = this.pinkNoiseBuffer;
    this.rainSource.loop = true;

    this.rainFilter = this.ctx.createBiquadFilter();
    this.rainFilter.type = 'bandpass';
    this.rainFilter.frequency.value = 2800;
    this.rainFilter.Q.value = 1.0;

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0.0; // Updated dynamically by updateSoundLevels

    this.rainSource.connect(this.rainFilter);
    this.rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.ambientGain);

    try {
      this.rainSource.start();
    } catch {
      // ignore
    }

    this.updateSoundLevels();
  }

  private updateSoundLevels() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Master Gain
    if (this.masterGain) {
      const targetMaster = this.isMuted ? 0.0 : this.masterVolume;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(targetMaster, now + 0.08);
    }

    // Ambient Master Gain
    if (this.ambientGain) {
      const targetAmbient = this.isMuted ? 0.0 : this.ambientVolume;
      this.ambientGain.gain.cancelScheduledValues(now);
      this.ambientGain.gain.linearRampToValueAtTime(targetAmbient, now + 0.08);
    }

    // Ocean Waves vs Rain mixing based on ambientMode & rainActive
    let targetWaveGain = 0.55;
    let targetRainGain = 0.0;

    const windFactor = Math.min(1.8, Math.max(0.4, Math.sqrt(this.windSpeed / 6.0)));

    if (this.ambientMode === 'waves') {
      targetWaveGain = 0.58 * windFactor;
      targetRainGain = this.rainActive ? 0.42 : 0.0;
    } else if (this.ambientMode === 'rain') {
      targetWaveGain = 0.18;
      targetRainGain = 0.52;
    } else if (this.ambientMode === 'both') {
      targetWaveGain = 0.46 * windFactor;
      targetRainGain = 0.44;
    } else if (this.ambientMode === 'calm') {
      targetWaveGain = 0.22;
      targetRainGain = this.rainActive ? 0.35 : 0.0;
    }

    if (this.waveGain) {
      this.waveGain.gain.cancelScheduledValues(now);
      this.waveGain.gain.linearRampToValueAtTime(targetWaveGain, now + 0.15);
    }
    if (this.rainGain) {
      this.rainGain.gain.cancelScheduledValues(now);
      this.rainGain.gain.linearRampToValueAtTime(targetRainGain, now + 0.15);
    }

    // Adjust wave LFO speed with wind
    if (this.waveLfo) {
      const freq = Math.max(0.08, Math.min(0.24, 0.12 + 0.02 * (this.windSpeed / 6.0)));
      this.waveLfo.frequency.linearRampToValueAtTime(freq, now + 0.2);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (!this.ctx && !muted) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended' && !muted) {
      this.ctx.resume();
    }
    this.updateSoundLevels();
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0.0, Math.min(1.0, volume));
    if (this.masterVolume > 0.001 && this.isMuted) {
      this.isMuted = false;
    } else if (this.masterVolume <= 0.001) {
      this.isMuted = true;
    }
    if (!this.ctx && !this.isMuted) {
      this.init();
    }
    this.updateSoundLevels();
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public setAmbientVolume(volume: number) {
    this.ambientVolume = Math.max(0.0, Math.min(1.0, volume));
    if (!this.ctx && !this.isMuted) {
      this.init();
    }
    this.updateSoundLevels();
  }

  public getAmbientVolume(): number {
    return this.ambientVolume;
  }

  public setAmbientMode(mode: AmbientSoundMode) {
    this.ambientMode = mode;
    if (!this.ctx && !this.isMuted) {
      this.init();
    }
    this.updateSoundLevels();
  }

  public getAmbientMode(): AmbientSoundMode {
    return this.ambientMode;
  }

  public setRainActive(active: boolean) {
    this.rainActive = active;
    this.updateSoundLevels();
  }

  public setWindSpeed(speed: number) {
    this.windSpeed = speed;
    this.updateSoundLevels();
  }

  /**
   * Synthesizes a natural, liquid water droplet sound:
   * A rapid downward frequency chirp with resonant bandpass filter and gentle bubble pitch modulation.
   */
  public playDrop(intensity = 0.5, panX = 0) {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      const baseFreq = 520 + Math.random() * 380;
      const peakFreq = baseFreq + 820 + Math.random() * 300;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(peakFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.14);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(peakFreq * 0.9, now);
      filter.frequency.exponentialRampToValueAtTime(baseFreq * 1.1, now + 0.16);
      filter.Q.value = 4.5;

      const peakVolume = Math.min(0.3, 0.08 + intensity * 0.2);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peakVolume, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

      let outputNode: AudioNode = gain;
      if (this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, panX)), now);
        gain.connect(panner);
        outputNode = panner;
      }

      osc.connect(filter);
      filter.connect(gain);
      outputNode.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.26);
    } catch {
      // AudioContext error handling
    }
  }
}

export const waterAudio = new WaterAudio();
