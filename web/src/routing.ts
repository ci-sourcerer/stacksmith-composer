import type { DiagramPoint } from "./types";

function segmentDistanceSquared(
  point: DiagramPoint,
  start: DiagramPoint,
  end: DiagramPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared
    ? Math.max(
        0,
        Math.min(
          1,
          ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
        ),
      )
    : 0;
  return (
    (point.x - start.x - fraction * dx) ** 2 +
    (point.y - start.y - fraction * dy) ** 2
  );
}

export function insertRoutePoint(
  source: DiagramPoint,
  points: DiagramPoint[],
  target: DiagramPoint,
  point: DiagramPoint,
): DiagramPoint[] {
  const path = [source, ...points, target];
  let insertionIndex = 0;
  let nearestDistance = Infinity;
  for (let index = 0; index < path.length - 1; index++) {
    const distance = segmentDistanceSquared(
      point,
      path[index],
      path[index + 1],
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      insertionIndex = index;
    }
  }
  return [
    ...points.slice(0, insertionIndex),
    point,
    ...points.slice(insertionIndex),
  ];
}
