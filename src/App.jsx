import { useRef, useState } from "react";
import { createNoiseProcessor } from "./audio/noiseGenerator";

export default function App() {
  const [playing, setPlaying] = useState(false);
  const [noiseType, setNoiseType] = useState("white");
  const [customSettings, setCustomSettings] = useState({
    gain: 0.15,
    hp: 300,
    lp: 1000,
    mod: 150,
  });

  const audioRef = useRef(null);

  // 1. HELPER: Get active values based on type
  const getActiveParams = (type) => {
    const presets = {
      white: { gain: 0.12, hp: 350, lp: 1100, mod: 80 },
      pink:  { gain: 0.12, hp: 500, lp: 800,  mod: 100 },
      brown: { gain: 0.25, hp: 250, lp: 600,  mod: 150 },
      custom: customSettings
    };
    return presets[type];
  };

  const active = getActiveParams(noiseType);

  // 2. AUDIO LOGIC: Update the hardware nodes
  function applyNoiseTuning(a, type, settings) {
    if (!a) return;
    const t = a.ctx.currentTime;
    const transition = 0.2;
    const params = settings || getActiveParams(type);

    a.gain.gain.setTargetAtTime(params.gain, t, transition);
    a.highpass.frequency.setTargetAtTime(params.hp, t, transition);
    a.lowpass.frequency.setTargetAtTime(params.lp, t, transition);
    a.lfoGain.gain.setTargetAtTime(params.mod, t, transition);
  }

  // 3. HANDLER: Slider movement
  const handleParamChange = (key, val) => {
    const newSettings = { ...customSettings, [key]: parseFloat(val) };
    setCustomSettings(newSettings);
    if (audioRef.current && noiseType === "custom") {
      applyNoiseTuning(audioRef.current, "custom", newSettings);
    }
  };

  // 4. INITIALIZE: Create the Web Audio graph
  async function initAudio() {
    if (audioRef.current) return audioRef.current;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();

    const gain = ctx.createGain();
    gain.gain.value = 0; 

    const noise = createNoiseProcessor(ctx);

    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";

    const notch = ctx.createBiquadFilter();
    notch.type = "peaking";
    notch.frequency.value = 1200;
    notch.gain.value = -6;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -30;
    comp.ratio.value = 12;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.03;
    const lfoGain = ctx.createGain();
    lfo.connect(lfoGain);
    lfoGain.connect(lowpass.frequency);
    lfo.start();

    const ampLfo = ctx.createOscillator();
    ampLfo.type = "sine";
    ampLfo.frequency.value = 0.02;
    const ampLfoGain = ctx.createGain();
    ampLfoGain.gain.value = 0.05;
    ampLfo.connect(ampLfoGain);
    ampLfoGain.connect(gain.gain);
    ampLfo.start();

    noise.node.connect(highpass);
    highpass.connect(notch);
    notch.connect(lowpass);
    lowpass.connect(comp);
    comp.connect(gain);
    gain.connect(ctx.destination);

    audioRef.current = { ctx, gain, noise, highpass, notch, lowpass, lfoGain };
    
    // Set initial sound state
    applyNoiseTuning(audioRef.current, noiseType);
    
    return audioRef.current;
  }

  // 5. HANDLER: Play/Pause
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

  // 6. HANDLER: Change Noise Type
  async function changeNoise(type) {
    const a = await initAudio();
    const now = a.ctx.currentTime;

    // Fade out
    a.gain.gain.setTargetAtTime(0, now, 0.05);

    setTimeout(() => {
      // Custom mode uses the white noise generator as a base
      a.noise.setType(type === 'custom' ? 'white' : type);
      applyNoiseTuning(a, type);
      setNoiseType(type);
    }, 100);
  }

  return (
    <div style={{ padding: 30, fontFamily: "system-ui", maxWidth: 450, color: "#333" }}>
      <h2 style={{ margin: 0 }}>Zen Engine</h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>Procedural Audio Focus Tool</p>

      <button onClick={togglePlay} style={{ width: "100%", padding: "12px", cursor: "pointer" }}>
        {playing ? "PAUSE" : "PLAY"}
      </button>

      <div style={{ marginTop: 20 }}>
        <select value={noiseType} onChange={(e) => changeNoise(e.target.value)} style={{ width: "100%", padding: "10px" }}>
          <option value="white">White Noise</option>
          <option value="pink">Pink Noise</option>
          <option value="brown">Brown Noise</option>
          <option value="custom">🛠️ Custom Mode</option>
        </select>
      </div>

      <div style={{ marginTop: 20, padding: 20, background: "#f9f9f9", borderRadius: 12 }}>
        {[
          { label: "Muffle (Low-pass)", key: "lp", unit: "Hz", min: 200, max: 3000 },
          { label: "Thinness (High-pass)", key: "hp", unit: "Hz", min: 20, max: 1200 },
          { label: "Ocean Sweep (Mod)", key: "mod", unit: "", min: 0, max: 800 },
          { label: "Volume", key: "gain", unit: "", min: 0, max: 0.5, step: 0.01 }
        ].map((p) => (
          <div key={p.key} style={{ marginBottom: 15 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>{p.label}</span>
              <span>{active[p.key]}{p.unit}</span>
            </div>
            <input 
              type="range" min={p.min} max={p.max} step={p.step || 10}
              value={active[p.key]} 
              disabled={noiseType !== "custom"}
              onChange={(e) => handleParamChange(p.key, e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}