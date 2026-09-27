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
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import { ComponentNode, type ComposerNode } from "./ComponentNode";
import { relationshipKey } from "../model";
import type { Catalog, Components, Relationship } from "../types";
import "@xyflow/react/dist/style.css";

const nodeTypes = { component: ComponentNode };
interface Props {
  positions: Record<string, { x: number; y: number }>;
  onPositionChange: (
    name: string,
    position: { x: number; y: number },
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
  const dragging = useRef(new Set<string>());
  const { screenToFlowPosition } = useReactFlow();
  useEffect(() => {
    setNodes(
      Object.entries(props.components).map(([name, component], index) => ({
        id: name,
        type: "component",
        position: positions[name] ?? {
          x: (index % 3) * 330 + 50,
          y: Math.floor(index / 3) * 330 + (index % 2) * 85 + 50,
        },
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

  const edges = useMemo<Edge[]>(
    () =>
      props.relationships.map((edge) => ({
        id: relationshipKey(edge),
        source: edge.source,
        target: edge.target,
        sourceHandle: `out:${edge.output}`,
        targetHandle: `in:${edge.property}`,
        type: "smoothstep",
        label:
          edge.kind === "association"
            ? edge.rule
            : `${edge.output} → ${edge.path.join(".")}`,
        style: {
          stroke: edge.kind === "association" ? "#9d7d46" : "#3d8076",
          strokeWidth:
            props.selectedRelationship === relationshipKey(edge) ? 3.4 : 1.8,
          strokeDasharray: edge.kind === "association" ? "5 5" : undefined,
        },
        labelStyle: {
          fill: edge.kind === "association" ? "#806334" : "#25645a",
          fontSize: 10,
          fontWeight: 600,
        },
        labelBgStyle: { fill: "#fafaf6", fillOpacity: 0.95 },
        labelBgPadding: [7, 4],
        deletable: false,
        selected: props.selectedRelationship === relationshipKey(edge),
      })),
    [props.relationships, props.selectedRelationship],
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
        edgesReconnectable={false}
        deleteKeyCode={null}
        fitView
        minZoom={0.35}
        maxZoom={1.6}
        defaultViewport={{ x: 10, y: 20, zoom: 0.85 }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="#d6d9d0"
        />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor="#b4c6bb"
          maskColor="rgba(243,244,238,0.7)"
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
        <Panel position="bottom-center">
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
            {props.selectedRelationship && (
              <strong>Selected · Delete to remove</strong>
            )}
          </div>
        </Panel>
      </ReactFlow>
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
