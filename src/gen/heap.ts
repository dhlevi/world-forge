/** Binary min-heap of integer values keyed by float priority. */
export class MinHeap {
  private keys: Float64Array;
  private vals: Int32Array;
  size = 0;
  /** Key of the most recently popped value. */
  lastKey = 0;

  constructor(capacity = 1024) {
    this.keys = new Float64Array(capacity);
    this.vals = new Int32Array(capacity);
  }

  push(val: number, key: number): void {
    if (this.size === this.keys.length) this.grow();
    const keys = this.keys, vals = this.vals;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }

  pop(): number {
    const keys = this.keys, vals = this.vals;
    const top = vals[0];
    this.lastKey = keys[0];
    const n = --this.size;
    if (n > 0) {
      const k = keys[n], v = vals[n];
      let i = 0;
      for (;;) {
        let l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        if (r < n && keys[r] < keys[l]) l = r;
        if (keys[l] >= k) break;
        keys[i] = keys[l];
        vals[i] = vals[l];
        i = l;
      }
      keys[i] = k;
      vals[i] = v;
    }
    return top;
  }

  private grow(): void {
    const keys = new Float64Array(this.keys.length * 2);
    const vals = new Int32Array(this.vals.length * 2);
    keys.set(this.keys);
    vals.set(this.vals);
    this.keys = keys;
    this.vals = vals;
  }
}
