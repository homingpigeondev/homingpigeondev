# Homing Pigeon for Python

Homing Pigeon (homingpigeon.dev) sends text-message alerts from your code or your coding agent to one phone: yours. No carrier registration, no app, no browser signup. Free to start.

```sh
pip install homingpigeondev
```

```python
import homingpigeondev

homingpigeondev.send("Backup failed on db-1.")
```

No dependencies. Python 3.8 and up.

## Verify your phone once

Texts go only to the US mobile number you verify as your own. There is no "to" field.

```sh
python -m homingpigeondev verify +15551234567          # texts you a six-digit code
python -m homingpigeondev verify +15551234567 123456   # saves the key on this machine
```

Or from Python, with `homingpigeondev.verify(phone)` and then `homingpigeondev.verify(phone, code)`.

If you already verified through Claude Code, Codex, Cursor or the npm CLI, skip this: the key is already saved and `send()` finds it.

## Where the key comes from

In order: the `api_key` argument, the `HOMINGPIGEON_API_KEY` environment variable, then `~/.config/homingpigeon/config.json`. On a server, set the environment variable and keep the key out of git.

## Sending

```python
homingpigeondev.send(f"Bought {fill.qty} {fill.symbol} at {fill.price}", idempotency_key=fill.id)
```

- Messages are up to 480 characters and count as one text.
- `idempotency_key` means a retry never texts you twice for the same event.
- Failures raise `homingpigeondev.HomingPigeonError`, with `code` and `next_step`. If an alert must never stop your program, wrap the call in `try`.
- `homingpigeondev.status()` returns messages left this month and what happened to the last send.

You get 50 free texts a month. After that, it is $19 a month for 1,000.

## With a coding agent

Tell your agent:

> Use Homing Pigeon to text me when this finishes.

It asks for your number, you read back the code, and it does the rest. The MCP server, hooks and API are in the [main README](https://github.com/homingpigeondev/homingpigeondev#readme). Terms: https://homingpigeon.dev/terms
