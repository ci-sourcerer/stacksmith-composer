import {
  BaseEdge,
  getSmoothStepPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { useEffect, useState } from "react";
import type { DiagramPoint, Relationship } from "../types";
import { insertRoutePoint } from "../routing";

export interface RoutedEdgeData extends Record<string, unknown> {
  relationship: Relationship;
  points: DiagramPoint[];
  onChange: (points: DiagramPoint[], record: boolean) => void;
}

export type RoutedEdgeDefinition = Edge<RoutedEdgeData, "route">;

function routedPath(points: DiagramPoint[]): string {
  return points
    .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
    .join(" ");
}

function pathMidpoint(points: DiagramPoint[]): DiagramPoint {
  const lengths = points
    .slice(1)
    .map((point, index) =>
      Math.hypot(point.x - points[index].x, point.y - points[index].y),
    );
  const halfway = lengths.reduce((sum, length) => sum + length, 0) / 2;
  let traveled = 0;
  for (let index = 0; index < lengths.length; index++) {
    if (traveled + lengths[index] >= halfway) {
      const amount = lengths[index] ? (halfway - traveled) / lengths[index] : 0;
      return {
        x: points[index].x + amount * (points[index + 1].x - points[index].x),
        y: points[index].y + amount * (points[index + 1].y - points[index].y),
      };
    }
    traveled += lengths[index];
  }
  return points.at(-1) ?? { x: 0, y: 0 };
}

export function RoutedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  style,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  markerStart,
  markerEnd,
  interactionWidth,
}: EdgeProps<RoutedEdgeDefinition>) {
  const { screenToFlowPosition } = useReactFlow();
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const points = data?.points ?? [];
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const completePath = [source, ...points, target];
  const [defaultPath, defaultLabelX, defaultLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const midpoint = pathMidpoint(completePath);
  const edgePath = points.length ? routedPath(completePath) : defaultPath;
  useEffect(() => {
    if (!selected || (selectedPoint !== null && selectedPoint >= points.length))
      setSelectedPoint(null);
  }, [points.length, selected, selectedPoint]);

  function beginDrag(
    event: React.PointerEvent<SVGCircleElement>,
    index: number,
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    setSelectedPoint(index);
    let firstMove = true;
    const move = (pointerEvent: PointerEvent) => {
      data?.onChange(
        points.map((point, pointIndex) =>
          pointIndex === index
            ? screenToFlowPosition({
                x: pointerEvent.clientX,
                y: pointerEvent.clientY,
              })
            : point,
        ),
        firstMove,
      );
      firstMove = false;
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  }

  return (
    <g
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        data?.onChange(
          insertRoutePoint(
            source,
            points,
            target,
            screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          ),
          true,
        );
      }}
    >
      <BaseEdge
        id={id}
        path={edgePath}
        labelX={points.length ? midpoint.x : defaultLabelX}
        labelY={points.length ? midpoint.y : defaultLabelY}
        style={style}
        label={label}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
      />
      {selected &&
        points.map((point, index) => (
          <circle
            className={`route-point nodrag nopan ${
              selectedPoint === index ? "is-selected" : ""
            }`}
            cx={point.x}
            cy={point.y}
            r={7}
            key={index}
            role="button"
            aria-label={`Route point ${index + 1}`}
            aria-pressed={selectedPoint === index}
            data-keyboard-owner="true"
            tabIndex={0}
            onPointerDown={(event) => beginDrag(event, index)}
            onClick={(event) => {
              event.stopPropagation();
              event.currentTarget.focus();
              setSelectedPoint(index);
            }}
            onFocus={() => setSelectedPoint(index)}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setSelectedPoint(null);
              data?.onChange(
                points.filter((_, pointIndex) => pointIndex !== index),
                true,
              );
            }}
            onKeyDown={(event) => {
              if (event.key !== "Backspace" && event.key !== "Delete") return;
              event.preventDefault();
              event.stopPropagation();
              setSelectedPoint(null);
              data?.onChange(
                points.filter((_, pointIndex) => pointIndex !== index),
                true,
              );
            }}
          />
        ))}
    </g>
  );
}
