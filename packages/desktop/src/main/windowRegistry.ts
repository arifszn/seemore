/** Which root each window shows, and which windows show each root. */
export class WindowRegistry<Id = number> {
  private readonly rootOf = new Map<Id, string>();
  private readonly windowsOf = new Map<string, Set<Id>>();

  add(id: Id, root: string): void {
    this.remove(id);
    this.rootOf.set(id, root);
    const set = this.windowsOf.get(root) ?? new Set<Id>();
    set.add(id);
    this.windowsOf.set(root, set);
  }

  remove(id: Id): void {
    const root = this.rootOf.get(id);
    if (root === undefined) return;
    this.rootOf.delete(id);
    const set = this.windowsOf.get(root);
    set?.delete(id);
    if (set?.size === 0) this.windowsOf.delete(root);
  }

  root(id: Id): string | undefined {
    return this.rootOf.get(id);
  }

  windows(root: string): Id[] {
    return [...(this.windowsOf.get(root) ?? [])];
  }

  roots(): string[] {
    return [...this.windowsOf.keys()];
  }
}
