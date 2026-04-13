import json
import os
import sys
import time
import urllib.error
import urllib.request

from queue_runtime import open_connection, run_scheduler_tick


def refresh_wechat_tokens() -> dict[str, int]:
    base_url = os.environ.get("INTERNAL_APP_URL", "http://127.0.0.1:3000").rstrip("/")
    token = os.environ.get("INTERNAL_SCHEDULER_TOKEN") or os.environ.get("JWT_SECRET")
    if not token:
        return {"scheduled_refresh_scanned": 0, "scheduled_refresh_refreshed": 0, "scheduled_refresh_failed": 0}

    request = urllib.request.Request(
        f"{base_url}/api/internal/scheduler/wechat-refresh",
        data=json.dumps({"limit": 12, "refreshWindowMinutes": 30}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
            data = payload.get("data") or {}
            return {
                "scheduled_refresh_scanned": int(data.get("scanned", 0)),
                "scheduled_refresh_refreshed": int(data.get("refreshed", 0)),
                "scheduled_refresh_failed": int(data.get("failed", 0)),
            }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"scheduler: wechat token refresh request failed: {error}", file=sys.stderr, flush=True)
        return {"scheduled_refresh_scanned": 0, "scheduled_refresh_refreshed": 0, "scheduled_refresh_failed": 0}


def main() -> None:
    once = "--once" in sys.argv
    poll_seconds = 60

    connection = open_connection()
    try:
        while True:
            stats = run_scheduler_tick(connection)
            refresh_stats = refresh_wechat_tokens()
            print(
                "scheduler: "
                f"expired_tokens={stats['expired_tokens']} "
                f"scheduled_refresh_scanned={refresh_stats['scheduled_refresh_scanned']} "
                f"scheduled_refresh_refreshed={refresh_stats['scheduled_refresh_refreshed']} "
                f"scheduled_refresh_failed={refresh_stats['scheduled_refresh_failed']} "
                f"requeued_jobs={stats['requeued_jobs']} "
                f"deleted_snapshots={stats['deleted_snapshots']} "
                f"stale_cards_marked={stats['stale_cards_marked']} "
                f"knowledge_refresh_enqueued={stats['knowledge_refresh_enqueued']} "
                f"topic_jobs_enqueued={stats['topic_jobs_enqueued']}",
                flush=True,
            )
            if once:
                return
            time.sleep(poll_seconds)
    finally:
        connection.close()


if __name__ == "__main__":
    main()
