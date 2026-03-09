import type { DocNode } from "$lib/api";

export type FlatDocNode = {
  node: DocNode;
  depth: number;
};

export function countDocs(nodes: DocNode[]): number {
  return nodes.reduce((count, node) => {
    if (node.kind === "doc") return count + 1;
    return count + countDocs(node.children);
  }, 0);
}

export function flattenDocNodes(
  nodes: DocNode[],
  expanded: Set<string>,
  depth = 0,
): FlatDocNode[] {
  const items: FlatDocNode[] = [];

  for (const node of nodes) {
    items.push({ node, depth });
    if (node.kind !== "doc" && expanded.has(node.node_path)) {
      items.push(...flattenDocNodes(node.children, expanded, depth + 1));
    }
  }

  return items;
}

export function findDocNode(nodes: DocNode[], nodePath: string): DocNode | null {
  for (const node of nodes) {
    if (node.node_path === nodePath) return node;
    const child = findDocNode(node.children, nodePath);
    if (child) return child;
  }
  return null;
}

export function findDocAncestors(
  nodes: DocNode[],
  nodePath: string,
  trail: string[] = [],
): string[] {
  for (const node of nodes) {
    const nextTrail = [...trail, node.node_path];
    if (node.node_path === nodePath) {
      return trail;
    }

    const childTrail = findDocAncestors(node.children, nodePath, nextTrail);
    if (childTrail.length) return childTrail;
  }

  return [];
}

export function findParentDocPath(
  nodes: DocNode[],
  nodePath: string,
  parent: string | null = null,
): string | null {
  for (const node of nodes) {
    if (node.node_path === nodePath) return parent;
    const childParent = findParentDocPath(node.children, nodePath, node.node_path);
    if (childParent !== null) return childParent;
  }
  return null;
}

export function findRootDocPath(
  nodes: DocNode[],
  nodePath: string,
  currentRoot: string | null = null,
): string | null {
  for (const node of nodes) {
    const nextRoot = node.kind === "root" ? node.node_path : currentRoot;
    if (node.node_path === nodePath) return nextRoot;
    const childRoot = findRootDocPath(node.children, nodePath, nextRoot);
    if (childRoot !== null) return childRoot;
  }
  return null;
}

export function findClosestExistingDocAncestor(
  nodes: DocNode[],
  path: string | null,
): string | null {
  if (!path) return null;

  let current = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  while (current) {
    if (findDocNode(nodes, current)) {
      return current;
    }
    current = current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : "";
  }

  return null;
}

export function findWritableDocRootForPath(nodes: DocNode[], path: string): string | null {
  for (const node of nodes) {
    if (
      node.kind === "root" &&
      !node.read_only &&
      (path === node.relative_path || path.startsWith(`${node.relative_path}/`))
    ) {
      return node.relative_path;
    }
  }

  return null;
}

export function collectMoveTargets(nodes: DocNode[], target: DocNode): DocNode[] {
  const rootPath = findRootDocPath(nodes, target.node_path);
  if (!rootPath) return [];

  const items: DocNode[] = [];
  visitDocNodes(nodes, (node) => {
    if (node.kind === "doc" || node.read_only) return;
    if (findRootDocPath(nodes, node.node_path) !== rootPath) return;
    if (node.node_path === target.node_path) return;
    if (target.kind !== "doc" && node.node_path.startsWith(`${target.node_path}/`)) return;
    items.push(node);
  });

  return items.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
}

export function defaultMoveDestination(
  nodes: DocNode[],
  target: DocNode,
  options: DocNode[],
): string {
  const currentParent = findParentDocPath(nodes, target.node_path);
  if (currentParent && options.some((node) => node.relative_path === currentParent)) {
    return currentParent;
  }
  return options[0]?.relative_path ?? "";
}

export function canCreateInDocNode(node: DocNode | null): boolean {
  return !!node && node.kind !== "doc" && node.can_create;
}

export function basenameFromPath(path: string): string {
  return path.split("/").pop() ?? path;
}

export function restoredBasename(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return `${name}-restored`;
  }

  return `${name.slice(0, dot)}-restored${name.slice(dot)}`;
}

export function suggestAvailableName(
  nodes: DocNode[],
  parentPath: string,
  baseName: string,
): string {
  let candidate = baseName;
  let counter = 2;

  while (hasChildNamed(nodes, parentPath, candidate)) {
    candidate = appendOrdinal(baseName, counter);
    counter += 1;
  }

  return candidate;
}

function visitDocNodes(nodes: DocNode[], callback: (node: DocNode) => void) {
  for (const node of nodes) {
    callback(node);
    visitDocNodes(node.children, callback);
  }
}

function hasChildNamed(nodes: DocNode[], parentPath: string, name: string): boolean {
  const parent = findDocNode(nodes, parentPath);
  return parent?.children.some((child) => child.name === name) ?? false;
}

function appendOrdinal(name: string, counter: number): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return `${name}-${counter}`;
  }

  return `${name.slice(0, dot)}-${counter}${name.slice(dot)}`;
}
