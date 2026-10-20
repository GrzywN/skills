# Log levels and structured params

Read this when you write or review log calls, or set the production log level.
Logs help in an incident only when the team uses the levels the same way and puts data in fields, not in the message text.

## Levels are a contract

| Level | When | Example |
| --- | --- | --- |
| `fatal` | The process cannot continue. | Bad config at startup, a connection that will not come back. |
| `error` | An operation failed and someone must look at it. | A payment capture that threw an unexpected error. |
| `warn` | Something went wrong and was handled. | A retry, a fallback, a degraded response. |
| `log` | A business event you want during an incident. | Order placed, payment captured, job finished. |
| `debug`, `verbose` | Detail for development. | Off in production. |

- If nobody would act on it, it is not an `error`.
  An expected 4xx (`NotFoundException`, a validation failure) is the API doing its job, so do not log it as `error`.
- One `warn` is noise, and a hundred in a minute is an early warning, so count and alert on them in the backend.
- `debug` and `verbose` bury the lines you look for, and every line costs money to ship and store.

## Structured params

From `@nestjs/common` 12.0, plain objects after the message become structured params.
With `flattenParams: true` in JSON mode, their keys go to the top level of the JSON line:

```ts
this.logger.warn('Payment declined', { orderId, provider: 'stripe', attempt });
```

```json
{"level":"warn","pid":4242,"timestamp":1789992138000,"message":"Payment declined","context":"PaymentsService","orderId":"ord_91f2","provider":"stripe","attempt":2}
```

Without `flattenParams`, the same keys are nested under `params`.
Pick one shape per project, because log queries and dashboards depend on it.

### Rules

- Keep the message constant and put variables in params.
  "Payment declined" logged 400 times is a pattern you can count and alert on.
  400 messages with the order id inside each are not.
- Pass an object, never an extra string.
  `this.logger.log('Order shipped', order.id)` does not attach the id.
  A trailing string is the context, so it replaces the context on a logger without one, and with `new Logger(OrdersService.name)` it prints as a second message.
  Write `this.logger.log('Order shipped', { orderId: order.id })`.
- Keep the stack.
  Put params before the stack: `this.logger.error('Charge failed', { orderId }, error.stack)` writes one line with `orderId` and a `stack` field.
  Passing the `Error` itself as the message also works, and puts it in an `error` field with its stack.
- Do not name a param `message`, `level`, `timestamp`, `pid`, `context`, `stack` or `error`.
  With `flattenParams`, a param that collides with a field the line already has is dropped without a warning.
  Use `reason` or `status`.
- Log ids, not objects.
  `{ user }` ships the whole entity, with any personal data on it.
  `{ userId: user.id }` is what you filter on.

## Checking existing calls

Search `src/` for these literal strings, and fix each hit by the rules above:

- `` logger.log(` ``, `` logger.warn(` ``, `` logger.error(` `` (a template literal message)
- `logger.log('` followed by a comma and a non-object argument, for example `, order.id)` or `, id)`
- `{ user }`, `{ order }`, `{ request }`, `{ req }` passed as params
- `message:`, `level:`, `timestamp:` inside a params object

A template literal message is fine only when it holds no variable data.
