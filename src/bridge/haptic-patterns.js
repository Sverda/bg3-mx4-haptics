const MIN_AREA_PULSES = 4;
const MAX_AREA_PULSES = 12;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hashSeed(seed) {
  const text = String(seed ?? "area-impact");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed) {
  let state = hashSeed(seed);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function pulseCountFor({ areaRadius = 0, targetCount = 0 }) {
  const radius = Number(areaRadius) || 0;
  const targets = Math.max(0, Number(targetCount) || 0);
  let radiusPulses = MIN_AREA_PULSES;

  if (radius >= 6) {
    radiusPulses = 8;
  } else if (radius >= 3) {
    radiusPulses = 6;
  }

  return clamp(Math.max(radiusPulses, targets + 2), MIN_AREA_PULSES, MAX_AREA_PULSES);
}

function collisionPool(magnitude) {
  const damage = Number(magnitude) || 0;
  if (damage >= 25) {
    return ["damp_collision", "sharp_collision", "sharp_collision", "subtle_collision"];
  }

  if (damage >= 8) {
    return ["subtle_collision", "damp_collision", "damp_collision"];
  }

  return ["subtle_collision", "subtle_collision", "damp_collision"];
}

export function createAreaPattern({
  seed,
  targetCount,
  areaRadius,
  magnitude,
  accentWaveform
}) {
  const random = seededRandom(seed);
  const pulseCount = pulseCountFor({ targetCount, areaRadius });
  const pool = collisionPool(magnitude);
  const pulses = [];

  for (let index = 0; index < pulseCount; index += 1) {
    const isAccent = index === pulseCount - 1 && accentWaveform;
    pulses.push({
      waveform: isAccent
        ? accentWaveform
        : pool[Math.floor(random() * pool.length)],
      delayMs: index === 0 ? 0 : 50 + Math.floor(random() * 51)
    });
  }

  return {
    name: "area-impact",
    pulses
  };
}

