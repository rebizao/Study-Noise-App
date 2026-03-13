import { useRef, useState, useEffect } from "react";
import { createNoiseProcessor } from "./audio/noiseGenerator";

export default function App() {
  const [playing, setPlaying] = useState(false);
  const [noiseType, setNoiseType] = useState("white");
  const [rainActive, setRainActive] = useState(false);
  const [headsetMode, setHeadsetMode] = useState(false);
  const [driftSpeed, setDriftSpeed] = useState(0.02);
  const [customSettings, setCustomSettings] = useState({
    gain: 0.15,
    hp: 300,
    lp: 1000,
    mod: 150,
    speed: 0.05,
  });

  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  
  const phaseRef = useRef(0); 
  const lastTimeRef = useRef(0);
  const driftSpeedRef = useRef(0.02); 

  const startVisualizer = () => {
    if (!audioRef.current || !canvasRef.current) return;
    
    const { analyser, ctx: audioCtx } = audioRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const currentTime = audioCtx.currentTime;
      const deltaTime = currentTime - lastTimeRef.current;
      lastTimeRef.current = currentTime;

      phaseRef.current += deltaTime * driftSpeedRef.current * Math.PI * 2;

      ctx.fillStyle = "#f9f9f9"; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * (canvas.height - 50);
        ctx.fillStyle = noiseType === "custom" ? "#007AFF" : "#444";
        ctx.fillRect(x, canvas.height - barHeight - 25, barWidth, barHeight);
        x += barWidth + 1;
      }

      const panValue = Math.sin(phaseRef.current); 
      const panPos = ((panValue + 1) / 2) * (canvas.width - 40) + 20;

      ctx.beginPath();
      ctx.arc(panPos, canvas.height - 15, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#FF9500"; 
      ctx.fill();

      ctx.font = "bold 10px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#999";
      ctx.textAlign = "left"; ctx.fillText("LOW HZ", 10, canvas.height - 5);
      ctx.textAlign = "right"; ctx.fillText("HIGH HZ", canvas.width - 10, canvas.height - 5);
    };
    draw();
  };

  const getActiveParams = (type) => {
    const presets = {
      white: { gain: customSettings.gain, hp: 350, lp: 1100, mod: 80,  speed: customSettings.speed },
      pink:  { gain: customSettings.gain, hp: 500, lp: 800,  mod: 100, speed: customSettings.speed },
      brown: { gain: customSettings.gain, hp: 250, lp: 600,  mod: 150, speed: customSettings.speed },
      custom: customSettings
    };
    return presets[type];
  };

  const active = getActiveParams(noiseType);

  function applyNoiseTuning(a, type, settings, headset, drift) {
    if (!a) return;
    const t = a.ctx.currentTime;
    const params = settings || getActiveParams(type);
    const isHeadset = headset !== undefined ? headset : headsetMode;
    const currentDrift = drift !== undefined ? drift : driftSpeed;
    
    // Volume uses setTargetAtTime for a smooth, non-clicking transition
    a.gain.gain.setTargetAtTime(params.gain, t, 0.1);
    a.highpass.frequency.setTargetAtTime(params.hp, t, 0.2);
    a.lowpass.frequency.setTargetAtTime(params.lp, t, 0.2);
    a.lfoGain.gain.setTargetAtTime(params.mod, t, 0.2);

    const ratio = isHeadset ? 0.75 : 0.92;
    a.lfoL.frequency.setTargetAtTime(params.speed, t, 0.2);
    a.lfoR.frequency.setTargetAtTime(params.speed * ratio, t, 0.2);

    a.panLfo.frequency.setTargetAtTime(currentDrift, t, 0.2);
    a.panGain.gain.setTargetAtTime(isHeadset ? 0.7 : 0.2, t, 0.5);
  }

  const handleParamChange = (key, val) => {
    const v = parseFloat(val);
    if (key === "drift") {
      setDriftSpeed(v);
      driftSpeedRef.current = v; 
      if (audioRef.current) applyNoiseTuning(audioRef.current, noiseType, active, headsetMode, v);
    } else {
      const newSettings = { ...customSettings, [key]: v };
      setCustomSettings(newSettings);
      // Now always updates if gain changes, regardless of noise type
      if (audioRef.current && (key === "speed" || key === "gain" || noiseType === "custom")) {
        applyNoiseTuning(audioRef.current, noiseType, newSettings);
      }
    }
  };

  const toggleRain = () => {
    const newState = !rainActive;
    setRainActive(newState);
    if (audioRef.current) {
      const t = audioRef.current.ctx.currentTime;
      audioRef.current.rainGain.gain.setTargetAtTime(newState ? 0.08 : 0, t, 0.5);
    }
  };

  const toggleHeadset = () => {
    const nextState = !headsetMode;
    setHeadsetMode(nextState);
    const nextDrift = nextState ? 0.05 : 0.02;
    setDriftSpeed(nextDrift);
    driftSpeedRef.current = nextDrift;
    if (audioRef.current) {
      applyNoiseTuning(audioRef.current, noiseType, active, nextState, nextDrift);
    }
  };

  async function initAudio() {
    if (audioRef.current) return audioRef.current;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const mainNoise = createNoiseProcessor(ctx);
    const rainNoise = createNoiseProcessor(ctx); 
    
    const highpass = ctx.createBiquadFilter(); highpass.type = "highpass";
    const lowpass = ctx.createBiquadFilter(); lowpass.type = "lowpass";
    const rainFilter = ctx.createBiquadFilter(); rainFilter.type = "highpass";
    rainFilter.frequency.value = 5000; 
    
    const rainGain = ctx.createGain();
    rainGain.gain.value = rainActive ? 0.08 : 0;
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0; 
    
    const panner = ctx.createStereoPanner();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;

    const lfoL = ctx.createOscillator(); const lfoR = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const panLfo = ctx.createOscillator(); const panGain = ctx.createGain();

    lfoL.connect(lfoGain); lfoR.connect(lfoGain);
    lfoGain.connect(lowpass.frequency);
    panLfo.connect(panGain); panGain.connect(panner.pan);

    mainNoise.node.connect(highpass); highpass.connect(lowpass); lowpass.connect(panner); 
    rainNoise.node.connect(rainFilter); rainFilter.connect(rainGain); rainGain.connect(panner); 

    panner.connect(masterGain); masterGain.connect(analyser); analyser.connect(ctx.destination);

    [lfoL, lfoR, panLfo].forEach(osc => osc.start());

    audioRef.current = { ctx, gain: masterGain, noise: mainNoise, rainGain, highpass, lowpass, lfoGain, lfoL, lfoR, analyser, panner, panGain, panLfo };
    applyNoiseTuning(audioRef.current, noiseType);
    
    lastTimeRef.current = ctx.currentTime;
    startVisualizer();
    return audioRef.current;
  }

  const togglePlay = async () => {
    const a = await initAudio();
    if (!playing) { await a.ctx.resume(); setPlaying(true); } 
    else { await a.ctx.suspend(); setPlaying(false); }
  };

  const changeNoise = async (type) => {
    const a = await initAudio();
    a.gain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.05);
    setTimeout(() => {
      a.noise.setType(type === 'custom' ? 'white' : type);
      setNoiseType(type);
      applyNoiseTuning(a, type);
    }, 100);
  };

  return (
    <div style={{ padding: 30, fontFamily: "system-ui", maxWidth: 450, margin: "auto" }}>
      <header style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Zen Engine</h2>
        <p style={{ fontSize: 13, color: "#666" }}>Digital Synthesizer</p>
      </header>

      <canvas ref={canvasRef} width="400" height="140" style={{ width: "100%", background: "#f9f9f9", borderRadius: 12, marginBottom: 20, border: "1px solid #eee" }} />

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button onClick={togglePlay} style={{ flex: 2, padding: 14, cursor: "pointer", fontWeight: "bold", borderRadius: 8, border: "1px solid #ccc", background: playing ? "#fff" : "#222", color: playing ? "#222" : "#fff" }}>
          {playing ? "STOP ENGINE" : "START ENGINE"}
        </button>
        <button onClick={toggleRain} style={{ flex: 1, padding: 14, cursor: "pointer", fontWeight: "bold", borderRadius: 8, border: "1px solid #ccc", background: rainActive ? "#007AFF" : "#fff", color: rainActive ? "#fff" : "#222" }}>
          RAIN
        </button>
        <button onClick={toggleHeadset} style={{ flex: 1, padding: 14, cursor: "pointer", fontWeight: "bold", borderRadius: 8, border: "1px solid #ccc", background: headsetMode ? "#FF9500" : "#fff", color: headsetMode ? "#fff" : "#222" }}>
          🎧
        </button>
      </div>

      <select value={noiseType} onChange={(e) => changeNoise(e.target.value)} style={{ width: "100%", padding: 12, borderRadius: 8, fontSize: 14, marginBottom: 20 }}>
        <option value="white">Uniform distribution (White Noise)</option>
        <option value="pink">Uniform octaves (Pink Noise)</option>
        <option value="brown">Random distribution (Brown/Red Noise)</option>
        <option value="custom">Custom</option>
      </select>

      <div style={{ padding: 20, background: "#fcfcfc", borderRadius: 12, border: "1px solid #f0f0f0" }}>
        {[
          { label: "Low-pass filter", key: "lp", unit: "Hz", min: 200, max: 3000 },
          { label: "High-pass filter", key: "hp", unit: "Hz", min: 20, max: 1200 },
          { label: "Amplitude", key: "mod", unit: "", min: 0, max: 800 },
          { label: "Stereo Drift Speed", key: "drift", unit: "Hz", min: 0.001, max: 0.2, step: 0.001 },
          { label: "Modulation Speed", key: "speed", unit: "Hz", min: 0.01, max: 2, step: 0.01 },
          { label: "Volume", key: "gain", unit: "", min: 0, max: 0.5, step: 0.01 }
        ].map((p) => {
          const isSpeed = p.key === "speed";
          const isDrift = p.key === "drift";
          const isGain = p.key === "gain"; // Master volume
          const isCustomMode = noiseType === "custom";
          
          const isSpeedLocked = isSpeed && !playing;
          const isDriftLocked = isDrift && !headsetMode;
          // VOLUME is no longer part of isPresetLocked
          const isPresetLocked = !isCustomMode && !isSpeed && !isDrift && !isGain;

          const isDisabled = isPresetLocked || isDriftLocked || isSpeedLocked;

          let val;
          if (isDrift) val = driftSpeed;
          else if (isSpeed || isGain) val = customSettings[p.key];
          else val = active[p.key];

          return (
            <div key={p.key} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: "#666" }}>{p.label}</span>
                <span style={{ 
                  fontWeight: "bold", 
                  color: isDisabled ? "#ccc" : (isDrift ? "#FF9500" : "#007AFF") 
                }}>
                  {val}{p.unit}
                </span>
              </div>
              <input 
                type="range" 
                min={p.min} 
                max={p.max} 
                step={p.step || 10} 
                value={val} 
                disabled={isDisabled} 
                onChange={(e) => handleParamChange(p.key, e.target.value)} 
                style={{ width: "100%", opacity: isDisabled ? 0.4 : 1 }} 
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}