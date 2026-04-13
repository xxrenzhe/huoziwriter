import sys
import time

from queue_runtime import claim_next_job, complete_job, fail_job, handle_job, open_connection


def main() -> None:
    once = "--once" in sys.argv
    poll_seconds = 5

    connection = open_connection()
    try:
        while True:
            job = claim_next_job(connection)
            if job is None:
                print("worker-py: no queued jobs", flush=True)
                if once:
                    return
                time.sleep(poll_seconds)
                continue

            print(f"worker-py: processing job #{job['id']} ({job['job_type']})", flush=True)
            try:
                handle_job(connection, job)
                complete_job(connection, int(job["id"]))
                print(f"worker-py: completed job #{job['id']}", flush=True)
            except Exception as error:
                fail_job(connection, int(job["id"]), str(error))
                print(f"worker-py: failed job #{job['id']}: {error}", flush=True)
                if once:
                    raise

            if once:
                return
    finally:
        connection.close()


if __name__ == "__main__":
    main()
