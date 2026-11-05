export { halveShown };

/**
 * Halves `list`, ordered so that `before` is true for a prefix of it, for the index of the first item `before` says is not
 * yet past the point it looks for. An item `shown` says has no place to measure (a hidden message's zero box would break
 * the halving) is stepped over to the nearest one that has, the one after it first; none in the range means the point lies
 * past it, and the end of the range comes back.
 *
 * @internal
 */
function halveShown<T>(list: readonly T[], shown: (item: T) => boolean, before: (item: T) => boolean): number {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    let at = -1;
    // The middle is never nearer the range's end than its start, so the steps before it run out last.
    for (let offset = 0; at === -1 && middle - offset >= low; offset++) {
      if (middle + offset < high && shown(list[middle + offset]!)) at = middle + offset;
      else if (shown(list[middle - offset]!)) at = middle - offset;
    }
    if (at === -1) return high;
    if (before(list[at]!)) low = at + 1;
    else high = at;
  }
  return low;
}
