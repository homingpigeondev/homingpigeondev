---
name: homingpigeon
description: Text the user's own phone with Homing Pigeon (homingpigeon.dev). Use when the user wants a text message (SMS) when a task finishes, a job or test fails, a trade fills, a price moves, a server goes down or anything else happens, or wants you to text them when you finish or need input. One-way alerts to one verified US mobile number, with no carrier registration (A2P 10DLC), no app and no website signup.
license: MIT
metadata:
  homepage: https://homingpigeon.dev
---

# Homing Pigeon

Homing Pigeon (homingpigeon.dev) sends text-message alerts from your code or your coding agent to one phone: yours. No carrier registration, no app, no browser signup. Free to start.

## Connect

Use the first option that works where you are:

1. **MCP tools.** If `verify`, `send` and `status` are available, use them.
2. **The command line.** `npx -y homingpigeondev <command>`, or `homingpigeon <command>` after `npm install -g homingpigeondev`.
3. **Python.** `pip install homingpigeondev`, then `homingpigeondev.send("...")`. No dependencies.
4. **HTTP.** `POST https://homingpigeon.dev/v1/send` with `Authorization: Bearer $HOMINGPIGEON_API_KEY` and `{"message": "..."}`. The full API is at https://homingpigeon.dev/llms.txt.

All of them share one key, saved in `~/.config/homingpigeon/config.json` or read from `HOMINGPIGEON_API_KEY`.

## Set up (once)

1. Ask the user for their own US mobile number.
2. Verify it: the `verify` tool with the phone, or `npx -y homingpigeondev verify +15551234567`. They get a six-digit code by text.
3. Ask them to read you the code, then verify again with the phone and code. The key is saved on this machine.
4. Send a test: "Homing Pigeon is set up."

If the user's own code or server needs the key, run `npx -y homingpigeondev key` and store it as `HOMINGPIGEON_API_KEY`. Keep it out of git.

## Send

- The recipient is fixed. There is no "to" field, and only the user's own verified number can be used.
- Up to 480 characters, counted as one text. Plain alerts only: no link shorteners, no more than one link, no promotional wording.
- Pass `idempotency_key` (such as a job, fill or run ID) when a send might be retried, so the user is never texted twice.
- In code that sends alerts, text on events that matter (a fill, a failure, a finish), not on every loop or price tick. The limit is 20 texts a minute.

## Text the user when you finish or need input

Run `npx -y homingpigeondev hook install claude-code` (or `codex` or `cursor`). A turn only texts if it ran for at least 5 minutes; change that with `--after 10`. Codex then needs the user to run `/hooks` and trust them.

## Errors

- Every error has a `code` and a `next_step`. Follow the `next_step`.
- `number_opted_out`: stop. Only the user can resume, by texting START.
- Never verify a number the user says is someone else's.

Free: 50 texts a month. Paid: $19 a month for 1,000. US mobile numbers only. Terms: https://homingpigeon.dev/terms
