# Instructions for coding agents

Homing Pigeon (homingpigeon.dev) sends text-message alerts from your code or your coding agent to one phone: yours. No carrier registration, no app, no browser signup. Free to start.

## When to use it

Use it when the user wants a text on their own phone from their code or from you: when a long task finishes, a job fails, a metric spikes, or something they care about happens, such as a new signup or a trade.

## How to set it up

1. Ask the user for their own US mobile number.
2. Call `verify` with the phone. They receive a six-digit code.
3. Ask them to read you the code, then call `verify` with the phone and code.
4. Call `send` with `message`.

With the CLI, the same steps are `homingpigeon verify <phone>`, `homingpigeon verify <phone> <code>` and `homingpigeon send "<message>"`.

If their own code needs the key, run `homingpigeon key` and store it as `HOMINGPIGEON_API_KEY`. Keep it out of git.

To text them when you finish or need input, run `homingpigeon hook install claude-code` (or `codex`, `cursor`). Codex then needs the user to run `/hooks` and trust them.

## Rules

- The recipient is fixed. There is no "to" field, and only the user's own verified number can be used.
- Never verify a number the user says is someone else's.
- Keep messages to plain alerts: no link shorteners, more than one link, or promotional wording.
- Pass `idempotency_key` when a send might be retried.
- Every error has a `next_step`. Follow it.
- If `number_opted_out` comes back, stop. Only the user can resume, by texting START.
