export const WAVEFORMS = Object.freeze([
  "sharp_collision",
  "sharp_state_change",
  "knock",
  "damp_collision",
  "mad",
  "ringing",
  "subtle_collision",
  "completed",
  "jingle",
  "damp_state_change",
  "firework",
  "happy_alert",
  "wave",
  "angry_alert",
  "square"
]);

export function waveformIndex(waveform) {
  if (Number.isInteger(waveform)) {
    if (waveform < 0 || waveform >= WAVEFORMS.length) {
      throw new RangeError(`Waveform index must be between 0 and ${WAVEFORMS.length - 1}.`);
    }

    return waveform;
  }

  const index = WAVEFORMS.indexOf(waveform);
  if (index === -1) {
    throw new RangeError(`Unknown waveform: ${waveform}`);
  }

  return index;
}
