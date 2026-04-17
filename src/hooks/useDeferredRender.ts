import { useState, useEffect } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Returns false on the first frame, then true once all pending interactions
 * (navigation animations, gestures) have completed. Stays true permanently
 * after the first interaction resolves — only blocks heavy renders on initial
 * mount, never on subsequent tab switches.
 */
export function useDeferredRender(): boolean {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });
    return () => task.cancel();
  }, []);

  return isReady;
}
