/** Keep route rendering bounded while retaining the complete route for storage. */
export function sampleRouteForRendering<T>(points: readonly T[], maxPoints = 1200): T[] {
  if (points.length <= maxPoints) return [...points];
  if (maxPoints < 2) return points.length ? [points[points.length - 1]] : [];

  const sampled: T[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    sampled.push(points[Math.round(i * step)]);
  }
  return sampled;
}
