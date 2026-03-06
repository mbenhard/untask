export type FrontmatterSplit = {
  prefix: string;
  body: string;
};

const FRONTMATTER_PATTERN =
  /^(---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n)?)/;

export function splitFrontmatter(raw: string): FrontmatterSplit {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { prefix: "", body: raw };
  }

  const prefix = match[1];
  return {
    prefix,
    body: raw.slice(prefix.length),
  };
}
