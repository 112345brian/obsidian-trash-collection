function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLineEnding(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function quoteYamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function formatFieldLines(key: string, value: string, asList: boolean): string[] {
  const quoted = quoteYamlString(value);
  return asList ? [`${key}:`, `  - ${quoted}`] : [`${key}: ${quoted}`];
}

function findFrontmatter(content: string): {
  opening: string;
  yaml: string;
  closing: string;
  body: string;
} | null {
  const match = content.match(/^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*)(\r?\n|$)/);
  if (!match) return null;
  return {
    opening: match[1],
    yaml: match[2],
    closing: `${match[3]}${match[4]}`,
    body: content.slice(match[0].length),
  };
}

function findKeyBlock(lines: string[], key: string): {
  start: number;
  end: number;
  hasInlineValue: boolean;
  hasIndentedContinuation: boolean;
} | null {
  const keyRe = new RegExp(`^${escapeRegExp(key)}\\s*:(.*)$`);
  const start = lines.findIndex((line) => keyRe.test(line));
  if (start === -1) return null;

  const keyMatch = lines[start].match(keyRe);
  const hasInlineValue = (keyMatch?.[1] ?? "").trim().length > 0;
  let end = start + 1;

  while (end < lines.length && (lines[end].trim() === "" || /^[ \t]/.test(lines[end]))) {
    end++;
  }

  return {
    start,
    end,
    hasInlineValue,
    hasIndentedContinuation: end > start + 1,
  };
}

function updateYamlField(yaml: string, key: string, value: string, preferList: boolean, newline: string): string {
  const lines = yaml.length > 0 ? yaml.split(/\r?\n/) : [];
  const block = findKeyBlock(lines, key);

  if (!block) {
    const fieldLines = formatFieldLines(key, value, preferList);
    return [...lines.filter((line, index) => line.length > 0 || index < lines.length - 1), ...fieldLines].join(newline);
  }

  const asList = preferList || block.hasIndentedContinuation || !block.hasInlineValue;
  lines.splice(block.start, block.end - block.start, ...formatFieldLines(key, value, asList));
  return lines.join(newline);
}

export function updateFrontmatterField(content: string, key: string, value: string, preferList = false): string {
  const newline = getLineEnding(content);
  const frontmatter = findFrontmatter(content);

  if (!frontmatter) {
    return `---${newline}${formatFieldLines(key, value, preferList).join(newline)}${newline}---${newline}${content}`;
  }

  const yaml = updateYamlField(frontmatter.yaml, key, value, preferList, newline);
  return `${frontmatter.opening}${yaml}${frontmatter.closing}${frontmatter.body}`;
}
