export interface DiffLine { kind: "same" | "add" | "remove"; text: string }
export function diffLines(left: string, right: string): DiffLine[] {
  const a = left.split("\n"), b = right.split("\n");
  if (a.length * b.length > 1000000) throw new Error("Diff limit: 1 million line comparisons. Compare smaller selections.");
  const width = b.length + 1, dp = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i * width + j] = a[i] === b[j] ? 1 + dp[(i + 1) * width + j + 1] : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
  const lines: DiffLine[] = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { lines.push({ kind: "same", text: a[i++] }); j++; }
    else if (j < b.length && (i === a.length || dp[i * width + j + 1] >= dp[(i + 1) * width + j])) lines.push({ kind: "add", text: b[j++] });
    else lines.push({ kind: "remove", text: a[i++] });
  }
  return lines;
}
