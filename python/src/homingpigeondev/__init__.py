"""Homing Pigeon (homingpigeon.dev) sends text-message alerts from your code or your coding
agent to one phone: yours. No carrier registration, no app, no browser signup. Free to start.

    import homingpigeondev
    homingpigeondev.send("Backup failed on db-1.")

The key comes from HOMINGPIGEON_API_KEY, or from the file that verify() and the npm CLI save
(~/.config/homingpigeon/config.json), so a phone verified once works everywhere on the machine.
"""

import json
import os
import tempfile
import urllib.error
import urllib.request

__version__ = "0.1.0"
__all__ = ["send", "status", "verify", "HomingPigeonError"]

DEFAULT_API_URL = "https://homingpigeon.dev"


class HomingPigeonError(Exception):
    """An API error. ``code`` is stable, ``next_step`` says what to do about it."""

    def __init__(self, code, message, next_step=None, status=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.next_step = next_step
        self.status = status

    def __str__(self):
        return f"{self.message} {self.next_step}" if self.next_step else self.message


def _config_dir():
    if os.environ.get("HOMINGPIGEON_CONFIG_DIR"):
        return os.environ["HOMINGPIGEON_CONFIG_DIR"]
    base = os.environ.get("XDG_CONFIG_HOME") or os.path.join(os.path.expanduser("~"), ".config")
    return os.path.join(base, "homingpigeon")


def _config_file():
    return os.path.join(_config_dir(), "config.json")


def _read_config():
    try:
        with open(_config_file(), encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_config(patch):
    data = {**_read_config(), **patch}
    os.makedirs(_config_dir(), mode=0o700, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=_config_dir(), suffix=".tmp")
    try:
        os.chmod(tmp, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
        os.replace(tmp, _config_file())
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _api_key(api_key=None):
    return api_key or os.environ.get("HOMINGPIGEON_API_KEY") or _read_config().get("apiKey")


def _api_url():
    return (os.environ.get("HOMINGPIGEON_API_URL") or DEFAULT_API_URL).rstrip("/")


def _request(method, route, body=None, api_key=None, auth=False, timeout=20):
    headers = {"User-Agent": f"homingpigeondev/{__version__} (python)", "Accept": "application/json"}
    if auth:
        key = _api_key(api_key)
        if not key:
            raise HomingPigeonError(
                "key_not_verified",
                "No Homing Pigeon key was found on this machine.",
                "Verify your own phone first: homingpigeondev.verify(\"+15551234567\"), "
                "then again with the six-digit code you receive.",
            )
        headers["Authorization"] = f"Bearer {key}"
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(_api_url() + route, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            status, raw = res.status, res.read()
    except urllib.error.HTTPError as err:
        status, raw = err.code, err.read()
    except (urllib.error.URLError, OSError) as err:
        raise HomingPigeonError("network_error", "Could not reach Homing Pigeon.", "Check the connection and try again.") from err

    try:
        payload = json.loads(raw.decode("utf-8"))
    except ValueError:
        payload = None
    if 200 <= status < 300 and isinstance(payload, dict):
        return payload
    error = payload.get("error") if isinstance(payload, dict) else None
    error = error if isinstance(error, dict) else {}
    raise HomingPigeonError(
        error.get("code") or "unexpected_response",
        error.get("message") or f"Homing Pigeon returned HTTP {status}.",
        error.get("next_step") or "Try again in a minute. If it keeps failing, tell the user.",
        status,
    )


def send(message, idempotency_key=None, api_key=None, timeout=20):
    """Text ``message`` to your verified phone. Up to 480 characters.

    Pass ``idempotency_key`` (such as a fill or job ID) so a retry never texts you twice.
    Raises HomingPigeonError on failure, so wrap it if an alert must never stop your code.
    """
    body = {"message": message}
    if idempotency_key is not None:
        body["idempotency_key"] = str(idempotency_key)
    return _request("POST", "/v1/send", body, api_key=api_key, auth=True, timeout=timeout)


def status(api_key=None, timeout=20):
    """Messages left this month, whether the number is paused, and what happened to the last send."""
    return _request("GET", "/v1/status", api_key=api_key, auth=True, timeout=timeout)


def verify(phone, code=None, project=None, save=True, timeout=20):
    """Verify your own US mobile number.

    Call it with the phone alone to get a six-digit code by text, then again with the code.
    The second call returns ``api_key`` and, unless ``save=False``, saves it where send() and the
    npm CLI find it. ``project`` is a short name shown in front of each text.
    """
    body = {"phone": phone}
    if code is not None:
        body["code"] = str(code)
    if project:
        body["project"] = project
    result = _request("POST", "/v1/verify", body, timeout=timeout)
    if save and result.get("api_key"):
        _write_config({"apiKey": result["api_key"]})
    return result
