/**
 * Physics-based Marine Steering Behavior & Locomotion Dynamics
 * 
 * Provides:
 * 1. Rotational inertia & strict angular velocity limits (prevents instantaneous snaps and jerky turns)
 * 2. Spherical linear interpolation (SLERP) for direction vectors along geodesics
 * 3. Proactive lookahead boundary avoidance (prevents sudden rebounding on lagoon edges)
 * 4. Anisotropic hydrodynamic drag (low axial friction, high lateral resistance)
 * 5. Coordinated hydrodynamic banking roll
 */

/**
 * Rotates a 3D unit direction vector towards a target unit vector,
 * strictly bounded by a maximum angular displacement (maxAngleDelta = maxAngularVelocity * dt).
 * Uses spherical interpolation on the unit sphere S^2.
 */
export function constrainAngularVelocity(
  curX: number,
  curY: number,
  curZ: number,
  targetX: number,
  targetY: number,
  targetZ: number,
  maxAngleDelta: number
): [number, number, number] {
  // Dot product between current and target heading
  const dot = curX * targetX + curY * targetY + curZ * targetZ;
  const cosTheta = Math.max(-1.0, Math.min(1.0, dot));

  // Already aligned within tolerance
  if (cosTheta > 0.99995) {
    return [targetX, targetY, targetZ];
  }

  // Handle exact or near opposite direction (180 degree flip)
  // Instead of passing through zero or snapping, pick an orthogonal axis to turn smoothly
  if (cosTheta < -0.99995) {
    // Choose perpendicular axis to rotate around
    let perpX = -curY;
    let perpY = curX;
    let perpZ = 0;
    if (Math.hypot(perpX, perpY) < 0.01) {
      perpX = 0;
      perpY = -curZ;
      perpZ = curY;
    }
    const pLen = Math.hypot(perpX, perpY, perpZ) || 1.0;
    perpX /= pLen;
    perpY /= pLen;
    perpZ /= pLen;

    // Rotate cur by maxAngleDelta around perp axis
    const sinA = Math.sin(maxAngleDelta);
    const cosA = Math.cos(maxAngleDelta);
    // Rodrigues formula on perpendicular:
    // v_rot = cur * cosA + (perp x cur) * sinA
    const crossX = perpY * curZ - perpZ * curY;
    const crossY = perpZ * curX - perpX * curZ;
    const crossZ = perpX * curY - perpY * curX;

    const resX = curX * cosA + crossX * sinA;
    const resY = curY * cosA + crossY * sinA;
    const resZ = curZ * cosA + crossZ * sinA;
    const rLen = Math.hypot(resX, resY, resZ) || 1.0;
    return [resX / rLen, resY / rLen, resZ / rLen];
  }

  const theta = Math.acos(cosTheta);

  // If angle is smaller than allowed maximum in this frame, reach target directly
  if (theta <= maxAngleDelta) {
    return [targetX, targetY, targetZ];
  }

  // SLERP on the unit sphere
  const fraction = maxAngleDelta / theta;
  const sinTheta = Math.sin(theta);
  const a = Math.sin((1.0 - fraction) * theta) / sinTheta;
  const b = Math.sin(fraction * theta) / sinTheta;

  const resX = a * curX + b * targetX;
  const resY = a * curY + b * targetY;
  const resZ = a * curZ + b * targetZ;
  const rLen = Math.hypot(resX, resY, resZ) || 1.0;

  return [resX / rLen, resY / rLen, resZ / rLen];
}

/**
 * Forward lookahead proactive boundary steering.
 * Instead of reacting only after crossing the boundary, inspects a future position ahead of the agent.
 * Gently applies a curving force before collision occurs.
 */
export function computeBoundarySteering(
  posX: number,
  posY: number,
  posZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  speed: number,
  radialBound: number,
  minY: number,
  maxY: number,
  lookaheadSec = 0.8
): [number, number, number] {
  const probeDist = Math.max(0.25, speed * lookaheadSec);
  const futureX = posX + dirX * probeDist;
  const futureZ = posZ + dirZ * probeDist;
  const futureDist = Math.hypot(futureX, futureZ);

  let steerX = 0;
  let steerY = 0;
  let steerZ = 0;

  const warningRadius = radialBound * 0.78;
  if (futureDist > warningRadius) {
    const excess = (futureDist - warningRadius) / (radialBound - warningRadius + 0.05);
    const weight = Math.min(3.5, excess * excess * 3.2);

    // Centripetal inward force
    const toCenterX = -futureX / futureDist;
    const toCenterZ = -futureZ / futureDist;

    // Tangential skimming force to curve along the boundary naturally with continuous tanh smoothing
    const tangX = -toCenterZ;
    const tangZ = toCenterX;
    const dotTang = dirX * tangX + dirZ * tangZ;
    const smoothTangSign = Math.tanh(dotTang * 6.0);

    steerX += (toCenterX * 0.80 + tangX * smoothTangSign * 0.40) * weight;
    steerZ += (toCenterZ * 0.80 + tangZ * smoothTangSign * 0.40) * weight;
  }

  // Vertical boundary lookahead
  const futureY = posY + dirY * probeDist;
  if (futureY > maxY) {
    steerY -= (futureY - maxY) * 4.5;
  } else if (futureY < minY) {
    steerY += (minY - futureY) * 4.5;
  }

  return [steerX, steerY, steerZ];
}

/**
 * Applies realistic anisotropic hydrodynamic drag and forward propulsion.
 * Streamlined bodies have low drag parallel to their heading (axial),
 * but very high drag perpendicular to their heading (lateral).
 */
export function applyHydrodynamicLocomotion(
  vx: number,
  vy: number,
  vz: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  targetSpeed: number,
  axialDrag: number,
  lateralDrag: number,
  dt: number
): [number, number, number] {
  // Project velocity onto forward heading
  const vFwd = vx * dirX + vy * dirY + vz * dirZ;

  // Lateral velocity vector (slippage / drift)
  const vLatX = vx - vFwd * dirX;
  const vLatY = vy - vFwd * dirY;
  const vLatZ = vz - vFwd * dirZ;

  // Axial acceleration towards target cruise speed
  const fwdSmoothing = 1.0 - Math.exp(-axialDrag * dt);
  const newVFwd = vFwd + (targetSpeed - vFwd) * fwdSmoothing;

  // Heavy lateral hydrodynamic damping (acts like a keel / fin resisting sideslip)
  const latDamping = Math.exp(-lateralDrag * dt);
  const newVLatX = vLatX * latDamping;
  const newVLatY = vLatY * latDamping;
  const newVLatZ = vLatZ * latDamping;

  return [
    newVFwd * dirX + newVLatX,
    newVFwd * dirY + newVLatY,
    newVFwd * dirZ + newVLatZ,
  ];
}

export interface AquaticObstacle {
  x: number;
  z: number;
  radius: number;
  stemRadius?: number;
  x2?: number;
  z2?: number;
}

/**
 * Distance from point (px, pz) to 2D line segment (ax, az)-(bx, bz)
 */
function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): { dist: number; nx: number; nz: number } {
  const bax = bx - ax;
  const baz = bz - az;
  const pax = px - ax;
  const paz = pz - az;
  const lenSq = bax * bax + baz * baz;
  const t = lenSq > 1e-6 ? Math.max(0, Math.min(1, (pax * bax + paz * baz) / lenSq)) : 0;
  const projX = ax + t * bax;
  const projZ = az + t * baz;
  const dx = px - projX;
  const dz = pz - projZ;
  const dist = Math.hypot(dx, dz);
  const nLen = dist > 1e-5 ? dist : 1.0;
  return { dist, nx: dx / nLen, nz: dz / nLen };
}

/**
 * Proactive obstacle avoidance for aquatic vegetation, water lily pads, submerged stems, and sunken bogwood logs.
 * Employs dynamic forward cone probes and computes gentle tangential deflection forces
 * so fish smoothly swerve around obstacles without jarring stop-and-reverse motions.
 */
export function computeAquaticObstacleAvoidance(
  posX: number,
  posY: number,
  posZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  speed: number,
  obstacles: AquaticObstacle[],
  lookaheadDist = 0.65
): [number, number, number] {
  let steerX = 0;
  let steerY = 0;
  let steerZ = 0;

  const probeX = posX + dirX * lookaheadDist;
  const probeZ = posZ + dirZ * lookaheadDist;

  for (let k = 0; k < obstacles.length; k++) {
    const obs = obstacles[k];
    let dist = 0;
    let probeDist = 0;
    let nx = 0;
    let nz = 0;

    if (obs.x2 !== undefined && obs.z2 !== undefined) {
      // Segment obstacle (sunken bogwood logs)
      const resCurrent = distToSegment(posX, posZ, obs.x, obs.z, obs.x2, obs.z2);
      const resProbe = distToSegment(probeX, probeZ, obs.x, obs.z, obs.x2, obs.z2);
      dist = resCurrent.dist;
      probeDist = resProbe.dist;
      nx = resCurrent.nx;
      nz = resCurrent.nz;
    } else {
      // Point/cylinder obstacle (lily stems, boulders)
      const dx = posX - obs.x;
      const dz = posZ - obs.z;
      dist = Math.hypot(dx, dz);
      const probeDx = probeX - obs.x;
      const probeDz = probeZ - obs.z;
      probeDist = Math.hypot(probeDx, probeDz);
      const normLen = dist > 1e-5 ? dist : 1.0;
      nx = dx / normLen;
      nz = dz / normLen;
    }

    const safeRadius = obs.radius * 1.15 + 0.18;

    if (dist < safeRadius || probeDist < safeRadius) {
      const effectiveDist = Math.min(dist, probeDist);
      const urgency = Math.max(0, (safeRadius - effectiveDist) / safeRadius);
      const forceMag = urgency * urgency * 4.2;

      // Tangential vector to skim around smoothly
      const tx = -nz;
      const tz = nx;

      // Continuous smooth tangential deflection without hard sign flips
      const dotTang = dirX * tx + dirZ * tz;
      const smoothTangSign = Math.tanh(dotTang * 8.0);

      // Blend radial repulsion and tangential flow smoothly
      steerX += (nx * 0.75 + tx * smoothTangSign * 0.55) * forceMag;
      steerZ += (nz * 0.75 + tz * smoothTangSign * 0.55) * forceMag;

      // If close to surface under a floating lily pad (y > -0.28), gently bias downward into water column
      if (posY > -0.28 && dist < obs.radius) {
        steerY -= 1.6 * urgency;
      }
    }
  }

  return [steerX, steerY, steerZ];
}

/**
 * Terrain-aware pathfinding and moss bed navigation.
 * Fish probe the pond floor ahead along their velocity vector,
 * steering laterally into deeper channels away from shallow rocky shelves,
 * submerged stepping stones, or shoreline banks, and maintaining a biological
 * gliding altitude above velvety moss mounds.
 */
export function computeTerrainAwarePathfinding(
  posX: number,
  posY: number,
  posZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  speed: number,
  getFloorDepth: (x: number, z: number) => number,
  waterDepth: number,
  preferredAltitude = 0.35 // cruising distance above floor
): [number, number, number] {
  let steerX = 0;
  let steerY = 0;
  let steerZ = 0;

  // Current floor depth (negative Y)
  const currentBedY = -getFloorDepth(posX, posZ) * (waterDepth / 1.6);
  const currentAltitude = posY - currentBedY;

  // Forward lookahead probe
  const lookaheadDist = Math.max(0.35, speed * 0.75);
  const fwdX = posX + dirX * lookaheadDist;
  const fwdZ = posZ + dirZ * lookaheadDist;
  const fwdBedY = -getFloorDepth(fwdX, fwdZ) * (waterDepth / 1.6);

  // Lateral probes to find deeper channel (valley pathfinding)
  const leftX = posX - dirZ * 0.35;
  const leftZ = posZ + dirX * 0.35;
  const rightX = posX + dirZ * 0.35;
  const rightZ = posZ - dirX * 0.35;
  const leftBedY = -getFloorDepth(leftX, leftZ) * (waterDepth / 1.6);
  const rightBedY = -getFloorDepth(rightX, rightZ) * (waterDepth / 1.6);

  // If forward bed rises steeply (collision risk with stepping stone or shallow bank)
  const bedRise = fwdBedY - currentBedY; // positive if bed is rising up towards surface
  if (bedRise > 0.05 || posY - fwdBedY < 0.24) {
    const danger = Math.min(2.5, Math.max(0.0, 0.26 - (posY - fwdBedY)) * 10.0);
    // Smooth continuous channel steering based on bed depth gradient (no discrete left/right if-else flip)
    const bedGrad = Math.tanh((leftBedY - rightBedY) * 12.0); // positive if right is shallower (so steer left)
    steerX += (-dirZ) * bedGrad * Math.max(0.6, danger);
    steerZ += (dirX) * bedGrad * Math.max(0.6, danger);
    // Pitch upward slightly to avoid grazing stone tops
    steerY += Math.max(0.4, danger * 0.5);
  }

  // Vertical altitude keeping above moss bed:
  // If too close to moss bed, lift up gently; if too high in water column, drift down towards cruising depth
  const altDiff = preferredAltitude - currentAltitude;
  if (altDiff > 0) {
    // Too close to bed (< preferredAltitude)
    steerY += Math.min(2.5, altDiff * 5.0);
  } else if (currentAltitude > preferredAltitude + 0.35 && posY > -0.30) {
    // Too close to surface, steer down
    steerY -= 1.2;
  }

  return [steerX, steerY, steerZ];
}
