// Ton + Vibration als Rückmeldung am Ziel
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Muss einmal durch eine Nutzeraktion aufgerufen werden (Browser-Vorgabe) */
export const unlockAudio = () => void audio();

function tone(freq: number, startOffset: number, duration: number, volume = 0.25) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + startOffset;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export function feedbackSuccess() {
  tone(1320, 0, 0.16);
  navigator.vibrate?.(60);
}

export function feedbackWarning() {
  tone(660, 0, 0.14);
  tone(660, 0.2, 0.14);
  navigator.vibrate?.([80, 60, 80]);
}

export function feedbackError() {
  tone(220, 0, 0.4, 0.3);
  navigator.vibrate?.([200, 80, 200]);
}
