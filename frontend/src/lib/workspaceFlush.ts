// Editors register their pending drafts so graph export never misses recent input.
const flushers = new Set<() => Promise<void>>();

export function registerWorkspaceFlush(flush: () => Promise<void>) {
  flushers.add(flush);
  return () => { flushers.delete(flush); };
}

export async function flushWorkspaces() {
  await Promise.all([...flushers].map((flush) => flush()));
}
