import argparse
import json
import os

import psycopg
from psycopg.rows import dict_row

from app.main import create_pairing_challenge, device_secret, run_migrations


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage paired devices from inside the backend container.")
    commands = parser.add_subparsers(dest="command", required=True)
    challenge = commands.add_parser("create-challenge")
    challenge.add_argument("device_name")
    commands.add_parser("list")
    revoke = commands.add_parser("revoke")
    revoke.add_argument("device_id")
    args = parser.parse_args()

    device_secret("DEVICE_ADMIN_TOKEN")
    run_migrations()
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as connection:
        if args.command == "create-challenge":
            print(json.dumps(create_pairing_challenge(connection, args.device_name), default=str))
        elif args.command == "list":
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id, device_name, paired_at, last_seen_at, revoked_at FROM paired_devices ORDER BY paired_at DESC"
                )
                print(json.dumps({"devices": cursor.fetchall()}, default=str))
        else:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE paired_devices SET revoked_at = CURRENT_TIMESTAMP WHERE id = %s AND revoked_at IS NULL",
                    (args.device_id,),
                )


if __name__ == "__main__":
    main()
