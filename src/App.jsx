import { useRef, useState } from "react";
import { createNoiseProcessor } from "./audio/noiseGenerator";

export default function App() {
  const [playing, setPlaying] = useState(false);
  const [noiseType, setNoiseType] = useState("white");

  const audioRef = useRef(null);

  // Per-noise tuning (white = much softer / less sharp)
  function applyNoiseTuning(a, type) {
    const t = a.ctx.currentTime;
    const transition = 0.8; 

    if (type === "white") {
      // Current "Good" baseline
      a.gain.gain.setTargetAtTime(0.12, t, transition); 
      a.highpass.frequency.setTargetAtTime(350, t, transition);
      a.lowpass.frequency.setTargetAtTime(1100, t, transition);
      a.lowpass.Q.setTargetAtTime(0.4, t, transition); 
      a.lfoGain.gain.setTargetAtTime(80, t, transition);
    } 
    else if (type === "pink") {
      // PINK ZEN: Needs to be much quieter than you'd think
      a.gain.gain.setTargetAtTime(0.12, t, transition); // Keep this same as White
      a.highpass.frequency.setTargetAtTime(500, t, transition); // Cut more lows to remove "thump"
      a.lowpass.frequency.setTargetAtTime(800, t, transition);  // Very tight window for a soft "shhh"
      a.lowpass.Q.setTargetAtTime(0.3, t, transition);
      a.lfoGain.gain.setTargetAtTime(100, t, transition);
    }
    else if (type === "brown") {
      // BROWN: This was way too loud. Let's make it a distant rumble.
      a.gain.gain.setTargetAtTime(0.25, t, transition); // Dropped from 0.65
      a.highpass.frequency.setTargetAtTime(250, t, transition); // Raised from 30
      a.lowpass.frequency.setTargetAtTime(600, t, transition); // Much darker
      a.lowpass.Q.setTargetAtTime(0.3, t, transition);
      a.lfoGain.gain.setTargetAtTime(150, t, transition);
    }
  }

  async function initAudio() {
    if (audioRef.current) return audioRef.current;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();

    // -------- MASTER GAIN --------
    const gain = ctx.createGain();
    gain.gain.value = 0; // Start at 0, applyNoiseTuning will ramp it up

    // -------- NOISE SOURCE --------
    const noise = createNoiseProcessor(ctx);

    // -------- FILTER CHAIN --------
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 80;

    const notch = ctx.createBiquadFilter();
    notch.type = "peaking";
    notch.frequency.value = 1200;
    notch.Q.value = 1.0;
    notch.gain.value = -6;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1000;
    lowpass.Q.value = 0.7;

    // -------- DYNAMICS --------
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -30; // Slightly deeper compression for Zen
    comp.knee.value = 30;
    comp.ratio.value = 12; // Tighter control over peaks
    comp.attack.value = 0.003;
    comp.release.value = 0.25;

    // -------- TONE MOVEMENT (LFO 1: Timbre) --------
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.03; // Very slow filter movement

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 400;

    lfo.connect(lfoGain);
    lfoGain.connect(lowpass.frequency);
    lfo.start();

    // -------- AMPLITUDE DRIFT (LFO 2: The Magic Breathe) --------
    const ampLfo = ctx.createOscillator();
    ampLfo.type = "sine";
    ampLfo.frequency.value = 0.02; // One breath every 50 seconds

    const ampLfoGain = ctx.createGain();
    ampLfoGain.gain.value = 0.05; // 5% volume drift up and down

    ampLfo.connect(ampLfoGain);
    ampLfoGain.connect(gain.gain); // Controls the final volume node
    ampLfo.start();

    // -------- CONNECT GRAPH --------
    // noise -> highpass -> notch -> lowpass -> compressor -> gain -> destination
    noise.node.connect(highpass);
    highpass.connect(notch);
    notch.connect(lowpass);
    lowpass.connect(comp);
    comp.connect(gain);
    gain.connect(ctx.destination);

    audioRef.current = {
      ctx,
      gain,
      noise,
      highpass,
      notch,
      lowpass,
      comp,
      lfo,
      lfoGain,
      ampLfo,
      ampLfoGain
    };

    // Apply initial Zen tuning
    applyNoiseTuning(audioRef.current, "white");

    return audioRef.current;
  }

  async function togglePlay() {
    const a = await initAudio();

    if (!playing) {
      await a.ctx.resume();
      setPlaying(true);
    } else {
      await a.ctx.suspend();
      setPlaying(false);
    }
  }

  async function changeNoise(type) {
    const a = await initAudio();
    const now = a.ctx.currentTime;

    // 1. Smoothly fade out the current volume to avoid clicks
    a.gain.gain.setTargetAtTime(0, now, 0.05);

    setTimeout(() => {
      // 2. Change the internal math generator
      a.noise.setType(type);
      
      // 3. Apply the specific Zen tuning for this type
      applyNoiseTuning(a, type);
      
      setNoiseType(type);
    }, 100); // 100ms delay gives the fade-out time to work
  }

  return (
    <div style={{ padding: 30, fontFamily: "system-ui" }}>
      <h2>Study Noise App (PoC)</h2>

      <button onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>

      <div style={{ marginTop: 20 }}>
        <select value={noiseType} onChange={(e) => changeNoise(e.target.value)}>
          <option value="white">White Noise</option>
          <option value="pink">Pink Noise</option>
          <option value="brown">Brown Noise</option>
        </select>
      </div>

      <p style={{ marginTop: 14, color: "#666", fontSize: 13 }}>
        Tip: if white is still too sharp, try lowering the white lowpass to ~2500
        or increasing notch dip to -8.
      </p>
    </div>
  );
}
