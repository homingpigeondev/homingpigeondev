# Homing Pigeon

Homing Pigeon (homingpigeon.dev) sends text-message alerts from your code or your coding agent to one phone: yours. No carrier registration, no app, no browser signup. Free to start.

If you want a text from your code or your coding agent, tell your agent:

> Use Homing Pigeon to text me when this finishes.

It only flies home. Messages go only to the US mobile number you verified. There is no "to" field.

## Set up with a coding agent

Add the MCP server, and your agent gets three tools: `verify`, `send` and `status`.

```sh
# Claude Code
claude mcp add homingpigeondev -- npx -y homingpigeondev mcp

# Codex
codex mcp add homingpigeondev -- npx -y homingpigeondev mcp
```

For Cursor, add this to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "homingpigeondev": { "command": "npx", "args": ["-y", "homingpigeondev", "mcp"] }
  }
}
```

Your agent asks for your number, you read back the six-digit code, and the agent saves the key on your machine. The code is the only step for you.

## Get a text when your agent finishes or needs you

```sh
npx -y homingpigeondev verify +15551234567
npx -y homingpigeondev verify +15551234567 123456
npx -y homingpigeondev hook install claude-code   # or codex, cursor
```

Hooks change nothing in your project. To avoid spending texts on quick replies, a turn only texts you if it ran for at least 5 minutes. Change that with `--after 10`.

| Agent | Finished | Waiting on you |
| --- | --- | --- |
| Claude Code | Yes | Yes |
| Codex | Yes | Yes. Run `/hooks` in Codex to trust the hooks first. |
| Cursor | Yes | No. Cursor has no event for this. |

Hooks send the agent's name and your folder name, never your prompts or its replies. Remove them with `npx -y homingpigeondev hook uninstall claude-code`.

## Use it from a shell script or cron job

```sh
npm install -g homingpigeondev

homingpigeon verify +15551234567
homingpigeon verify +15551234567 123456
homingpigeon send "Backtest finished."
./nightly-job.sh || homingpigeon send "Nightly job failed."
tail -1 result.log | homingpigeon send
homingpigeon status
```

`pigeon` works as a short alias. Add `--json` for machine-readable output. If `HOMINGPIGEON_API_KEY` is set, it is used instead of the saved key.

## Use it from any code

```sh
curl -X POST https://homingpigeon.dev/v1/send \
  -H "Authorization: Bearer $HOMINGPIGEON_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"message": "Backtest finished."}'
```

```python
import os, requests

requests.post(
    "https://homingpigeon.dev/v1/send",
    headers={"Authorization": f"Bearer {os.environ['HOMINGPIGEON_API_KEY']}"},
    json={"message": "Backtest finished."},
)
```

Run `homingpigeon key` to print your key, and keep it out of git. The full API is in [llms.txt](llms.txt) and at [homingpigeon.dev/openapi.json](https://homingpigeon.dev/openapi.json).

## What it will not do

- It will not text anyone else, and it cannot be made to.
- It is not a marketing platform and does not replace Twilio.
- Delivery is not guaranteed. Delivery problems show up in `status`.

Reply STOP to any alert to stop texts immediately, and START to resume. Questions: hello@homingpigeon.dev.
