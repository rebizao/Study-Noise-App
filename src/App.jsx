import { useRef, useState, useEffect } from "react";
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
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  // --- VISUALIZER DRAW LOOP ---
  const startVisualizer = () => {
    if (!audioRef.current || !canvasRef.current) return;
    
    const analyser = audioRef.current.analyser;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      // Clean Canvas
      ctx.fillStyle = "#f9f9f9"; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw Wave
      ctx.lineWidth = 2;
      ctx.strokeStyle = noiseType === "custom" ? "#007AFF" : "#444";
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    draw();
  };

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

  function applyNoiseTuning(a, type, settings) {
    if (!a) return;
    const t = a.ctx.currentTime;
    const params = settings || getActiveParams(type);
    
    a.gain.gain.setTargetAtTime(params.gain, t, 0.2);
    a.highpass.frequency.setTargetAtTime(params.hp, t, 0.2);
    a.lowpass.frequency.setTargetAtTime(params.lp, t, 0.2);
    a.lfoGain.gain.setTargetAtTime(params.mod, t, 0.2);
  }

  const handleParamChange = (key, val) => {
    const newSettings = { ...customSettings, [key]: parseFloat(val) };
    setCustomSettings(newSettings);
    if (audioRef.current && noiseType === "custom") {
      applyNoiseTuning(audioRef.current, "custom", newSettings);
    }
  };

  async function initAudio() {
    if (audioRef.current) return audioRef.current;

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.value = 0;

    const noise = createNoiseProcessor(ctx);
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.connect(lfoGain);
    lfoGain.connect(lowpass.frequency);
    lfo.start();

    noise.node.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);

    audioRef.current = { ctx, gain, noise, highpass, lowpass, lfoGain, analyser };
    applyNoiseTuning(audioRef.current, noiseType);
    
    startVisualizer();
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
    a.gain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.05);
    setTimeout(() => {
      a.noise.setType(type === 'custom' ? 'white' : type);
      applyNoiseTuning(a, type);
      setNoiseType(type);
    }, 100);
  }

  return (
    <div style={{ padding: 30, fontFamily: "system-ui", maxWidth: 450, margin: "auto" }}>
      <header style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Zen Engine</h2>
        <p style={{ fontSize: 13, color: "#666" }}>Live Procedural Soundscape</p>
      </header>

      <canvas 
        ref={canvasRef} 
        width="400" 
        height="120" 
        style={{ 
          width: "100%", background: "#f9f9f9", borderRadius: 12, marginBottom: 20,
          border: "1px solid #eee" 
        }} 
      />

      <button 
        onClick={togglePlay} 
        style={{ 
          width: "100%", padding: 14, cursor: "pointer", fontWeight: "bold",
          borderRadius: 8, border: "1px solid #ccc", background: playing ? "#fff" : "#222",
          color: playing ? "#222" : "#fff"
        }}
      >
        {playing ? "STOP ENGINE" : "START ENGINE"}
      </button>

      <div style={{ marginTop: 25 }}>
        <select 
          value={noiseType} 
          onChange={(e) => changeNoise(e.target.value)} 
          style={{ width: "100%", padding: 12, borderRadius: 8, fontSize: 14 }}
        >
          <option value="white">White Noise (Air)</option>
          <option value="pink">Pink Noise (Rain)</option>
          <option value="brown">Brown Noise (Ocean)</option>
          <option value="custom">🛠️ Custom Lab</option>
        </select>
      </div>

      <div style={{ marginTop: 20, padding: 20, background: "#fcfcfc", borderRadius: 12, border: "1px solid #f0f0f0" }}>
        {[
          { label: "Muffle (Low-pass)", key: "lp", unit: "Hz", min: 200, max: 3000 },
          { label: "Thinness (High-pass)", key: "hp", unit: "Hz", min: 20, max: 1200 },
          { label: "Ocean Sweep (Mod)", key: "mod", unit: "", min: 0, max: 800 },
          { label: "Volume", key: "gain", unit: "", min: 0, max: 0.5, step: 0.01 }
        ].map((p) => (
          <div key={p.key} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: "#666" }}>{p.label}</span>
              <span style={{ fontWeight: "bold", color: noiseType === "custom" ? "#007AFF" : "#333" }}>
                {active[p.key]}{p.unit}
              </span>
            </div>
            <input 
              type="range" min={p.min} max={p.max} step={p.step || 10}
              value={active[p.key]} 
              disabled={noiseType !== "custom"}
              onChange={(e) => handleParamChange(p.key, e.target.value)}
              style={{ 
                width: "100%", 
                opacity: noiseType === "custom" ? 1 : 0.5,
                cursor: noiseType === "custom" ? "pointer" : "default" 
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}