import argparse
from typing import Any

from queue_runtime import (
    complete_job,
    fail_job,
    handle_job,
    now_iso,
    open_connection,
    parse_payload,
    timestamp_value,
)


TARGET_JOB_TYPES = ("writingEvalRun", "writingEvalScore", "writingEvalPromote")
TERMINAL_RUN_STATUSES = {"succeeded", "failed"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run only selected writing eval jobs.")
    parser.add_argument("--run-id", action="append", dest="run_ids", type=int, required=True)
    parser.add_argument("--max-iterations", type=int, default=64)
    return parser.parse_args()


def get_target_run_statuses(connection: Any, run_ids: list[int]) -> dict[int, str]:
    placeholders = ", ".join("?" for _ in run_ids)
    rows = connection.fetchall(
        f"SELECT id, status FROM writing_optimization_runs WHERE id IN ({placeholders}) ORDER BY id ASC",
        tuple(run_ids),
    )
    return {int(row["id"]): str(row["status"] or "") for row in rows}


def claim_target_job(connection: Any, run_ids: set[int]) -> dict[str, Any] | None:
    placeholders = ", ".join("?" for _ in TARGET_JOB_TYPES)
    rows = connection.fetchall(
        f"""
        SELECT *
        FROM job_queue
        WHERE status = 'queued'
          AND job_type IN ({placeholders})
        ORDER BY id ASC
        """,
        TARGET_JOB_TYPES,
    )
    now = now_iso()
    now_param = timestamp_value(connection, now)
    for row in rows:
      payload = parse_payload(row.get("payload_json"))
      run_id = int(payload.get("runId") or 0)
      if run_id not in run_ids:
          continue
      updated = connection.execute(
          """
          UPDATE job_queue
          SET status = 'running', locked_at = ?, updated_at = ?
          WHERE id = ? AND status = 'queued'
          """,
          (now_param, now_param, int(row["id"])),
      )
      connection.commit()
      if updated:
          return row
    return None


def main() -> None:
    args = parse_args()
    run_ids = sorted({int(item) for item in args.run_ids if int(item) > 0})
    if not run_ids:
        raise SystemExit("missing target run ids")

    connection = open_connection()
    try:
        for _ in range(max(1, int(args.max_iterations))):
            statuses = get_target_run_statuses(connection, run_ids)
            if statuses and all(status in TERMINAL_RUN_STATUSES for status in statuses.values()):
                print({"statuses": statuses}, flush=True)
                return

            job = claim_target_job(connection, set(run_ids))
            if job is None:
                raise RuntimeError(f"no queued targeted job found; current statuses={statuses}")

            print(
                f"targeted-writer-eval: processing job #{job['id']} ({job['job_type']})",
                flush=True,
            )
            try:
                handle_job(connection, job)
                complete_job(connection, int(job["id"]))
            except Exception as error:
                fail_job(connection, int(job["id"]), str(error))
                raise

        raise RuntimeError("targeted writing eval runner exceeded max iterations")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
