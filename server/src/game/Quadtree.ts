export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpatialItem {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export class Quadtree<T extends SpatialItem> {
  private readonly capacity: number;
  private readonly maxDepth: number;
  private readonly depth: number;
  private readonly bounds: Bounds;
  private items: T[] = [];
  private children: Quadtree<T>[] | null = null;

  constructor(bounds: Bounds, capacity = 12, maxDepth = 6, depth = 0) {
    this.bounds = bounds;
    this.capacity = capacity;
    this.maxDepth = maxDepth;
    this.depth = depth;
  }

  public clear(): void {
    this.items = [];
    this.children = null;
  }

  public insert(item: T): boolean {
    if (!this.intersectsCircle(this.bounds, item.x, item.y, item.radius)) {
      return false;
    }

    if (this.children === null) {
      if (this.items.length < this.capacity || this.depth >= this.maxDepth) {
        this.items.push(item);
        return true;
      }
      this.subdivide();
    }

    if (this.children) {
      let inserted = false;
      for (const child of this.children) {
        if (child.insert(item)) {
          inserted = true;
        }
      }
      return inserted;
    }

    return false;
  }

  public query(range: Bounds, found: T[] = [], seen = new Set<string>()): T[] {
    if (!this.intersectsRect(this.bounds, range)) {
      return found;
    }

    for (const item of this.items) {
      if (
        !seen.has(item.id) &&
        this.intersectsCircle(range, item.x, item.y, item.radius)
      ) {
        seen.add(item.id);
        found.push(item);
      }
    }

    if (this.children) {
      for (const child of this.children) {
        child.query(range, found, seen);
      }
    }

    return found;
  }

  private subdivide(): void {
    const { x, y, w, h } = this.bounds;
    const hw = w / 2;
    const hh = h / 2;
    const nextDepth = this.depth + 1;

    this.children = [
      new Quadtree<T>({ x, y, w: hw, h: hh }, this.capacity, this.maxDepth, nextDepth),
      new Quadtree<T>({ x: x + hw, y, w: hw, h: hh }, this.capacity, this.maxDepth, nextDepth),
      new Quadtree<T>({ x, y: y + hh, w: hw, h: hh }, this.capacity, this.maxDepth, nextDepth),
      new Quadtree<T>({ x: x + hw, y: y + hh, w: hw, h: hh }, this.capacity, this.maxDepth, nextDepth),
    ];

    const existing = this.items;
    this.items = [];
    for (const item of existing) {
      for (const child of this.children) {
        child.insert(item);
      }
    }
  }

  private intersectsRect(a: Bounds, b: Bounds): boolean {
    return !(
      a.x > b.x + b.w ||
      a.x + a.w < b.x ||
      a.y > b.y + b.h ||
      a.y + a.h < b.y
    );
  }

  private intersectsCircle(rect: Bounds, cx: number, cy: number, r: number): boolean {
    const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy <= r * r;
  }
}
