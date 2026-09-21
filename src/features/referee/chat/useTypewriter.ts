import { useCallback, useEffect, useRef, useState } from 'react';
import { TYPEWRITER_TICK_MS } from '../config';

/** Owns only the visible-response clock; request streaming stays in the coordinator. */
export function useTypewriter(options: {
  ready: boolean;
  chatStarted: boolean;
  loading: boolean;
  onFinished: () => void;
}) {
  const targetRef = useRef(0);
  const [count, setCount] = useState(0);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!options.ready) return;
      setCount(previous => previous >= targetRef.current ? previous : previous + 1);
    }, TYPEWRITER_TICK_MS);
    return () => clearInterval(interval);
  }, [options.ready]);

  useEffect(() => {
    if (options.loading) {
      setCount(0);
      targetRef.current = 0;
    }
  }, [options.loading]);

  useEffect(() => {
    if (options.chatStarted && options.ready) {
      setCount(0);
      targetRef.current = 0;
    }
  }, [options.chatStarted, options.ready]);

  useEffect(() => {
    const done = options.ready && targetRef.current > 0 && count >= targetRef.current;
    if (rendering && (!options.ready || done)) {
      setRendering(false);
      options.onFinished();
    }
  }, [count, options.ready, rendering, options.onFinished]);

  return {
    count,
    rendering,
    setRendering,
    targetRef,
    // Stop: reveal everything already received at once and end the animation.
    finish: useCallback(() => {
      setCount(targetRef.current);
      setRendering(false);
    }, []),
  };
}
