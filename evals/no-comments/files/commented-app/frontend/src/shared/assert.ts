export function assert(condition: boolean, why: string): asserts condition {
  if (!condition) {
    throw new Error(why);
  }
}
