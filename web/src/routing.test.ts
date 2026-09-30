import { describe, expect, it } from "vitest";
import { insertRoutePoint } from "./routing";

describe("route point insertion", () => {
  const source = { x: 0, y: 0 };
  const target = { x: 300, y: 0 };
  const points = [
    { x: 100, y: 0 },
    { x: 200, y: 0 },
  ];

  it.each([0, 1, 2])(
    "inserts into segment %i without reordering existing points",
    (index) => {
      const point = { x: 50 + index * 100, y: 3 };
      expect(insertRoutePoint(source, points, target, point)).toEqual([
        ...points.slice(0, index),
        point,
        ...points.slice(index),
      ]);
    },
  );

  it("follows route order when the line doubles back to the left", () => {
    const route = [
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 50, y: 100 },
    ];
    const point = { x: 125, y: 101 };
    expect(insertRoutePoint(source, route, { x: 50, y: 200 }, point)).toEqual([
      route[0],
      route[1],
      point,
      route[2],
    ]);
  });

  it("handles a route without points and coincident endpoints", () => {
    const point = { x: 20, y: 20 };
    expect(insertRoutePoint(source, [], source, point)).toEqual([point]);
  });
});
