'use strict';

/**
 * Spring physics utility for organic, Google-style animations.
 */
export const Spring = (() => {
  /**
   * Animates a value using spring physics.
   * @param {Object} opts
   * @param {number} opts.from - Start value
   * @param {number} opts.to - Target value
   * @param {number} [opts.stiffness=180] - Spring stiffness
   * @param {number} [opts.damping=25] - Spring damping
   * @param {number} [opts.mass=1] - Mass
   * @param {function(number)} opts.onUpdate - Callback with current value
   * @param {function()} [opts.onComplete] - Complete callback
   */
  function animate({ from, to, stiffness = 180, damping = 25, mass = 1, onUpdate, onComplete }) {
    let position = from;
    let velocity = 0;
    let lastTime = performance.now();
    let frameId = null;

    function loop(now) {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Spring force: F = -k * x
      const springForce = -stiffness * (position - to);
      // Damping force: F = -c * v
      const dampingForce = -damping * velocity;
      // Acceleration: a = F / m
      const acceleration = (springForce + dampingForce) / mass;

      velocity += acceleration * dt;
      position += velocity * dt;

      onUpdate(position);

      // Check if settled
      if (Math.abs(position - to) < 0.1 && Math.abs(velocity) < 0.1) {
        onUpdate(to);
        if (onComplete) onComplete();
        return;
      }

      frameId = requestAnimationFrame(loop);
    }

    frameId = requestAnimationFrame(loop);

    return {
      stop: () => {
        if (frameId) {
          cancelAnimationFrame(frameId);
          frameId = null;
        }
      }
    };
  }

  return { animate };
})();
