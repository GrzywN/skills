# Runtime layers

These layers live in production code.
They run on every request, cost no CI time, and catch what the tests did not predict.

## Runtime contracts

Treat data from outside the process as `unknown` until a schema parses it.
This covers request bodies and parameters, responses from external APIs, responses from your own API on the frontend, files such as CSV, and stored data.

### Backend

An endpoint that reads from an external API parses the external response first.
It then builds its own response and parses that too, so the client gets what the contract promises.

The request has a schema too.
A request that fails it is an error of the client, so answer with a 400 and the zod issues.
Do not send it to error reporting.
On a public endpoint, each bad request would create a report.

```typescript
import { z } from 'zod';

const OverpassElementSchema = z.strictObject({
  type: z.literal('node'),
  id: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  tags: z.record(z.string(), z.string()),
});

const OverpassResponseSchema = z.strictObject({
  version: z.number(),
  generator: z.string(),
  osm3s: z.strictObject({ timestamp_osm_base: z.string(), copyright: z.string() }),
  elements: z.array(OverpassElementSchema),
});

export const PlaceSchema = z.strictObject({
  id: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  fee: z.enum(['yes', 'no', 'unknown']),
});
export type Place = z.infer<typeof PlaceSchema>;

export async function fetchPlaces(fetchJson: (url: string) => Promise<unknown>): Promise<Place[]> {
  const overpass = OverpassResponseSchema.parse(await fetchJson(OVERPASS_URL));
  return z.array(PlaceSchema).parse(overpass.elements.map(toPlace));
}
```

### Frontend

Everything that reaches the frontend goes through a schema, from your own API and from external APIs.
A contract failure must be easy to debug, so report it with the endpoint and the zod issues.

```typescript
export async function loadPlaces(fetchJson: (url: string) => Promise<unknown>): Promise<Place[]> {
  const result = z.array(PlaceSchema).safeParse(await fetchJson('/api/places'));
  if (!result.success) {
    Sentry.captureException(result.error, { extra: { endpoint: 'GET /api/places', issues: result.error.issues } });
    throw result.error;
  }
  return result.data;
}
```

Use `zod/mini` on the frontend when bundle size matters.

### How strict

- Use `z.strictObject`, so an unknown key fails.
- Use `z.literal` and `z.enum` instead of `z.string()` when the set of values is known.
- Give numbers and strings their real limits with `.min()`, `.max()`, and `.int()`.
- Do not use `z.any()`, `.passthrough()`, or `.optional()` on a field that is always there.
- Derive the type with `z.infer`.
  Do not write the same type by hand.

When the schema fails because your assumption was wrong, the schema did its job.
Fix the assumption and do not loosen the schema to make the error go away.

### Exception

A package from a proven vendor can skip this rule, because the vendor tests its own types.
The exception does not cover a vendor that gives you a contract over an API.
If you call the HTTP API yourself, you parse the response.

## Runtime assertions

Schemas guard the boundaries.
Assertions guard the assumptions inside the code.
Use the one `assert` function from `SKILL.md`.

```typescript
export function truncateLabel(text: string, maxLength: number): string {
  assert(Number.isInteger(maxLength), 'maxLength is a whole number of characters');
  assert(maxLength >= 4 && maxLength <= 120, 'a place label shows between 4 and 120 characters');
  assert(text.length > 0, 'a place always has a label');

  const label = text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;

  assert(label.length <= maxLength, 'a truncated label never exceeds maxLength');
  return label;
}
```

- Put assertions in constructors and in the key functions of the system.
- State the range of data that the code supports.
  The same range later becomes the input of a property-based test.
- Write `why` in domain words.
  A reader learns the requirement from it, at the place where the requirement applies.
- An assertion that passes is good.
  An assertion that fails when nobody expected it is also good, because it found what nobody predicted.
- A check that looks obvious still has value, because it records the assumption.
- Use assertions for the assumptions of programmers.
  Use schemas for data from users and other systems.

### Reporting

`assert` only throws.
Reporting is the job of the global handlers, so `assert.ts` has no dependencies and is the same file on the backend and the frontend.

- Start the error reporting SDK at the entry point of each app.
- On a backend, make sure the global exception filter reports unhandled errors.
- Upload source maps, so the stack trace points at source lines.
- Do not catch an error and drop it.
  When you wrap an error, pass the original as `cause`, so the stack trace stays complete.

## Performance monitors

Measure the parts that decide how fast the app feels: database queries, API requests, and parsing of large data such as CSV.
A slow path is not a defect that must stop the user.
So a breach of the budget sends a warning, the user continues, and CI stays green.
The team then handles the warning in the reporting service.

```typescript
const PARSE_BUDGET_MS = 200;

export function parsePlacesCsv(csv: string, budgetMs = PARSE_BUDGET_MS): Place[] {
  const startedAt = performance.now();
  const places = parseRows(csv);
  const elapsedMs = performance.now() - startedAt;

  if (elapsedMs > budgetMs) {
    Sentry.captureMessage(`parsePlacesCsv took ${Math.round(elapsedMs)} ms, budget is ${budgetMs} ms`, 'warning');
  }
  return places;
}
```

- Measure each case before you set its budget.
- Use the tracing and profiling of the service you already have, for example Sentry spans or Datadog.
- Never throw from a performance check and never fail a pipeline on it.
