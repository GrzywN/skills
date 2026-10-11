# Component, unit, and integration tests

These three layers state the specification in test files.
Component tests and unit tests are equal in the pyramid.
Integration tests are fewer.

## Rules for all three

### Specification files and regression files

From this layer up, each domain has two kinds of test files.

- `places.spec.ts` holds the specification: what the system must do.
- `places.regression.spec.ts` holds one test for each defect that happened.

The split shows how the requirements changed and which defects were found.
The comment format for regression tests is in `SKILL.md`.
Reproduce the defect the way the user met it.
Then put the permanent regression test in the lowest layer that still fails without the fix.

### Property-based tests

Do not test one weak value.
Test the whole range that the code supports, with `fast-check`.
The assertions in the code already define that range, so copy it into the generators.
Also test what happens outside the range.

```typescript
import fc from 'fast-check';

test('a label inside the limit is shown in full', () => {
  fc.assert(
    fc.property(fc.integer({ min: 4, max: 120 }), fc.string({ minLength: 1 }), (maxLength, text) => {
      fc.pre(text.length <= maxLength);
      expect(truncateLabel(text, maxLength)).toBe(text);
    }),
  );
});

test('a label above the limit ends with an ellipsis and fits the limit', () => {
  fc.assert(
    fc.property(fc.integer({ min: 4, max: 120 }), fc.string({ minLength: 121 }), (maxLength, text) => {
      const label = truncateLabel(text, maxLength);
      expect(label).toHaveLength(maxLength);
      expect(label.endsWith('…')).toBe(true);
    }),
  );
});

test('a limit outside the supported range is rejected', () => {
  fc.assert(
    fc.property(fc.integer({ max: 3 }), (maxLength) => {
      expect(() => truncateLabel('Central station', maxLength)).toThrow();
    }),
  );
});
```

### Table-driven tests

Put similar cases in one table.
Use the built-in function, `it.each`, and pass the array inline.
Do not store the cases in a constant first.
A project that declares another style wins.

```typescript
it.each([
  ['yes', 'Paid'],
  ['no', 'Free'],
  ['unknown', 'Fee unknown'],
])('fee %s shows the label %s', (fee, label) => {
  expect(feeLabel(fee)).toBe(label);
});
```

### No mocks

A mock tests the mock.
Use something that behaves like the real thing.

- HTTP to another service: Mock Service Worker (MSW).
- A database, a queue, or another service you can run: testcontainers.
- Your own dependency: a fake that implements the same interface, passed in by the test.

Design the code so that everything can be injected.
This includes constants, also when they are declared in the same file.

```typescript
function PlaceCard({ place, maxLabelLength = MAX_LABEL_LENGTH, formatDistance = formatDistanceInMeters }: PlaceCardProps) {
  // ...
}
```

## Component tests

Test UI components in Storybook with its component tests.
Do not parse HTML in a unit test, and do not load a whole page in E2E to check one component.
Story tests are fast, easy to read, and rarely flaky.
They also keep UI behavior apart from logic.

```typescript
import { expect } from 'storybook/test';

export const LongLabel: Story = {
  args: { place: { ...place, name: 'A'.repeat(200) }, maxLabelLength: 40 },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading')).toHaveTextContent('A'.repeat(39) + '…');
  },
};
```

- A component must not accept data that it cannot show.
  State the range with assertions.
- Use property-based tests here too.
  A typical case is the range of lengths where the full text shows and the range where the text is cut with an ellipsis.

## Unit tests

Unit tests describe the specification of a unit and check the code against it.
They do not repeat the implementation.
The exception is a test whose purpose is the implementation, such as a test for a shared utility.

- Shared utilities and code that the whole codebase uses must have unit tests.
- Do not write a unit test for a trivial check that always passes.
  Write an assertion in the code instead.

### Prefer a proven package

If you wrote a utility and its test file passed 200 lines, stop.
Look for a proven package that does the same thing.
The package saves CI time and replaces an uncertain implementation with a tested one.

### Ported tests

Sometimes the code must stay your own, and you still want the behavior of a known package.
Then take the tests of that package and run them against your code.

- Name the file `<name>.ported.spec.ts`.
- Put the source at the top of the file: package, version, and link.
- Keep the tests unchanged, or port them one to one.

## Integration tests

An integration test runs a real slice of the system, for example an HTTP request against the running backend.
The file must read as the specification of the API: each endpoint and each status.

Here you can drop the `it` style.
Use `test`, and put the method, the path, and the status in the name.
Use `test.todo` with only a name for cases you still owe.

```typescript
test('GET /places/ (200)', async () => {
  // ...
});

test('POST /places/{uuid} (403)', async () => {
  // ...
});

test.todo('GET /places/ (500)');
```

- Run services you own in testcontainers.
- Stand in for external HTTP APIs with MSW.
- Parse each response body with the schema of the contract.
