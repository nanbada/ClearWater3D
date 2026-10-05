/**
 * FishAgent - 3D Marine Fish Entity with Spline-Interpolated Body Curve
 * 
 * Features:
 * 1. Catmull-Rom / Cubic Hermite Spline-based 'Body Curve' deformation algorithm
 * 2. Authentic sub-carangiform / carangiform S-curve undulation with multi-knot traveling phase lag
 * 3. Dynamic turning curvature arching the whole spine into hydrodynamic steering arcs
 * 4. Lifelike pectoral, caudal, dorsal, and anal fin coordinate alignment
 * 5. Analytical 1st (tangent) and 2nd (curvature) derivatives along the flexible spine
 */

export interface SpineKnot {
  s: number;         // Normalized longitudinal coordinate (0 = snout, 1.05 = peduncle, 1.60 = caudal tip)
  x: number;         // Lateral displacement (meters)
  weight: number;    // Amplitude weighting factor along anatomical spine
  name: string;      // Anatomical landmark name
}

export interface SplineEvaluation {
  x: number;         // Lateral offset along body axis (meters)
  tangent: number;   // dx/ds (slope/tangent)
  curvature: number; // d^2x/ds^2 (physical curvature / bending moment)
}

export class FishAgent {
  public x: number;
  public y: number;
  public z: number;
  public targetX = 0;
  public targetY = 0;
  public targetZ = 0;
  public vx = 0;
  public vy = 0;
  public vz = 0;
  public dirX = 1;
  public dirY = 0;
  public dirZ = 0;
  public bank = 0;
  public scale = 1;
  public species = 0;
  public color: [number, number, number] = [1, 1, 1];
  public tailPhase = 0;
  public speed = 0.5;
  public panic = 0;
  public swimTimer = 0;
  public wanderAngle = 0;
  public colorVariant = 0.5;
  public preferredDepthOffset = 0;

  // Inter-frame Acceleration & Velocity Smoothing State
  public smoothAx = 0;             // 평활화된 프레임 간 가속도 X
  public smoothAy = 0;             // 평활화된 프레임 간 가속도 Y
  public smoothAz = 0;             // 평활화된 프레임 간 가속도 Z
  public targetVx = 0;             // 목표 속도 벡터 X
  public targetVy = 0;             // 목표 속도 벡터 Y
  public targetVz = 0;             // 목표 속도 벡터 Z

  // Behavioral State & Transition Lerp Tracking (유영 상태 전환 보간)
  public state: 'cruise' | 'burst' | 'evade' | 'turn' = 'cruise';
  public prevState: 'cruise' | 'burst' | 'evade' | 'turn' = 'cruise';
  public stateTransitionProgress = 1.0; // 0.0 -> 1.0 (상태 전환 보간 가중치)

  // Animation Speed & Phase Delay Control Variables
  public animSpeed = 1.0;          // 유영 애니메이션 속도 제어 변수 (1.0 = 기준 속도)
  public currentSwimSpeed = 0.4;   // 사인 함수 보간을 거친 부드러운 현재 유영 속도
  public targetSwimSpeed = 0.4;    // 목표 유영 속도
  public tailPhaseDelay = 0.42;    // 꼬리지느러미 유체역학 위상 지연 (Phase Delay)
  public finPhaseDelay = 0.65;     // 등/뒷지느러미 유체 파동 위상 지연 (Phase Delay)
  public pecPhaseDelay = 0.85;     // 가슴지느러미 펄럭임 위상 지연 (Phase Delay)

  // 7 Anatomical Spine Control Knots from Rostrum to Caudal Fin Margin
  public spineKnots: SpineKnot[] = [
    { s: 0.00, x: 0, weight: 0.00, name: 'rostrum_snout' },         // Knot 0: Snout tip (stiff anchor, stable mouth)
    { s: 0.22, x: 0, weight: 0.06, name: 'cranial_hinge' },         // Knot 1: Operculum/cranial boundary (subtle gaze stabilization)
    { s: 0.50, x: 0, weight: 0.35, name: 'anterior_trunk' },        // Knot 2: Pectoral girdle (initiates gentle anterior S-crest)
    { s: 0.78, x: 0, weight: 0.70, name: 'mid_trunk_inflection' },  // Knot 3: Center of mass (dynamic S-curve inflection node)
    { s: 1.05, x: 0, weight: 1.05, name: 'posterior_trunk' },       // Knot 4: Pelvic/anal region (opposing posterior S-crest)
    { s: 1.30, x: 0, weight: 1.35, name: 'caudal_peduncle' },       // Knot 5: Tail wrist (high amplitude propulsion flex)
    { s: 1.60, x: 0, weight: 1.60, name: 'caudal_fin_margin' },     // Knot 6: Caudal fin trailing margin (maximum wave flutter)
  ];

  constructor(
    x: number,
    y: number,
    z: number,
    species: number,
    scale: number,
    speed: number,
    colorVariant: number,
    preferredDepthOffset: number
  ) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.species = species;
    this.scale = scale;
    this.speed = speed;
    this.colorVariant = colorVariant;
    this.preferredDepthOffset = preferredDepthOffset;
    this.tailPhase = Math.random() * Math.PI * 2;
    this.wanderAngle = Math.random() * Math.PI * 2;
  }

  /**
   * Linear interpolation (lerp)
   */
  public static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  /**
   * Exponential decay lerp (frame-rate independent smoothing):
   * Provides critically damped relaxation towards target value.
   */
  public static expLerp(current: number, target: number, rate: number, dt: number): number {
    const alpha = 1.0 - Math.exp(-rate * Math.max(0.0001, dt));
    return current + (target - current) * alpha;
  }

  /**
   * Updates behavioral state and smoothly blends parameters during state transitions.
   * Eliminates abrupt behavioral popping (e.g. from calm cruising to sudden evasive panic).
   */
  public updateState(
    newState: 'cruise' | 'burst' | 'evade' | 'turn',
    dt: number,
    transitionDuration = 0.35
  ) {
    if (this.state !== newState) {
      this.prevState = this.state;
      this.state = newState;
      this.stateTransitionProgress = 0.0;
    }
    if (this.stateTransitionProgress < 1.0) {
      const step = dt / Math.max(0.05, transitionDuration);
      this.stateTransitionProgress = Math.min(1.0, this.stateTransitionProgress + step);
    }
  }

  /**
   * Inter-frame acceleration smoothing filter (프레임 간 가속도 평활화 알고리즘):
   * Filters out high-frequency jerk (da/dt) from flocking, boundary, and obstacle forces.
   * Completely eliminates shuddering/trembling during rapid behavioral shifts.
   */
  public filterAcceleration(
    rawAx: number,
    rawAy: number,
    rawAz: number,
    dt: number,
    smoothingRate = 4.2
  ): [number, number, number] {
    this.smoothAx = FishAgent.expLerp(this.smoothAx, rawAx, smoothingRate, dt);
    this.smoothAy = FishAgent.expLerp(this.smoothAy, rawAy, smoothingRate, dt);
    this.smoothAz = FishAgent.expLerp(this.smoothAz, rawAz, smoothingRate, dt);
    return [this.smoothAx, this.smoothAy, this.smoothAz];
  }

  /**
   * Inter-frame velocity smoothing filter (프레임 간 속도 평활화 알고리즘):
   * Applies smooth, lag-free exponential velocity relaxation towards desired target speed and heading.
   */
  public filterVelocity(
    targetVx: number,
    targetVy: number,
    targetVz: number,
    dt: number,
    smoothingRate = 3.8
  ): [number, number, number] {
    this.targetVx = targetVx;
    this.targetVy = targetVy;
    this.targetVz = targetVz;
    this.vx = FishAgent.expLerp(this.vx, targetVx, smoothingRate, dt);
    this.vy = FishAgent.expLerp(this.vy, targetVy, smoothingRate, dt);
    this.vz = FishAgent.expLerp(this.vz, targetVz, smoothingRate, dt);
    return [this.vx, this.vy, this.vz];
  }

  /**
   * Sine-based smooth interpolation (S-curve lerp)
   * Smoothly accelerates and decelerates using half-cosine S-curve:
   * f(t) = a + (b - a) * (0.5 - 0.5 * cos(pi * clamp(t, 0, 1)))
   * Eliminates sudden jerky step changes in fish speed.
   */
  public static sineLerp(a: number, b: number, t: number): number {
    const clampedT = Math.max(0, Math.min(1, t));
    const sineFactor = 0.5 - 0.5 * Math.cos(Math.PI * clampedT);
    return a + (b - a) * sineFactor;
  }

  /**
   * Smoothly accelerates and decelerates fish swim speed using sine-based lerp interpolation.
   * Completely eliminates sudden step changes in velocity, creating serene, natural propulsion.
   */
  public updateSpeed(targetSpeed: number, dt: number, responsiveness = 2.2): number {
    this.targetSwimSpeed = targetSpeed;
    this.currentSwimSpeed = FishAgent.sineLerp(this.currentSwimSpeed || targetSpeed, targetSpeed, dt * responsiveness);
    return this.currentSwimSpeed;
  }

  /**
   * Updates animation speed scaling (0.1x ~ 3.0x)
   */
  public setAnimSpeed(speed: number) {
    this.animSpeed = Math.max(0.1, Math.min(3.0, speed));
  }

  /**
   * Sets the hydrodynamic phase delay multiplier for tail and fins
   */
  public setPhaseDelay(multiplier: number) {
    const mult = Math.max(0.1, Math.min(3.0, multiplier));
    this.tailPhaseDelay = 0.42 * mult;
    this.finPhaseDelay = 0.65 * mult;
    this.pecPhaseDelay = 0.85 * mult;
  }

  /**
   * Updates the spine control knots using the Spline-Interpolated 'Body Curve' Algorithm.
   * 
   * 1. Traveling S-curve undulation with Phase Delay:
   *    Each knot possesses hydrodynamic phase delay (this.tailPhaseDelay), ensuring the caudal
   *    fin trailing edge lags naturally behind the trunk rather than vibrating rigidly.
   * 
   * 2. Hydrodynamic turning curvature:
   *    When turning, the entire trunk smoothly curves into the turn arc proportionally to banking angle
   *    and yaw rate, eliminating straight-rod or toy-like stiffness.
   */
  public updateSpineKnots(tailActivity: number) {
    // Species-specific locomotion kinematics:
    let speciesWaveFreq = 2.8;
    let speciesFlexibility = 1.0;
    if (this.species === 0) {
      // Tuna / Koi: Majestic stately motion with fluid posterior wave
      speciesWaveFreq = 2.5;
      speciesFlexibility = 0.92;
    } else if (this.species === 2) {
      // Clownfish: Slightly deeper, playful S-flexion
      speciesWaveFreq = 3.0;
      speciesFlexibility = 1.15;
    } else if (this.species === 3 || this.species === 4) {
      // Angelfish / Moorish Idol: Regal gliding undulation
      speciesWaveFreq = 2.7;
      speciesFlexibility = 1.05;
    }

    const maxAmp = 0.076 * this.scale * (0.35 + 0.65 * tailActivity) * speciesFlexibility;
    const turnScale = -this.bank * 0.22 * this.scale;

    for (let i = 0; i < this.spineKnots.length; i++) {
      const knot = this.spineKnots[i];
      if (knot.s <= 0.02) {
        knot.x = 0;
        continue;
      }

      // Traveling sinusoidal wave along the spine with Phase Delay (위상 지연):
      // knot.weight * this.tailPhaseDelay introduces realistic fluid drag lag to the tail
      const wavePhase = (this.tailPhase * this.animSpeed) - (knot.s * speciesWaveFreq) - (knot.weight * this.tailPhaseDelay);
      const waveOffset = Math.sin(wavePhase) * maxAmp * knot.weight;

      // Turning body curvature: arches entire trunk into turn arc starting behind cranium (s > 0.15)
      const turnEnvelope = Math.min(1.0, Math.max(0.0, (knot.s - 0.10) / 0.30));
      const turnProfile = (0.40 * knot.s + 0.60 * knot.s * knot.s);
      const turnOffset = turnScale * (turnEnvelope * turnEnvelope * (3.0 - 2.0 * turnEnvelope)) * turnProfile;

      knot.x = waveOffset + turnOffset;
    }
  }

  /**
   * Catmull-Rom Cubic Spline evaluation of lateral spine displacement, tangent, and curvature
   * at normalized longitudinal coordinate s (s = 0.0 is snout, 1.05 is peduncle, 1.60 is fin margin).
   * Guarantees exact C^1 continuity and smooth natural S-curves throughout the entire fish body.
   */
  public evaluateSplineBodyCurve(s: number): SplineEvaluation {
    if (s <= 0.0) {
      return { x: 0, tangent: 0, curvature: 0 };
    }

    const knots = this.spineKnots;
    const n = knots.length;

    // Clamp s to maximum spline range
    const sClamped = Math.min(s, knots[n - 1].s);

    // Find knot segment [seg, seg+1] containing s
    let seg = 0;
    while (seg < n - 2 && knots[seg + 1].s < sClamped) {
      seg++;
    }

    const p0 = knots[Math.max(0, seg - 1)].x;
    const p1 = knots[seg].x;
    const p2 = knots[Math.min(n - 1, seg + 1)].x;
    const p3 = knots[Math.min(n - 1, seg + 2)].x;

    const s0 = knots[seg].s;
    const s1 = knots[Math.min(n - 1, seg + 1)].s;
    const span = Math.max(1e-4, s1 - s0);
    const t = Math.max(0.0, Math.min(1.0, (sClamped - s0) / span));

    // Catmull-Rom cubic spline basis
    const t2 = t * t;
    const t3 = t2 * t;

    const c0 = -0.5 * t3 + t2 - 0.5 * t;
    const c1 =  1.5 * t3 - 2.5 * t2 + 1.0;
    const c2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
    const c3 =  0.5 * t3 - 0.5 * t2;

    const x = c0 * p0 + c1 * p1 + c2 * p2 + c3 * p3;

    // First derivative with respect to normalized coordinate s (tangent)
    const d0 = (-1.5 * t2 + 2.0 * t - 0.5) / span;
    const d1 = ( 4.5 * t2 - 5.0 * t) / span;
    const d2 = (-4.5 * t2 + 4.0 * t + 0.5) / span;
    const d3 = ( 1.5 * t2 - 1.0 * t) / span;

    const tangent = d0 * p0 + d1 * p1 + d2 * p2 + d3 * p3;

    // Second derivative with respect to s (physical curvature)
    const dd0 = (-3.0 * t + 2.0) / (span * span);
    const dd1 = ( 9.0 * t - 5.0) / (span * span);
    const dd2 = (-9.0 * t + 4.0) / (span * span);
    const dd3 = ( 3.0 * t - 1.0) / (span * span);

    const curvature = dd0 * p0 + dd1 * p1 + dd2 * p2 + dd3 * p3;

    return { x, tangent, curvature };
  }

  /**
   * Generates 3D world space coordinates along the spline-deformed spine from rostrum to caudal tip.
   * Can be used for physics raycasting, fin skeletal tracking, or dynamic camera following.
   */
  public getSpinePositions3D(numSamples = 12): Array<{ x: number; y: number; z: number }> {
    const points: Array<{ x: number; y: number; z: number }> = [];
    const fwdX = this.dirX;
    const fwdY = this.dirY;
    const fwdZ = this.dirZ;

    // Up vector accounting for banking
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const rightLen = Math.hypot(rightX, rightZ) || 1;
    const rX = rightX / rightLen;
    const rZ = rightZ / rightLen;

    const cb = Math.cos(this.bank);
    const sb = Math.sin(this.bank);
    const rightBankX = rX * cb;
    const rightBankY = sb;
    const rightBankZ = rZ * cb;

    const bodyLength = 0.56 * this.scale;

    for (let i = 0; i < numSamples; i++) {
      const u = i / (numSamples - 1);
      const s = u * 1.60;
      const { x: lateralOffset } = this.evaluateSplineBodyCurve(s);

      // Longitudinal distance along body axis (snout forward, tail backward)
      const axialDist = (0.5 - u) * bodyLength;

      const px = this.x + fwdX * axialDist + rightBankX * lateralOffset;
      const py = this.y + fwdY * axialDist + rightBankY * lateralOffset;
      const pz = this.z + fwdZ * axialDist + rightBankZ * lateralOffset;

      points.push({ x: px, y: py, z: pz });
    }

    return points;
  }
}
