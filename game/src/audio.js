// Sound, synthesized live with WebAudio: no audio files, no network. An engine hum that follows
// the car's speed, a two-tone siren while the player is wanted, and one-shot blips for pickups,
// crashes, gunshots, punches and mission jingles. The context starts on the first user gesture;
// every call before that is a no-op, so the title screen stays silent until the player acts.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, duration, type, volume, slideTo) {
    if (!ensure() || muted) return;
    try {
      const osc = context.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume || 0.2, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(context.currentTime + duration + 0.02);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  function noise(duration, volume, filterFreq) {
    if (!ensure() || muted) return;
    try {
      const len = Math.floor(context.sampleRate * duration);
      const buffer = context.createBuffer(1, len, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = context.createGain();
      gain.gain.value = volume || 0.3;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  return {
    /** Call on any user gesture: unlocks the context. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** Called every frame: engine pitch follows the car, the siren wails while wanted. */
    update(dt, speed, wanted) {
      if (!context || muted) {
        if (engineGain) engineGain.gain.value = 0;
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      if (engineOsc && engineGain) {
        const target = speed > 10 ? 0.05 + Math.min(0.12, Math.abs(speed) / 520 * 0.12) : 0;
        engineGain.gain.setTargetAtTime(target, context.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(55 + Math.abs(speed) / 520 * 130, context.currentTime, 0.1);
      }
      if (sirenOsc && sirenGain) {
        if (wanted > 0) {
          sirenTimer -= dt;
          if (sirenTimer <= 0) {
            sirenTimer = 0.42;
            sirenHigh = !sirenHigh;
            sirenOsc.frequency.setTargetAtTime(sirenHigh ? 880 : 660, context.currentTime, 0.05);
          }
          sirenGain.gain.setTargetAtTime(0.045, context.currentTime, 0.1);
        } else {
          sirenGain.gain.setTargetAtTime(0, context.currentTime, 0.1);
        }
      }
    },
    pickup() {
      blip(660, 0.12, 'sine', 0.25, 990);
    },
    crash() {
      noise(0.25, 0.35, 900);
    },
    shot() {
      noise(0.12, 0.3, 2400);
    },
    punch() {
      noise(0.09, 0.25, 500);
    },
    star() {
      blip(520, 0.18, 'square', 0.12, 780);
    },
    mission() {
      blip(523, 0.12, 'sine', 0.22);
      setTimeout(() => blip(659, 0.12, 'sine', 0.22), 110);
      setTimeout(() => blip(784, 0.22, 'sine', 0.24), 220);
    },
    busted() {
      blip(392, 0.3, 'square', 0.18, 262);
    },
  };
}
