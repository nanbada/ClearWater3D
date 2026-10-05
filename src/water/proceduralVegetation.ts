import { AquaticObstacle } from './steering';

/**
 * Procedural Aquatic Vegetation & Lotus Ecosystem Generator
 * Creates dynamic, naturalistic distributions of water lily pads, lotus leaves,
 * blooming flowers, submerged stalks, Hornwort, Vallisneria, and sunken bogwood.
 */

export interface ProceduralPad {
  x: number;
  z: number;
  radius: number;
  cleftAngle: number;
  flowerType: number; // 0: None, 1: Rose-Magenta Lotus, 2: Pure White Jade Lotus, 3: Golden Bud
  flowerScale: number;
  rootX: number;
  rootZ: number;
  stemRadius: number;
  elevation: number; // 0.0: Floating on surface, > 0: Emergent lotus leaf
}

export interface ProceduralPlantCluster {
  x: number;
  z: number;
  type: number; // 0: Hornwort (붕어마름), 1: Vallisneria (나사말)
  radius: number;
  height: number;
}

export interface ProceduralSunkenLog {
  x: number;
  z: number;
  x2: number;
  z2: number;
  radius: number;
  stemRadius: number;
}

export interface ProceduralEcosystem {
  seed: number;
  density: 'sparse' | 'natural' | 'lush' | 'sanctuary';
  pads: ProceduralPad[];
  plants: ProceduralPlantCluster[];
  logs: ProceduralSunkenLog[];
  steppingStones: AquaticObstacle[];
  obstacles: AquaticObstacle[];
  // Packed Float32 arrays for WebGL uniforms
  uLilyData: Float32Array; // 16 * 4: [x, z, radius, cleftAngle]
  uLilyMeta: Float32Array; // 16 * 4: [flowerType, flowerScale, rootX, rootZ]
  uLilyCount: number;
  uPlantData: Float32Array; // 12 * 4: [x, z, type, radius]
  uPlantCount: number;
}

/**
 * Deterministic Pseudo-Random Number Generator (Mulberry32)
 */
function createPRNG(seed: number) {
  let s = Math.floor(seed) >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a complete procedural aquatic ecosystem
 */
export function generateProceduralEcosystem(
  seed = 42,
  density: 'sparse' | 'natural' | 'lush' | 'sanctuary' = 'natural',
  flowerBloomRate = 0.55,
  waterDistFn?: (x: number, z: number) => number
): ProceduralEcosystem {
  const rand = createPRNG(seed);

  // Target counts based on density
  let targetPadCount = 12;
  let targetPlantCount = 8;
  let clusterCentersCount = 3;

  if (density === 'sparse') {
    targetPadCount = 8;
    targetPlantCount = 5;
    clusterCentersCount = 2;
  } else if (density === 'natural') {
    targetPadCount = 12;
    targetPlantCount = 8;
    clusterCentersCount = 3;
  } else if (density === 'lush') {
    targetPadCount = 15;
    targetPlantCount = 11;
    clusterCentersCount = 4;
  } else if (density === 'sanctuary') {
    targetPadCount = 16;
    targetPlantCount = 12;
    clusterCentersCount = 5;
    flowerBloomRate = Math.max(0.75, flowerBloomRate);
  }

  // 1. Naturalistic Cluster Centers for Water Lilies placed in tranquil garden pond coves & eddies
  const clusterLocations = [
    { x: -1.25, z: -1.85 }, // South-West tranquil bay
    { x: -0.65, z: -3.15 }, // Central pond peaceful eddy
    { x:  0.55, z: -3.65 }, // Eastern cove margin
    { x: -1.65, z: -4.75 }, // North-West stream entrance cove
    { x:  1.35, z: -5.35 }, // North-East calm water inlet
    { x: -2.35, z: -2.85 }, // West mossy shore margin
  ];

  const clusterCenters: Array<{ x: number; z: number; padCount: number }> = [];
  const selectedIndices = [0, 1, 2, 3, 4, 5];
  for (let ci = 0; ci < clusterCentersCount; ci++) {
    const loc = clusterLocations[ci % clusterLocations.length];
    const jx = (rand() - 0.5) * 0.35;
    const jz = (rand() - 0.5) * 0.35;
    clusterCenters.push({
      x: loc.x + jx,
      z: loc.z + jz,
      padCount: Math.ceil(targetPadCount / clusterCentersCount),
    });
  }

  // 2. Generate Water Lily & Lotus Leaves (Intelligent Natural Distribution)
  const pads: ProceduralPad[] = [];
  let generatedPads = 0;

  for (let ci = 0; ci < clusterCenters.length && generatedPads < targetPadCount; ci++) {
    const center = clusterCenters[ci];
    const padsInCluster = Math.min(center.padCount, targetPadCount - generatedPads);

    for (let pi = 0; pi < padsInCluster; pi++) {
      // Natural organic fanning around cluster center
      const spreadAng = (pi / padsInCluster) * Math.PI * 2 + (rand() - 0.5) * 0.8;
      const spreadDist = 0.20 + rand() * 0.45;
      let px = center.x + Math.cos(spreadAng) * spreadDist;
      let pz = center.z + Math.sin(spreadAng) * spreadDist;

      // Validate position against pond water boundary
      if (waterDistFn) {
        const dW = waterDistFn(px, pz);
        if (dW > -0.28) {
          // Gently pull towards cluster center if near shore
          px = center.x * 0.70 + px * 0.30;
          pz = center.z * 0.70 + pz * 0.30;
        }
      }

      // Avoid stepping stones path along eastern shore (x: 0.65 ~ 1.75, z: -0.15 ~ -4.7)
      if (px > 0.55 && px < 1.95 && pz > -4.8 && pz < -0.1) {
        px -= 0.55; // Nudge west into open water
      }

      // Realistic pad radius: 0.22m to 0.35m
      const radius = 0.22 + rand() * 0.13;

      // Cleft angle points naturally away from cluster core
      const cleftAngle = spreadAng + Math.PI + (rand() - 0.5) * 0.45;

      // Determine blooming flower
      let flowerType = 0;
      const isBlooming = rand() < flowerBloomRate;
      if (isBlooming) {
        // Alternate between Nelumbo Rose-Magenta Lotus (1) and Pure White Jade Lotus (2)
        flowerType = (rand() > 0.45) ? 1 : 2;
      }
      const flowerScale = 0.38 + rand() * 0.14;

      // Root anchor on pond floor: slightly displaced from surface pad for hydrodynamic curve
      const rootOffsetAng = rand() * Math.PI * 2;
      const rootOffsetDist = 0.08 + rand() * 0.16;
      const rootX = px + Math.cos(rootOffsetAng) * rootOffsetDist;
      const rootZ = pz + Math.sin(rootOffsetAng) * rootOffsetDist;

      // Emergent lotus leaf (Nelumbo) vs floating pad (Nymphaea)
      const isEmergent = rand() > 0.72;
      const elevation = isEmergent ? (0.04 + rand() * 0.08) : 0.0;

      pads.push({
        x: px,
        z: pz,
        radius,
        cleftAngle,
        flowerType,
        flowerScale,
        rootX,
        rootZ,
        stemRadius: 0.024 + rand() * 0.008,
        elevation,
      });

      generatedPads++;
    }
  }

  // 3. Generate Submerged Aquatic Plants (붕어마름 & 나사말)
  const plants: ProceduralPlantCluster[] = [];
  for (let pi = 0; pi < targetPlantCount; pi++) {
    const ang = (pi / targetPlantCount) * Math.PI * 2 + (rand() - 0.5) * 0.75;
    const dist = 0.75 + rand() * 1.35;
    const px = Math.cos(ang) * dist;
    const pz = Math.sin(ang) * dist - 0.3;
    const type = (pi % 2 === 0) ? 0 : 1; // 0: Hornwort, 1: Vallisneria
    const radius = (type === 0) ? (0.07 + rand() * 0.03) : (0.08 + rand() * 0.04);
    const height = 0.55 + rand() * 0.28;

    plants.push({
      x: px,
      z: pz,
      type,
      radius,
      height,
    });
  }

  // 4. Sunken Bogwood Driftwood Logs (침수 고목 유목)
  const logs: ProceduralSunkenLog[] = [
    {
      x: -0.85 + (rand() - 0.5) * 0.15,
      z: -1.65 + (rand() - 0.5) * 0.15,
      x2: -0.10 + (rand() - 0.5) * 0.15,
      z2: -1.15 + (rand() - 0.5) * 0.15,
      radius: 0.18,
      stemRadius: 0.14,
    },
    {
      x: 0.25 + (rand() - 0.5) * 0.15,
      z: -1.75 + (rand() - 0.5) * 0.15,
      x2: 0.85 + (rand() - 0.5) * 0.15,
      z2: -1.25 + (rand() - 0.5) * 0.15,
      radius: 0.16,
      stemRadius: 0.13,
    },
    {
      x: -0.45 + (rand() - 0.5) * 0.10,
      z: -1.35 + (rand() - 0.5) * 0.10,
      x2: -0.35 + (rand() - 0.5) * 0.10,
      z2: -1.02 + (rand() - 0.5) * 0.10,
      radius: 0.12,
      stemRadius: 0.11,
    },
  ];

  // 5. Submerged Stepping Stone Boulders (바닥 자연석 징검다리)
  const steppingStones: AquaticObstacle[] = [
    { x: 0.45, z: -1.05, radius: 0.25, stemRadius: 0.20 },
    { x: -0.65, z: -1.05, radius: 0.26, stemRadius: 0.22 },
  ];

  // 6. Build Comprehensive Physical Collision Obstacles for Fish Simulation
  // Every stem, log, stone, and plant cluster acts as a physical obstacle
  const obstacles: AquaticObstacle[] = [];

  // Lily & lotus stems
  for (const pad of pads) {
    obstacles.push({
      x: pad.x,
      z: pad.z,
      radius: pad.radius, // Pad avoidance radius
      stemRadius: pad.stemRadius * 3.5, // Physical hard stalk obstacle radius (~0.09m)
    });
  }

  // Sunken logs
  for (const log of logs) {
    obstacles.push({
      x: log.x,
      z: log.z,
      x2: log.x2,
      z2: log.z2,
      radius: log.radius,
      stemRadius: log.stemRadius,
    });
  }

  // Stepping stones
  for (const stone of steppingStones) {
    obstacles.push(stone);
  }

  // 7. Pack into WebGL uniform buffers
  const MAX_PADS = 16;
  const uLilyData = new Float32Array(MAX_PADS * 4);
  const uLilyMeta = new Float32Array(MAX_PADS * 4);
  const activePadCount = Math.min(MAX_PADS, pads.length);

  for (let i = 0; i < activePadCount; i++) {
    const pad = pads[i];
    const off = i * 4;
    uLilyData[off] = pad.x;
    uLilyData[off + 1] = pad.z;
    uLilyData[off + 2] = pad.radius;
    uLilyData[off + 3] = pad.cleftAngle;

    uLilyMeta[off] = pad.flowerType;
    uLilyMeta[off + 1] = pad.flowerScale;
    uLilyMeta[off + 2] = pad.rootX;
    uLilyMeta[off + 3] = pad.rootZ;
  }

  const MAX_PLANTS = 12;
  const uPlantData = new Float32Array(MAX_PLANTS * 4);
  const activePlantCount = Math.min(MAX_PLANTS, plants.length);

  for (let i = 0; i < activePlantCount; i++) {
    const plant = plants[i];
    const off = i * 4;
    uPlantData[off] = plant.x;
    uPlantData[off + 1] = plant.z;
    uPlantData[off + 2] = plant.type;
    uPlantData[off + 3] = plant.radius;
  }

  return {
    seed,
    density,
    pads,
    plants,
    logs,
    steppingStones,
    obstacles,
    uLilyData,
    uLilyMeta,
    uLilyCount: activePadCount,
    uPlantData,
    uPlantCount: activePlantCount,
  };
}
