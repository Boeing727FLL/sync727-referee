// AudioWorklet processor for the live referee microphone stream.
// Loaded as a same-origin static file (CSP-safe) via audioWorklet.addModule().
class LiveMicProc extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs && inputs[0] && inputs[0][0];
    if (ch && ch.length > 0) {
      const pcm = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        const s = Math.max(-1, Math.min(1, ch[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('live-mic-proc', LiveMicProc);
