/**
 * Compute intermediate points along a humanized cursor trajectory.
 * Uses cubic ease-out to simulate authentic deceleration with subtle micro-jitter.
 */
export function computeHumanizedPoints(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  steps = 4,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const safeSteps = Math.max(1, Math.round(steps));

  for (let i = 1; i <= safeSteps; i++) {
    const t = i / safeSteps;
    // Cubic ease-out: starts with momentum and slows smoothly near the target
    const ease = 1 - Math.pow(1 - t, 3);
    const isFinal = i === safeSteps;
    const jitterX = isFinal ? 0 : Math.round((Math.random() - 0.5) * 4);
    const jitterY = isFinal ? 0 : Math.round((Math.random() - 0.5) * 4);

    const stepX = Math.round(startX + (targetX - startX) * ease + jitterX);
    const stepY = Math.round(startY + (targetY - startY) * ease + jitterY);
    points.push({ x: stepX, y: stepY });
  }

  return points;
}
