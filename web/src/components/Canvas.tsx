import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
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
import type { Catalog, Components, Relationship } from "../types";
import "@xyflow/react/dist/style.css";

const nodeTypes = { component: ComponentNode };
interface Props {
  positions: Record<string, { x: number; y: number }>;
  onPositionsChange: Dispatch<
    SetStateAction<Record<string, { x: number; y: number }>>
  >;
  components: Components;
  catalog: Catalog;
  relationships: Relationship[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  onConnect: (connection: Connection) => void;
  onAdd: (type: string) => string;
  inspecting: boolean;
}

function Diagram(props: Props) {
  const { positions, onPositionsChange: setPositions } = props;
  const [nodes, setNodes] = useState<ComposerNode[]>([]);
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
      props.relationships.map((edge, index) => ({
        id: `${edge.kind}:${index}:${edge.source}:${edge.target}`,
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
          strokeWidth: 1.8,
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
      })),
    [props.relationships],
  );

  function onNodesChange(changes: NodeChange<ComposerNode>[]) {
    setNodes((current) => applyNodeChanges(changes, current));
    for (const change of changes) {
      if (change.type === "position" && change.position)
        setPositions((current) => ({
          ...current,
          [change.id]: change.position!,
        }));
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
        setPositions((current) => ({
          ...current,
          [name]: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        }));
      }}
    >
      <ReactFlow<ComposerNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => props.onSelect(node.id)}
        onPaneClick={() => props.onSelect(null)}
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
        <Panel position="bottom-center">
          <div className="legend">
            <span>
              <i className="reference-line" />
              Output reference
            </span>
            <span>
              <i className="association-line" />
              Managed association
            </span>
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
