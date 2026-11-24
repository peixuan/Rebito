import type { San3Document } from "./document.ts";
import { inspectSan3Lists } from "./relocation.ts";

function readContext(document: San3Document) {
  const graph = inspectSan3Lists(document);
  for (const member of graph.membership.values()) Object.freeze(member);
  const members: ReadonlyMap<
    number,
    Readonly<NonNullable<ReturnType<typeof graph.membership.get>>>
  > = graph.membership;
  const cities = Object.freeze(
    graph.cities.map((city) =>
      Object.freeze({
        ...city,
        serving: Object.freeze(city.serving),
        free: Object.freeze(city.free),
        hidden: Object.freeze(city.hidden),
      }),
    ),
  );
  // Object.freeze(Map/Set) does not disable their mutators; expose only reads.
  const membership = Object.freeze({
    get: (index: number) => members.get(index),
    has: (index: number) => members.has(index),
    [Symbol.iterator]: () => members.entries(),
  });
  const rulers = Object.freeze({ has: (index: number) => graph.rulers.has(index) });
  return Object.freeze({ cities, membership, rulers });
}

type ListContext = ReturnType<typeof readContext>;
const contexts = new WeakMap<San3Document, { value: ListContext } | { error: unknown }>();

/** Documents own immutable bytes; every changed document gets independent validation. */
export function san3ListContext(document: San3Document): ListContext {
  let result = contexts.get(document);
  if (!result) {
    try {
      result = { value: readContext(document) };
    } catch (error) {
      result = { error };
    }
    contexts.set(document, result);
  }
  if ("error" in result) throw result.error;
  return result.value;
}
