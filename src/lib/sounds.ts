const playAudioFile = (url: string, resolveEarlyBy: number = 0): Promise<boolean> => {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    let resolved = false;

    const handleResolve = (success: boolean) => {
      if (!resolved) {
        resolved = true;
        resolve(success);
      }
    };

    audio.onended = () => handleResolve(true);
    audio.onerror = () => handleResolve(false);

    if (resolveEarlyBy > 0) {
      audio.addEventListener('timeupdate', () => {
        if (audio.duration && audio.currentTime >= audio.duration - resolveEarlyBy) {
          handleResolve(true);
        }
      });
    }

    audio.play().catch(() => handleResolve(false));
  });
};

export const playStartSound = async (): Promise<void> => {
  // Try to play the official MP3 file first, resolve 1.5 seconds before it ends
  const played = await playAudioFile('/start.mp3', 1.5);
  if (played) return;

  // Fallback to synthesized sound
  return new Promise((resolve) => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) {
        resolve();
        return;
      }
      
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      // Helper to play a beep
      const playBeep = (time: number, freq: number, type: 'square' | 'sine' = 'sine') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        gain.gain.setValueAtTime(0.1, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        osc.stop(time + 0.1);
      };

      // Faster intervals (0.7s)
      const interval = 0.7;

      // Play beeps for 3-2-1
      playBeep(now, 440); // 3
      playBeep(now + interval, 440); // 2
      playBeep(now + interval * 2, 440); // 1
      
      // "LEGO!" sound (High pitch charge)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(600, now + interval * 3);
      osc.frequency.exponentialRampToValueAtTime(1200, now + interval * 3 + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + interval * 3);
      gain.gain.setValueAtTime(0.1, now + interval * 3);
      gain.gain.exponentialRampToValueAtTime(0.001, now + interval * 3 + 0.5);
      osc.stop(now + interval * 3 + 0.5);

      // TTS
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const say = (text: string, delay: number) => {
          setTimeout(() => {
            const u = new SpeechSynthesisUtterance(text);
            u.rate = 1.5; // Faster rate
            u.pitch = 1.2;
            u.lang = 'en-US';
            window.speechSynthesis.speak(u);
          }, delay);
        };
        say("Three", 0);
        say("Two", interval * 1000);
        say("One", interval * 2 * 1000);
        say("Lego!", interval * 3 * 1000);
      }

      // Resolve after the sequence finishes
      setTimeout(() => {
        resolve();
      }, (interval * 3 * 1000) + 500);

    } catch (e) {
      console.error("Error playing start sound:", e);
      resolve();
    }
  });
};

export const play30SecSound = async () => {
  // Try to play the official MP3 file first
  const played = await playAudioFile('/30sec.mp3');
  if (played) return;

  // Fallback to synthesized sound
  try {
    // ... existing fallback
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance("Thirty seconds!");
      u.rate = 1.1;
      u.pitch = 1.1;
      u.lang = 'en-US';
      window.speechSynthesis.speak(u);
    }

    // Warning sound
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.linearRampToValueAtTime(100, now + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.5);
    osc.stop(now + 0.5);
  } catch (e) {
    console.error("Error playing 30s sound:", e);
  }
};

export const playEndSound = async () => {
  // Try to play the official MP3 file first
  const played = await playAudioFile('/end.mp3');
  if (played) return;

  // Fallback to synthesized sound
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Buzzer
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, now);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 1.5); // Sustain
    gain.gain.linearRampToValueAtTime(0, now + 2.0); // Fade out
    osc.stop(now + 2.0);
    
    // TTS
    if ('speechSynthesis' in window) {
      setTimeout(() => {
        const u = new SpeechSynthesisUtterance("Time's up!");
        u.rate = 1.0;
        u.lang = 'en-US';
        window.speechSynthesis.speak(u);
      }, 500);
    }
  } catch (e) {
    console.error("Error playing end sound:", e);
  }
};
