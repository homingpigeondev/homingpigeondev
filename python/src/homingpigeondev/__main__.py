"""python -m homingpigeondev send "Backup failed." | status | verify +15551234567 [code]"""

import json
import sys

from . import HomingPigeonError, send, status, verify

USAGE = """usage:
  python -m homingpigeondev verify +15551234567          text a six-digit code to your own phone
  python -m homingpigeondev verify +15551234567 123456   finish, and save the key on this machine
  python -m homingpigeondev send "Backup failed."        text yourself
  python -m homingpigeondev status                       messages left and the last send"""


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    try:
        if len(args) >= 2 and args[0] == "send":
            send(" ".join(args[1:]))
            print("Sent.")
        elif args == ["status"]:
            print(json.dumps(status(), indent=2))
        elif len(args) in (2, 3) and args[0] == "verify":
            result = verify(*args[1:])
            if result.get("api_key"):
                print(f"Verified {result.get('phone', '')}. The key is saved, so send() works on this machine.")
            else:
                print(f"Code sent to {result.get('phone', 'your phone')}. Run verify again with the number and the code.")
        else:
            print(USAGE, file=sys.stderr)
            return 2
    except HomingPigeonError as err:
        print(f"Error ({err.code}): {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
