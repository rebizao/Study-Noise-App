import { useRef, useState, useEffect } from "react";
import { createNoiseProcessor } from "./audio/noiseGenerator";

export default function App() {
  const [playing, setPlaying] = useState(false);
  const [noiseType, setNoiseType] = useState("white");
  const [rainActive, setRainActive] = useState(false); // New state for rain
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

      ctx.fillStyle = "#f9f9f9"; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
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

  // --- NEW RAIN TOGGLE HANDLER ---
  const toggleRain = () => {
    const newState = !rainActive;
    setRainActive(newState);
    if (audioRef.current) {
      const t = audioRef.current.ctx.currentTime;
      // Fade rain in/out smoothly to avoid audio pops
      audioRef.current.rainGain.gain.setTargetAtTime(newState ? 0.08 : 0, t, 0.5);
    }
  };

  async function initAudio() {
    if (audioRef.current) return audioRef.current;

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // -------- NOISE SOURCES --------
    const mainNoise = createNoiseProcessor(ctx);
    const rainNoise = createNoiseProcessor(ctx); // Separate source for rain
    
    // -------- FILTERS & GAIN --------
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = "highpass";
    rainFilter.frequency.value = 5000; 
    
    const rainGain = ctx.createGain();
    // Use the current state to set initial rain volume
    rainGain.gain.value = rainActive ? 0.08 : 0;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0; // Starts at 0, ramps up in applyNoiseTuning
    
    const panner = ctx.createStereoPanner();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    // -------- MOVEMENT (LFOs) --------
    const lfoL = ctx.createOscillator();
    lfoL.frequency.value = 0.03; 
    const lfoGainL = ctx.createGain();
    const lfoR = ctx.createOscillator();
    lfoR.frequency.value = 0.037; 
    const lfoGainR = ctx.createGain();

    const panLfo = ctx.createOscillator();
    panLfo.frequency.value = 0.02; 
    const panGain = ctx.createGain();
    panGain.gain.value = 0.3;

    // Connect LFOs
    lfoL.connect(lfoGainL);
    lfoR.connect(lfoGainR);
    lfoGainL.connect(lowpass.frequency);
    lfoGainR.connect(lowpass.frequency);
    panLfo.connect(panGain);
    panGain.connect(panner.pan);

    // -------- THE GRAPH CONNECTIONS --------
    // Main Noise Path
    mainNoise.node.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(panner); 

    // Rain Path
    rainNoise.node.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(panner); 

    // Output Path
    panner.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);

    // Start Oscillators
    lfoL.start();
    lfoR.start();
    panLfo.start();

    // Store in Ref
    audioRef.current = { 
      ctx, 
      gain: masterGain, 
      noise: mainNoise, 
      rainGain, 
      highpass, 
      lowpass, 
      lfoGain: lfoGainL, 
      analyser, 
      panner 
    };
    
    // Critical: Apply the initial settings to the nodes
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
        style={{ width: "100%", background: "#f9f9f9", borderRadius: 12, marginBottom: 20, border: "1px solid #eee" }} 
      />

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button 
          onClick={togglePlay} 
          style={{ 
            flex: 2, padding: 14, cursor: "pointer", fontWeight: "bold",
            borderRadius: 8, border: "1px solid #ccc", background: playing ? "#fff" : "#222",
            color: playing ? "#222" : "#fff"
          }}
        >
          {playing ? "STOP ENGINE" : "START ENGINE"}
        </button>

        <button 
          onClick={toggleRain} 
          style={{ 
            flex: 1, padding: 14, cursor: "pointer", fontWeight: "bold",
            borderRadius: 8, border: "1px solid #ccc", 
            background: rainActive ? "#007AFF" : "#fff",
            color: rainActive ? "#fff" : "#222"
          }}
        >
          {rainActive ? "🌧️ RAIN" : "☁️ RAIN"}
        </button>
      </div>

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
              style={{ width: "100%", opacity: noiseType === "custom" ? 1 : 0.5 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}