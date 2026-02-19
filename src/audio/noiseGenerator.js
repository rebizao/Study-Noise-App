export function createNoiseProcessor(ctx) {
  const bufferSize = 4096;
  // Note: ScriptProcessor is legacy, but works for PoC. 
  // For production, AudioWorklet is the "pro" way.
  const node = ctx.createScriptProcessor(bufferSize, 1, 1);

  let noiseType = "white";
  let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0; // Pink state
  let lastOut = 0; // Brown state

  node.onaudioprocess = (e) => {
    const out = e.outputBuffer.getChannelData(0);

    for (let i = 0; i < out.length; i++) {
      const white = Math.random() * 2 - 1;

      if (noiseType === "white") {
        // White is naturally 1.0 amplitude. 
        // We cap it at 0.2 here so it doesn't hurt.
        out[i] = white * 0.2; 
      } 
      else if (noiseType === "pink") {
        // Refined Voss-McCartney for a "softer" curve
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.15;
        b6 = white * 0.115926;
      } 
      else if (noiseType === "brown") {
        // A "softer" brownian motion (Integrator)
        // This creates a much deeper, smoother roll-off
        lastOut = (lastOut + (0.02 * white)) / 1.02;
        out[i] = lastOut * 3.5; 
      }
    }
  };

  return {
    node,
    setType: (type) => { noiseType = type; }
  };
}