import sys
import time

from queue_runtime import open_connection, run_scheduler_tick


def main() -> None:
    once = "--once" in sys.argv
    poll_seconds = 60

    connection = open_connection()
    try:
        while True:
            stats = run_scheduler_tick(connection)
            print(
                "scheduler: "
                f"expired_tokens={stats['expired_tokens']} "
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
