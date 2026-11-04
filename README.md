# Homing Pigeon

Homing Pigeon (homingpigeon.dev) sends text-message alerts from your code or your coding agent to one phone: yours. No carrier registration, no app, no browser signup. Free to start.

If you want a text from your code or your coding agent, tell your agent:

> Use Homing Pigeon to text me when this finishes.

Messages go only to the US mobile number you verified. There is no "to" field.

## Set up with a coding agent

Add the MCP server, and your agent gets three tools: `verify`, `send` and `status`.

```sh
# Claude Code
claude mcp add homingpigeondev -- npx -y homingpigeondev mcp

# Claude Code, as a plugin
claude plugin install homingpigeondev --marketplace homingpigeondev/homingpigeondev

# Codex
codex mcp add homingpigeondev -- npx -y homingpigeondev mcp

# Codex, as a plugin with the Homing Pigeon skill
codex plugin marketplace add homingpigeondev/homingpigeondev
codex plugin add homingpigeondev@homingpigeondev

# Gemini CLI
gemini extensions install https://github.com/homingpigeondev/homingpigeondev
```

Agents that load [Agent Skills](https://agentskills.io) can use [skills/homingpigeon/SKILL.md](skills/homingpigeon/SKILL.md).

For Cursor, Cline, Windsurf and other clients set up with JSON, add this to their MCP settings file (for Cursor, `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "homingpigeondev": { "command": "npx", "args": ["-y", "homingpigeondev", "mcp"] }
  }
}
```

Your agent asks for your number, you read back the six-digit code, and the agent saves the key on your machine. The code is the only step for you.

## Use it in Claude or ChatGPT

Add this URL as a custom connector, then sign in with your phone number and the six-digit code texted to you:

```
https://homingpigeon.dev/mcp
```

In Claude, that is Settings → Connectors → Add custom connector. In ChatGPT, turn on developer mode in settings, then add it as an app. Ask "Text me when we're done" and it can. Texts start with the app's name, such as `[Claude] Draft is ready.`

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

## Use it from Python

```sh
pip install homingpigeondev
```

```python
import homingpigeondev

homingpigeondev.send("Backtest finished.")
```

No dependencies. It finds the key in `HOMINGPIGEON_API_KEY` or the one saved when you verified, so a phone verified through your agent or the CLI works here too. Details are in [python/README.md](python/README.md).

## Use it from any code

```sh
curl -X POST https://homingpigeon.dev/v1/send \
  -H "Authorization: Bearer $HOMINGPIGEON_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"message": "Backtest finished."}'
```

Run `homingpigeon key` to print your key, and keep it out of git. The full API is in [llms.txt](llms.txt) and at [homingpigeon.dev/openapi.json](https://homingpigeon.dev/openapi.json).

Reply STOP to any alert to stop texts immediately, and START to resume. Questions: hello@homingpigeon.dev.
