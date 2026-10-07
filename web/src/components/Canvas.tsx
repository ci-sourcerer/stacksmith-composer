import { useEffect, useMemo, useRef, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type NodeChange,
} from "@xyflow/react";
import { ComponentNode, type ComposerNode } from "./ComponentNode";
import { RoutedEdge, type RoutedEdgeDefinition } from "./RoutedEdge";
import {
  automaticRoute,
  orthogonalRoute,
  insertRoutePoint,
  routeLabelPosition,
} from "../routing";
import { relationshipKey } from "../model";
import { GRID_SIZE, initialPosition, snapPoint } from "../layout";
import type {
  Catalog,
  Components,
  DiagramPoint,
  DiagramRoute,
  Relationship,
} from "../types";
import "@xyflow/react/dist/style.css";

const nodeTypes = { component: ComponentNode };
const edgeTypes = { route: RoutedEdge };
interface Props {
  positions: Record<string, { x: number; y: number }>;
  routes: DiagramRoute[];
  onLabelPositionChange: (
    relationship: Relationship,
    point: DiagramPoint,
    record: boolean,
  ) => void;
  onPositionChange: (
    name: string,
    position: { x: number; y: number },
    record: boolean,
  ) => void;
  onRouteChange: (
    relationship: Relationship,
    points: DiagramPoint[],
    record: boolean,
  ) => void;
  components: Components;
  catalog: Catalog;
  relationships: Relationship[];
  selected: string | null;
  selectedRelationship: string | null;
  onSelect: (name: string | null) => void;
  onSelectRelationship: (relationship: string | null) => void;
  onConnect: (connection: Connection) => void;
  onAdd: (type: string) => string;
  inspecting: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

function Diagram(props: Props) {
  const { positions } = props;
  const [nodes, setNodes] = useState<ComposerNode[]>([]);
  const [hiddenLabels, setHiddenLabels] = useState<Set<string>>(new Set());
  const dragging = useRef(new Set<string>());
  const { screenToFlowPosition, getInternalNode } = useReactFlow();
  useEffect(() => {
    setNodes(
      Object.entries(props.components).map(([name, component], index) => ({
        id: name,
        type: "component",
        position: snapPoint(positions[name] ?? initialPosition(index)),
        selected: props.selected === name,
        data: {
          name,
          type: component.type,
          definition: props.catalog[component.type] ?? {
            display_name: component.type,
            module_source: "",
            module_version: "",
            inputs: [],
            outputs: [],
          },
        },
      })),
    );
  }, [props.components, props.catalog, props.selected, positions]);

  const edges = useMemo<RoutedEdgeDefinition[]>(
    () =>
      props.relationships.map((relationship) => ({
        id: relationshipKey(relationship),
        source: relationship.source,
        target: relationship.target,
        sourceHandle: `out:${relationship.output}`,
        targetHandle: `in:${relationship.property}`,
        type: "route" as const,
        label:
          relationship.kind === "association"
            ? relationship.rule
            : `${relationship.output} → ${relationship.path.join(".")}`,
        style: {
          stroke: relationship.kind === "association" ? "#9d7d46" : "#3d8076",
          strokeWidth:
            props.selectedRelationship === relationshipKey(relationship)
              ? 3.4
              : 1.8,
          strokeDasharray:
            relationship.kind === "association" ? "5 5" : undefined,
        },
        labelStyle: {
          fill: relationship.kind === "association" ? "#806334" : "#25645a",
          fontSize: 10,
          fontWeight: 600,
        },
        labelBgStyle: { fill: "#fafaf6", fillOpacity: 0.95 },
        labelBgPadding: [7, 4],
        deletable: false,
        data: {
          relationship,
          labelHidden: hiddenLabels.has(relationshipKey(relationship)),
          labelPosition: props.routes.find(
            (route) => relationshipKey(route) === relationshipKey(relationship),
          )?.label_position,
          onLabelChange: (point: DiagramPoint, record: boolean) =>
            props.onLabelPositionChange(relationship, point, record),
          points:
            props.routes.find(
              (route) =>
                relationshipKey(route) === relationshipKey(relationship),
            )?.points ?? [],
          onChange: (points: DiagramPoint[], record: boolean) =>
            props.onRouteChange(relationship, points, record),
        },
        selected: props.selectedRelationship === relationshipKey(relationship),
      })),
    [
      props.relationships,
      props.routes,
      props.selectedRelationship,
      props.onRouteChange,
      props.onLabelPositionChange,
      hiddenLabels,
    ],
  );

  function onNodesChange(changes: NodeChange<ComposerNode>[]) {
    setNodes((current) => applyNodeChanges(changes, current));
    for (const change of changes) {
      if (change.type !== "position" || !change.position) continue;
      const alreadyDragging = dragging.current.has(change.id);
      props.onPositionChange(change.id, change.position, !alreadyDragging);
      if (change.dragging) dragging.current.add(change.id);
      else dragging.current.delete(change.id);
    }
  }

  function addRoutingPoint() {
    const relationship = props.relationships.find(
      (candidate) => relationshipKey(candidate) === props.selectedRelationship,
    );
    if (!relationship) return;
    const route = props.routes.find(
      (candidate) =>
        relationshipKey(candidate) === relationshipKey(relationship),
    );
    const source = getInternalNode(relationship.source);
    const target = getInternalNode(relationship.target);
    const sourceHandle = source?.internals.handleBounds?.source?.find(
      (handle) => handle.id === `out:${relationship.output}`,
    );
    const targetHandle = target?.internals.handleBounds?.target?.find(
      (handle) => handle.id === `in:${relationship.property}`,
    );
    if (!source || !target || !sourceHandle || !targetHandle) return;
    const start = {
      x:
        source.internals.positionAbsolute.x +
        sourceHandle.x +
        sourceHandle.width,
      y:
        source.internals.positionAbsolute.y +
        sourceHandle.y +
        sourceHandle.height / 2,
    };
    const end = {
      x: target.internals.positionAbsolute.x + targetHandle.x,
      y:
        target.internals.positionAbsolute.y +
        targetHandle.y +
        targetHandle.height / 2,
    };
    const completePath = route?.points.length
      ? orthogonalRoute(start, route.points, end)
      : automaticRoute(
          start,
          end,
          nodes.map((node) => ({
            ...node.position,
            width: node.measured?.width ?? 232,
            height: node.measured?.height ?? 120,
          })),
        );
    props.onRouteChange(
      relationship,
      insertRoutePoint(
        start,
        completePath.slice(1, -1),
        end,
        routeLabelPosition(completePath),
      ),
      true,
    );
  }

  return (
    <div
      className="canvas"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const type = event.dataTransfer.getData(
          "application/stacksmith-component",
        );
        if (!Object.hasOwn(props.catalog, type)) return;
        const name = props.onAdd(type);
        props.onPositionChange(
          name,
          screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          false,
        );
      }}
    >
      <ReactFlow<ComposerNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => {
          props.onSelectRelationship(null);
          props.onSelect(node.id);
        }}
        onEdgeClick={(_, edge) => {
          props.onSelect(null);
          props.onSelectRelationship(edge.id);
        }}
        onPaneClick={() => {
          props.onSelect(null);
          props.onSelectRelationship(null);
        }}
        onConnect={props.onConnect}
        snapToGrid
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        edgesReconnectable={false}
        deleteKeyCode={null}
        fitView
        minZoom={0.35}
        maxZoom={1.6}
        defaultViewport={{ x: 10, y: 20, zoom: 0.85 }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={GRID_SIZE}
          size={1}
          color="#d6d9d0"
        />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor="#b4c6bb"
          maskColor="var(--minimap-mask, rgba(243,244,238,0.7))"
        />
        <Panel position="top-left">
          <div className="canvas-label">
            <span
              className={props.inspecting ? "status-dot pending" : "status-dot"}
            />
            {props.inspecting ? "Inspecting draft…" : "Component diagram"}
            <span>{nodes.length} components</span>
          </div>
        </Panel>
        <Panel position="top-right">
          <div className="canvas-history" aria-label="Draft history">
            <button
              className="icon-button"
              aria-label="Undo"
              title="Undo (⌘Z / Ctrl+Z)"
              disabled={!props.canUndo}
              onClick={props.onUndo}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Redo"
              title="Redo (⌘⇧Z / Ctrl+Y)"
              disabled={!props.canRedo}
              onClick={props.onRedo}
            >
              <Redo2 size={16} />
            </button>
          </div>
        </Panel>
      </ReactFlow>
      <div className="canvas-legend">
        <div
          className={`legend ${props.selectedRelationship ? "has-selection" : ""}`}
        >
          <span>
            <i className="reference-line" />
            Output reference
          </span>
          <span>
            <i className="association-line" />
            Managed association
          </span>
          <em>Double-click a line to add a routing point</em>
          {props.selectedRelationship && (
            <>
              <button className="route-add-button" onClick={addRoutingPoint}>
                + Add routing point
              </button>
              <button
                className="route-add-button"
                onClick={() =>
                  setHiddenLabels((current) => {
                    const next = new Set(current);
                    if (next.has(props.selectedRelationship!))
                      next.delete(props.selectedRelationship!);
                    else next.add(props.selectedRelationship!);
                    return next;
                  })
                }
              >
                {hiddenLabels.has(props.selectedRelationship)
                  ? "Show label"
                  : "Hide label"}
              </button>
              <button
                className="route-add-button"
                disabled={
                  !props.routes.some(
                    (route) =>
                      relationshipKey(route) === props.selectedRelationship,
                  )
                }
                onClick={() => {
                  const relationship = props.relationships.find(
                    (candidate) =>
                      relationshipKey(candidate) === props.selectedRelationship,
                  );
                  if (relationship) props.onRouteChange(relationship, [], true);
                }}
              >
                Reset routing
              </button>
              <strong>Drag points · Double-click a point to remove it</strong>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Diagram {...props} />
    </ReactFlowProvider>
  );
}
