"""Runs against a local mock of the API. Never sends a real text.  python -m unittest discover -s tests"""

import contextlib
import io
import json
import os
import stat
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import homingpigeondev  # noqa: E402
from homingpigeondev.__main__ import main  # noqa: E402


class Mock(BaseHTTPRequestHandler):
    requests = []
    reply = None  # (status, body) to force, else the default for the route

    def _handle(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length)) if length else None
        Mock.requests.append({"method": self.command, "path": self.path, "headers": dict(self.headers), "body": body})
        if Mock.reply:
            code, payload = Mock.reply
        elif self.path == "/v1/verify" and body and body.get("code"):
            code, payload = 200, {"verified": True, "api_key": "hp_test_from_verify", "phone": "+1 •••-•••-4567"}
        elif self.path == "/v1/verify":
            code, payload = 202, {"status": "code_sent", "phone": "+1 •••-•••-4567"}
        elif self.path == "/v1/send":
            code, payload = 200, {"sent": True, "messages_remaining": 49}
        else:
            code, payload = 200, {"paused": False, "messages_remaining": 49}
        raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    do_GET = do_POST = _handle

    def log_message(self, *args):
        pass


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Mock)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        Mock.requests.clear()
        Mock.reply = None
        self.dir = tempfile.TemporaryDirectory()
        self.env = {"HOMINGPIGEON_API_URL": self.url, "HOMINGPIGEON_CONFIG_DIR": self.dir.name}
        self.saved = {k: os.environ.pop(k, None) for k in ("HOMINGPIGEON_API_URL", "HOMINGPIGEON_CONFIG_DIR", "HOMINGPIGEON_API_KEY")}
        os.environ.update(self.env)

    def tearDown(self):
        for k in ("HOMINGPIGEON_API_URL", "HOMINGPIGEON_CONFIG_DIR", "HOMINGPIGEON_API_KEY"):
            os.environ.pop(k, None)
            if self.saved[k] is not None:
                os.environ[k] = self.saved[k]
        self.dir.cleanup()

    def config(self):
        with open(os.path.join(self.dir.name, "config.json")) as f:
            return json.load(f)


class SendTest(Base):
    def test_send_uses_env_key_and_sends_only_the_message(self):
        os.environ["HOMINGPIGEON_API_KEY"] = "hp_env"
        result = homingpigeondev.send("Backup failed.", idempotency_key=42)
        self.assertEqual(result["messages_remaining"], 49)
        req = Mock.requests[-1]
        self.assertEqual((req["method"], req["path"]), ("POST", "/v1/send"))
        self.assertEqual(req["headers"]["Authorization"], "Bearer hp_env")
        self.assertRegex(req["headers"]["User-Agent"], r"^homingpigeondev/[\d.]+ \(python\)$")
        self.assertEqual(req["body"], {"message": "Backup failed.", "idempotency_key": "42"})

    def test_send_reads_the_key_the_npm_cli_saved(self):
        with open(os.path.join(self.dir.name, "config.json"), "w") as f:
            json.dump({"apiKey": "hp_from_npm", "hookMinMinutes": 5}, f)
        homingpigeondev.send("Hi")
        self.assertEqual(Mock.requests[-1]["headers"]["Authorization"], "Bearer hp_from_npm")

    def test_argument_beats_env(self):
        os.environ["HOMINGPIGEON_API_KEY"] = "hp_env"
        homingpigeondev.send("Hi", api_key="hp_arg")
        self.assertEqual(Mock.requests[-1]["headers"]["Authorization"], "Bearer hp_arg")

    def test_no_key_raises_before_any_request(self):
        with self.assertRaises(homingpigeondev.HomingPigeonError) as ctx:
            homingpigeondev.send("Hi")
        self.assertEqual(ctx.exception.code, "key_not_verified")
        self.assertIn("verify", ctx.exception.next_step)
        self.assertEqual(Mock.requests, [])

    def test_api_errors_carry_code_and_next_step(self):
        os.environ["HOMINGPIGEON_API_KEY"] = "hp_env"
        Mock.reply = (402, {"error": {"code": "limit_reached", "message": "No texts left.", "next_step": "Upgrade."}})
        with self.assertRaises(homingpigeondev.HomingPigeonError) as ctx:
            homingpigeondev.send("Hi")
        err = ctx.exception
        self.assertEqual((err.code, err.status, err.next_step), ("limit_reached", 402, "Upgrade."))
        self.assertEqual(str(err), "No texts left. Upgrade.")

    def test_non_json_error(self):
        os.environ["HOMINGPIGEON_API_KEY"] = "hp_env"
        Mock.reply = (502, b"<html>bad gateway</html>")
        with self.assertRaises(homingpigeondev.HomingPigeonError) as ctx:
            homingpigeondev.send("Hi")
        self.assertEqual((ctx.exception.code, ctx.exception.status), ("unexpected_response", 502))

    def test_network_error(self):
        os.environ["HOMINGPIGEON_API_KEY"] = "hp_env"
        os.environ["HOMINGPIGEON_API_URL"] = "http://127.0.0.1:9"
        with self.assertRaises(homingpigeondev.HomingPigeonError) as ctx:
            homingpigeondev.send("Hi", timeout=3)
        self.assertEqual(ctx.exception.code, "network_error")

    def test_status(self):
        os.environ["HOMINGPIGEON_API_KEY"] = "hp_env"
        self.assertEqual(homingpigeondev.status()["messages_remaining"], 49)
        self.assertEqual((Mock.requests[-1]["method"], Mock.requests[-1]["path"]), ("GET", "/v1/status"))


class VerifyTest(Base):
    def test_verify_then_send_with_the_saved_key(self):
        first = homingpigeondev.verify("+15551234567", project="my-bot")
        self.assertEqual(first["status"], "code_sent")
        self.assertEqual(Mock.requests[-1]["body"], {"phone": "+15551234567", "project": "my-bot"})
        self.assertFalse(os.path.exists(os.path.join(self.dir.name, "config.json")))

        with open(os.path.join(self.dir.name, "config.json"), "w") as f:
            json.dump({"hookMinMinutes": 10}, f)
        second = homingpigeondev.verify("+15551234567", 123456)
        self.assertEqual(second["api_key"], "hp_test_from_verify")
        self.assertEqual(Mock.requests[-1]["body"], {"phone": "+15551234567", "code": "123456"})
        self.assertEqual(self.config(), {"hookMinMinutes": 10, "apiKey": "hp_test_from_verify"})
        mode = stat.S_IMODE(os.stat(os.path.join(self.dir.name, "config.json")).st_mode)
        self.assertEqual(mode, 0o600)

        homingpigeondev.send("Hi")
        self.assertEqual(Mock.requests[-1]["headers"]["Authorization"], "Bearer hp_test_from_verify")

    def test_verify_save_false(self):
        homingpigeondev.verify("+15551234567", "123456", save=False)
        self.assertFalse(os.path.exists(os.path.join(self.dir.name, "config.json")))


class CliTest(Base):
    def run_cli(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main(list(args))
        return code, out.getvalue(), err.getvalue()

    def test_cli_flow(self):
        self.assertEqual(self.run_cli("verify", "+15551234567")[0], 0)
        code, out, _ = self.run_cli("verify", "+15551234567", "123456")
        self.assertEqual(code, 0)
        self.assertIn("Verified", out)
        code, out, _ = self.run_cli("send", "Backup", "finished.")
        self.assertEqual((code, out.strip()), (0, "Sent."))
        self.assertEqual(Mock.requests[-1]["body"], {"message": "Backup finished."})

    def test_cli_errors_and_usage(self):
        code, _, err = self.run_cli("send", "Hi")
        self.assertEqual(code, 1)
        self.assertIn("key_not_verified", err)
        self.assertEqual(self.run_cli()[0], 2)


if __name__ == "__main__":
    unittest.main()
