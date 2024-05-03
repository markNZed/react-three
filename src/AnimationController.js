import React, { useEffect } from 'react';
import useStore from './useStore';

export function AnimationController({ children }) {

  const { setInitialAnimationState, updateAnimationState } = useStore(state => ({
    setInitialAnimationState: state.setInitialAnimationState,
    updateAnimationState: state.updateAnimationState
  }));

  useEffect(() => {

    const timeouts = [];

    // Initial setup for animation states
    setInitialAnimationState({
      'emergent1.Circle': { duration: 1, variant: "visible" },
    });

    const animate = (id, delay, newState) => {
      const timeout = setTimeout(() => {
        updateAnimationState(id, newState);
      }, delay);
      timeouts.push(timeout);
    };

    // Example animations for different spheres
    animate('emergent1.Sphere1', 1000, { scale: 2 });
    animate('emergent1.Circle',  2000, { radius: 4 });
    animate('emergent2.Circle',  2000, { variant: "visible" });
    animate('emergent1.Sphere2', 2000, { scale: 1.5 });
    animate('emergent1.Sphere3', 3000, { scale: 0.8 });

    return () => {
      timeouts.forEach(clearTimeout);  // Clear all timeouts
    };
  }, [updateAnimationState]);

  return <>{children}</>;
}