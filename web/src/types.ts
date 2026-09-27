export interface ComponentDefinition {
  type: string;
  description?: string;
  tags?: string[];
  disabled_associations?: string[];
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface Port {
  name: string;
  description?: string;
}
export interface ComponentType {
  display_name: string;
  module_source: string;
  module_version: string;
  tags?: string[];
  inputs: Port[];
  outputs?: Port[];
}
export type Catalog = Record<string, ComponentType>;
export type Components = Record<string, ComponentDefinition>;
export interface StackDocument {
  name: string;
  description?: string;
  components?: Components;
  disabled_associations?: string[];
  depends_on?: string[];
}
export interface Snapshot {
  snapshot: string;
  source: string;
  path: string;
  repository: string | null;
  branch: string;
  head: string | null;
  editable: boolean;
  reason: string | null;
  document: StackDocument | null;
}
export interface Relationship {
  source: string;
  target: string;
  output: string;
  property: string;
  path: (string | number)[];
  kind: "reference" | "association";
  rule: string | null;
}
export interface AssociationRule {
  name: string;
  description?: string;
  status: string;
  reason: string | null;
}
export interface Review {
  source: string;
  diff: string;
  edges: Relationship[];
  validation: string;
  associations: { rules: AssociationRule[] };
}
export interface Platform {
  description: string;
  source: string;
  scope: string;
  backend: { kind: string; type: string | null };
  tools: Record<string, { version?: string }>;
  providers: { name: string; instances: string[] }[];
  policies: { name: string; description: string; kind: string }[];
  associations: { name: string; description: string }[];
  required_input_sets: string[];
  has_default_mapping: boolean;
}
export interface Repository {
  name: string;
  description?: string;
  writable: boolean;
}
export interface Session {
  mode: "demo" | "github";
  login: string | null;
}
