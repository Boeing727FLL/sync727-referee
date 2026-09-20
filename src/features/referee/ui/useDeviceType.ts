import { useEffect, useState } from 'react';
import type { DeviceType } from '../types';

function detectDeviceType(): DeviceType {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPad|tablet/i.test(ua)) return 'tablet';
  return /Mobi|Android|iPhone|iPod/i.test(ua) ? 'mobile' : 'desktop';
}

export function useDeviceType() {
  const [deviceType, setDeviceType] = useState<DeviceType>(detectDeviceType);
  useEffect(() => {
    const update = () => setDeviceType(detectDeviceType());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return deviceType;
}
