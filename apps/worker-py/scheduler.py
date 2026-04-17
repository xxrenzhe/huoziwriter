import json
import os
import sys
import time
import urllib.error
import urllib.request

from queue_runtime import open_connection, run_scheduler_tick

DEFAULT_WRITING_EVAL_AGENT_STRATEGIES = (
    "regression_guard",
    "rollout_watch",
    "calibration",
    "title_lab",
    "default",
)


def refresh_wechat_tokens() -> dict[str, int]:
    base_url = os.environ.get("SCHEDULER_SERVICE_URL", "http://127.0.0.1:3000")
    base_url = base_url.rstrip("/")
    token = os.environ.get("SCHEDULER_SERVICE_TOKEN") or os.environ.get("JWT_SECRET")
    if not token:
        return {"scheduled_refresh_scanned": 0, "scheduled_refresh_refreshed": 0, "scheduled_refresh_failed": 0}

    request = urllib.request.Request(
        f"{base_url}/api/service/scheduler/wechat-refresh",
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


def dispatch_writing_eval_schedules(trigger_mode: str, agent_strategy: str | None = None) -> dict[str, int]:
    base_url = os.environ.get("SCHEDULER_SERVICE_URL", "http://127.0.0.1:3000")
    base_url = base_url.rstrip("/")
    token = os.environ.get("SCHEDULER_SERVICE_TOKEN") or os.environ.get("JWT_SECRET")
    if not token:
        return {"writing_eval_dispatched": 0}

    payload = {"limit": 10, "triggerMode": trigger_mode}
    if agent_strategy:
        payload["agentStrategy"] = agent_strategy
    request = urllib.request.Request(
        f"{base_url}/api/service/scheduler/writing-eval-dispatch",
        data=json.dumps(payload).encode("utf-8"),
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
                "writing_eval_dispatched": int(data.get("dispatchedCount", 0)),
            }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"scheduler: writing eval dispatch request failed: {error}", file=sys.stderr, flush=True)
        return {"writing_eval_dispatched": 0}


def auto_calibrate_writing_eval_profile() -> dict[str, int]:
    base_url = os.environ.get("SCHEDULER_SERVICE_URL", "http://127.0.0.1:3000")
    base_url = base_url.rstrip("/")
    token = os.environ.get("SCHEDULER_SERVICE_TOKEN") or os.environ.get("JWT_SECRET")
    if not token:
        return {"writing_eval_auto_calibrated": 0}

    request = urllib.request.Request(
        f"{base_url}/api/service/writing-eval/auto-calibrate",
        data=json.dumps({"activate": True}).encode("utf-8"),
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
                "writing_eval_auto_calibrated": 1 if str(data.get("action") or "") == "created" else 0,
            }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"scheduler: writing eval auto calibration request failed: {error}", file=sys.stderr, flush=True)
        return {"writing_eval_auto_calibrated": 0}


def auto_manage_writing_eval_rollouts() -> dict[str, int]:
    base_url = os.environ.get("SCHEDULER_SERVICE_URL", "http://127.0.0.1:3000")
    base_url = base_url.rstrip("/")
    token = os.environ.get("SCHEDULER_SERVICE_TOKEN") or os.environ.get("JWT_SECRET")
    if not token:
        return {"writing_eval_auto_rollout_applied": 0}

    request = urllib.request.Request(
        f"{base_url}/api/service/writing-eval/auto-rollout",
        data=json.dumps({}).encode("utf-8"),
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
                "writing_eval_auto_rollout_applied": int(data.get("appliedCount", 0)),
            }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"scheduler: writing eval auto rollout request failed: {error}", file=sys.stderr, flush=True)
        return {"writing_eval_auto_rollout_applied": 0}


def auto_manage_prompt_rollouts() -> dict[str, int]:
    base_url = os.environ.get("SCHEDULER_SERVICE_URL", "http://127.0.0.1:3000")
    base_url = base_url.rstrip("/")
    token = os.environ.get("SCHEDULER_SERVICE_TOKEN") or os.environ.get("JWT_SECRET")
    if not token:
        return {"prompt_auto_rollout_applied": 0}

    request = urllib.request.Request(
        f"{base_url}/api/service/prompts/auto-rollout",
        data=json.dumps({}).encode("utf-8"),
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
                "prompt_auto_rollout_applied": int(data.get("appliedCount", 0)),
            }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"scheduler: prompt auto rollout request failed: {error}", file=sys.stderr, flush=True)
        return {"prompt_auto_rollout_applied": 0}


def dispatch_all_writing_eval_schedules() -> dict[str, int]:
    scheduled_stats = dispatch_writing_eval_schedules("scheduled")
    total_dispatched = int(scheduled_stats.get("writing_eval_dispatched", 0))
    raw_agent_strategies = os.environ.get("WRITING_EVAL_AGENT_STRATEGIES", "").strip()
    agent_strategies = [
        item.strip()
        for item in (raw_agent_strategies.split(",") if raw_agent_strategies else DEFAULT_WRITING_EVAL_AGENT_STRATEGIES)
        if item.strip()
    ]
    for strategy in agent_strategies:
        strategy_stats = dispatch_writing_eval_schedules("agent", strategy)
        total_dispatched += int(strategy_stats.get("writing_eval_dispatched", 0))
    return {"writing_eval_dispatched": total_dispatched}


def main() -> None:
    once = "--once" in sys.argv
    poll_seconds = 60

    connection = open_connection()
    try:
        while True:
            stats = run_scheduler_tick(connection)
            refresh_stats = refresh_wechat_tokens()
            writing_eval_stats = dispatch_all_writing_eval_schedules()
            writing_eval_calibration_stats = auto_calibrate_writing_eval_profile()
            writing_eval_rollout_stats = auto_manage_writing_eval_rollouts()
            prompt_rollout_stats = auto_manage_prompt_rollouts()
            print(
                "scheduler: "
                f"expired_tokens={stats['expired_tokens']} "
                f"scheduled_refresh_scanned={refresh_stats['scheduled_refresh_scanned']} "
                f"scheduled_refresh_refreshed={refresh_stats['scheduled_refresh_refreshed']} "
                f"scheduled_refresh_failed={refresh_stats['scheduled_refresh_failed']} "
                f"writing_eval_dispatched={writing_eval_stats['writing_eval_dispatched']} "
                f"writing_eval_auto_calibrated={writing_eval_calibration_stats['writing_eval_auto_calibrated']} "
                f"writing_eval_auto_rollout_applied={writing_eval_rollout_stats['writing_eval_auto_rollout_applied']} "
                f"prompt_auto_rollout_applied={prompt_rollout_stats['prompt_auto_rollout_applied']} "
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
