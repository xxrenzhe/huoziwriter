from __future__ import annotations

import base64
import html
import json
import mimetypes
import os
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_VISION_MODEL = "gemini-3.0-flash"
DEFAULT_VISION_FALLBACK_MODEL = "gpt-5.4-mini"
DEFAULT_VISION_PROMPT = (
    "你是截图理解编辑。必须先看图，再提取正文、数字、图表结论、界面状态和异常信号，"
    "输出可复用的写作碎片。"
)
DEFAULT_FRAGMENT_DISTILL_PROMPT = "你是碎片提纯器。保留时间、地点、数据、冲突，不要写空泛总结。"
DEFAULT_WRITING_EVAL_JUDGE_PROMPT = (
    "你是中文写作评测裁判。你不会重写文章，只负责严格评分。"
    "必须同时检查写作质量、爆款潜力、事实边界和兑现度。"
    "只输出 JSON，不要解释，不要 markdown 代码块。"
)
BEIJING_TIMEZONE = timezone(timedelta(hours=8))
TOPIC_SYNC_TRIGGER_SLOTS_BEIJING = {
    (6, 0),
    (6, 15),
    (6, 45),
    (18, 0),
    (18, 15),
    (18, 45),
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def dispatch_writing_eval_auto_resolve(run_id: int, decision: str, reason: str) -> dict[str, Any] | None:
    base_url = os.environ.get("SCHEDULER_SERVICE_URL", "http://127.0.0.1:3000")
    base_url = base_url.rstrip("/")
    token = os.environ.get("SCHEDULER_SERVICE_TOKEN") or os.environ.get("JWT_SECRET")
    if not token:
        return None

    request = Request(
        f"{base_url}/api/service/writing-eval/auto-resolve",
        data=json.dumps({"runId": run_id, "decision": decision, "reason": reason}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))
        return payload.get("data") if isinstance(payload, dict) else None


def get_current_topic_sync_window(now_utc: datetime) -> datetime | None:
    now_beijing = now_utc.astimezone(BEIJING_TIMEZONE)
    if (now_beijing.hour, now_beijing.minute) not in TOPIC_SYNC_TRIGGER_SLOTS_BEIJING:
        return None
    if now_beijing.hour < 18:
        slot_start = now_beijing.replace(hour=6, minute=0, second=0, microsecond=0)
    else:
        slot_start = now_beijing.replace(hour=18, minute=0, second=0, microsecond=0)
    return slot_start.astimezone(timezone.utc)


TOPIC_LINK_PATTERN = re.compile(r"""<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)</a>""", re.IGNORECASE)
TOPIC_TAG_PATTERN = re.compile(r"<[^>]+>")
TOPIC_SKIP_PATTERN = re.compile(r"登录|注册|下载|APP|关于我们|联系我们|广告|隐私|版权|更多|专题|视频|直播", re.IGNORECASE)
WRITING_AI_NOISE_BANNED_PHRASES = ["赋能", "底层逻辑", "不可否认", "毋庸置疑", "瞬息万变", "颗粒度", "总而言之", "闭环"]
WRITING_AI_NOISE_EMPTY_PHRASES = ["高质量发展", "抓手", "全方位", "体系化", "方法论", "价值闭环", "协同效率", "有效提升"]
WRITING_AI_NOISE_TRANSITIONS = ["与此同时", "换句话说", "从某种意义上说", "某种程度上", "归根结底", "首先", "其次", "最后"]
WRITING_CONFLICT_CUES = ["但是", "却", "问题", "代价", "冲突", "反转", "危险", "机会", "不是", "而是"]
WRITING_EMOTION_CUES = ["愤怒", "焦虑", "震惊", "兴奋", "失望", "担心", "压力", "刺痛", "不安", "痛"]
WRITING_VALUE_CUES = ["这意味着", "你可以", "建议", "做法", "判断", "关键", "要点", "提醒", "如果你是", "值得"]
WRITING_NOVELTY_CUES = ["反常识", "真正", "少有人提", "容易忽略", "被低估", "被高估", "不是", "而是", "恰恰", "反过来"]
WRITING_TIMELINESS_CUES = ["今天", "刚刚", "最新", "本周", "这两天", "这次", "财报", "发布", "上线", "宣布", "增长", "下滑"]
WRITING_SHAREABILITY_CUES = ["记住", "一句话", "最重要", "真正的问题", "别忽略", "值得转发", "结论是", "核心判断"]
WRITING_FACT_UNITS = ["年", "月", "日", "%", "亿元", "万美元", "万人", "倍", "次", "小时", "分钟"]
WRITING_RISK_CUES = ["据传", "内部人士", "有人说", "一定会", "绝对", "毫无疑问", "普遍认为"]
SUPPORTED_WRITING_SCENES = {
    "articleWrite",
    "deepWrite",
    "prosePolish",
    "factCheck",
    "audienceProfile",
    "outlinePlan",
    "publishGuard",
}
DEFAULT_WRITING_EVAL_PROMPT = "你是中文爆款文章编辑。写作要短句、具体、有判断、有信息密度，避免机器腔。"
DEFAULT_WRITING_EVAL_SCORING_PROFILE: dict[str, Any] = {
    "qualityWeights": {
        "style": 1.0,
        "language": 1.0,
        "density": 1.0,
        "emotion": 1.0,
        "structure": 1.0,
    },
    "viralWeights": {
        "topicMomentum": 1.0,
        "headline": 1.0,
        "hook": 1.0,
        "shareability": 1.0,
        "readerValue": 1.0,
        "novelty": 1.0,
        "platformFit": 1.0,
    },
    "totalWeights": {
        "quality": 0.45,
        "viral": 0.55,
    },
    "penalties": {
        "aiNoiseMultiplier": 0.6,
    },
    "judge": {
        "enabled": 1.0,
        "ruleWeight": 0.65,
        "judgeWeight": 0.35,
        "temperature": 0.2,
    },
}
DEFAULT_WRITING_EVAL_LAYOUT_STRATEGY: dict[str, Any] = {
    "name": "",
    "tone": "",
    "paragraphLength": "",
    "titleStyle": "",
    "bannedWords": [],
    "bannedPunctuation": [],
}
WRITING_EVAL_APPLY_COMMAND_TEMPLATES: dict[str, dict[str, Any]] = {
    "deep_default_v1": {
        "code": "deep_default_v1",
        "name": "Deep Default v1",
        "description": "当前默认的 deepWriting apply command 组装顺序",
        "config": {
            "mode": "default",
            "intro": "请额外吸收以下 deepWriting 阶段改写指令：",
        },
    },
    "deep_structure_first_v1": {
        "code": "deep_structure_first_v1",
        "name": "Deep Structure First v1",
        "description": "优先强调章节结构与段落任务，再补核心观点与约束",
        "config": {
            "mode": "structure_first",
            "intro": "请优先按下列 deepWriting 结构蓝图改写全文：",
        },
    },
    "deep_constraints_first_v1": {
        "code": "deep_constraints_first_v1",
        "name": "Deep Constraints First v1",
        "description": "优先强调必须事实、表达约束与终稿清单，再组织结构",
        "config": {
            "mode": "constraints_first",
            "intro": "请先满足以下事实与表达约束，再完成 deepWriting 改写：",
        },
    },
}


def database_path() -> str:
    configured = os.environ.get("DATABASE_PATH")
    if configured:
        return configured
    if os.path.exists("./apps/web/data/huoziwriter.db"):
        return "./apps/web/data/huoziwriter.db"
    return "./data/huoziwriter.db"


def sqlite_only() -> bool:
    return not bool(os.environ.get("DATABASE_URL"))


def ensure_psycopg() -> tuple[Any, Any, Any]:
    try:
        import psycopg
        from psycopg.rows import dict_row
        from psycopg.types.json import Jsonb
    except ModuleNotFoundError as error:
        raise RuntimeError(
            "PostgreSQL mode requires psycopg. Install apps/worker-py/requirements.txt first."
        ) from error
    return psycopg, dict_row, Jsonb


@dataclass
class RuntimeConnection:
    kind: str

    def execute(self, query: str, params: tuple[Any, ...] = ()) -> int:
        raise NotImplementedError

    def fetchone(self, query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        raise NotImplementedError

    def fetchall(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        raise NotImplementedError

    def insert(self, query: str, params: tuple[Any, ...] = ()) -> int:
        raise NotImplementedError

    def commit(self) -> None:
        raise NotImplementedError

    def rollback(self) -> None:
        raise NotImplementedError

    def close(self) -> None:
        raise NotImplementedError


@dataclass
class SQLiteRuntimeConnection(RuntimeConnection):
    connection: sqlite3.Connection

    def __init__(self, connection: sqlite3.Connection):
        super().__init__("sqlite")
        self.connection = connection

    def execute(self, query: str, params: tuple[Any, ...] = ()) -> int:
        cursor = self.connection.execute(query, params)
        return int(cursor.rowcount)

    def fetchone(self, query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        row = self.connection.execute(query, params).fetchone()
        return dict(row) if row is not None else None

    def fetchall(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        rows = self.connection.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def insert(self, query: str, params: tuple[Any, ...] = ()) -> int:
        cursor = self.connection.execute(query, params)
        return int(cursor.lastrowid)

    def commit(self) -> None:
        self.connection.commit()

    def rollback(self) -> None:
        self.connection.rollback()

    def close(self) -> None:
        self.connection.close()


@dataclass
class PostgresRuntimeConnection(RuntimeConnection):
    connection: Any

    def __init__(self, connection_string: str):
        psycopg, dict_row, _ = ensure_psycopg()
        super().__init__("postgres")
        self.connection = psycopg.connect(connection_string, autocommit=False, row_factory=dict_row)

    @staticmethod
    def _sql(query: str) -> str:
        return query.replace("?", "%s")

    def execute(self, query: str, params: tuple[Any, ...] = ()) -> int:
        with self.connection.cursor() as cursor:
            cursor.execute(self._sql(query), params)
            return int(cursor.rowcount or 0)

    def fetchone(self, query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        with self.connection.cursor() as cursor:
            cursor.execute(self._sql(query), params)
            row = cursor.fetchone()
            return dict(row) if row is not None else None

    def fetchall(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self.connection.cursor() as cursor:
            cursor.execute(self._sql(query), params)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def insert(self, query: str, params: tuple[Any, ...] = ()) -> int:
        with self.connection.cursor() as cursor:
            cursor.execute(f"{self._sql(query)} RETURNING id", params)
            row = cursor.fetchone()
            if row is None:
                raise RuntimeError("postgres insert did not return id")
            return int(row["id"])

    def commit(self) -> None:
        self.connection.commit()

    def rollback(self) -> None:
        self.connection.rollback()

    def close(self) -> None:
        self.connection.close()


def column_exists(connection: RuntimeConnection, table: str, column: str) -> bool:
    if connection.kind == "sqlite":
        rows = connection.fetchall(f"PRAGMA table_info({table})")
        return any(str(row.get("name")) == column for row in rows)

    row = connection.fetchone(
        """
        SELECT 1 AS ok
        FROM information_schema.columns
        WHERE table_name = ? AND column_name = ?
        LIMIT 1
        """,
        (table, column),
    )
    return row is not None


def ensure_runtime_scheduler_schema(connection: RuntimeConnection) -> None:
    required_columns = [
        ("topic_sources", "owner_user_id"),
        ("topic_sources", "last_fetched_at"),
        ("topic_sources", "source_type"),
        ("topic_sources", "priority"),
        ("topic_items", "owner_user_id"),
    ]

    for table, column in required_columns:
        if column_exists(connection, table, column):
            continue
        if column == "last_fetched_at":
            definition = "TIMESTAMPTZ" if connection.kind == "postgres" else "TEXT"
        elif column == "priority":
            definition = "INTEGER DEFAULT 100"
        elif column == "source_type":
            definition = "TEXT DEFAULT 'news'"
        else:
            definition = "BIGINT" if connection.kind == "postgres" else "INTEGER"
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    connection.execute("UPDATE topic_sources SET priority = 100 WHERE priority IS NULL")
    connection.execute("UPDATE topic_sources SET source_type = 'news' WHERE source_type IS NULL")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS topic_sync_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sync_window_start TEXT NOT NULL UNIQUE,
          sync_window_label TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued',
          scheduled_source_count INTEGER NOT NULL DEFAULT 0,
          enqueued_job_count INTEGER NOT NULL DEFAULT 0,
          completed_source_count INTEGER NOT NULL DEFAULT 0,
          failed_source_count INTEGER NOT NULL DEFAULT 0,
          inserted_item_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          triggered_at TEXT NOT NULL,
          finished_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
        if connection.kind == "sqlite"
        else """
        CREATE TABLE IF NOT EXISTS topic_sync_runs (
          id BIGSERIAL PRIMARY KEY,
          sync_window_start TIMESTAMPTZ NOT NULL UNIQUE,
          sync_window_label TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued',
          scheduled_source_count INTEGER NOT NULL DEFAULT 0,
          enqueued_job_count INTEGER NOT NULL DEFAULT 0,
          completed_source_count INTEGER NOT NULL DEFAULT 0,
          failed_source_count INTEGER NOT NULL DEFAULT 0,
          inserted_item_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          triggered_at TIMESTAMPTZ NOT NULL,
          finished_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    connection.commit()


def get_topic_sync_window_label(window_start_utc: datetime) -> str:
    window_beijing = window_start_utc.astimezone(BEIJING_TIMEZONE)
    return f"{window_beijing.strftime('%Y-%m-%d')} {window_beijing.strftime('%H:%M')} 北京时间窗口"


def open_connection() -> RuntimeConnection:
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        return PostgresRuntimeConnection(database_url)

    connection = sqlite3.connect(database_path())
    connection.row_factory = sqlite3.Row
    return SQLiteRuntimeConnection(connection)


def json_value(connection: RuntimeConnection, value: Any) -> Any:
    if connection.kind == "sqlite":
        return json.dumps(value, ensure_ascii=False)
    _, _, Jsonb = ensure_psycopg()
    return Jsonb(value)


def timestamp_value(connection: RuntimeConnection, value: str | None) -> str | datetime | None:
    if value is None or connection.kind == "sqlite":
        return value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def parse_payload(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return {}
    return {}


def parse_json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def resolve_scope_user_ids(connection: RuntimeConnection, user_id: int) -> list[int]:
    user = connection.fetchone(
        "SELECT id, plan_code, is_active FROM users WHERE id = ?",
        (user_id,),
    )
    if user is None:
        raise RuntimeError("user not found")
    return [user_id]


def infer_provider(model: str) -> str:
    normalized = model.strip().lower()
    if normalized.startswith("gpt") or normalized.startswith("o"):
        return "openai"
    if normalized.startswith("claude"):
        return "anthropic"
    if normalized.startswith("gemini"):
        return "gemini"
    raise RuntimeError(f"unsupported provider for model: {model}")


def get_scene_route(connection: RuntimeConnection, scene_code: str) -> tuple[str, str | None]:
    route = connection.fetchone(
        "SELECT primary_model, fallback_model FROM ai_model_routes WHERE scene_code = ?",
        (scene_code,),
    )
    if route is None:
        if scene_code == "visionNote":
            return DEFAULT_VISION_MODEL, DEFAULT_VISION_FALLBACK_MODEL
        raise RuntimeError(f"scene route missing: {scene_code}")
    return str(route["primary_model"]), route.get("fallback_model")


def load_prompt_content(connection: RuntimeConnection, prompt_id: str, fallback: str) -> str:
    prompt = connection.fetchone(
        """
        SELECT prompt_content
        FROM prompt_versions
        WHERE prompt_id = ? AND is_active = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (prompt_id, True if connection.kind == "postgres" else 1),
    )
    if prompt is None or not prompt.get("prompt_content"):
        return fallback
    return str(prompt["prompt_content"])


def load_prompt_version(connection: RuntimeConnection, prompt_id: str, version: str) -> dict[str, Any] | None:
    return connection.fetchone(
        """
        SELECT prompt_id, version, name, function_name, prompt_content
        FROM prompt_versions
        WHERE prompt_id = ? AND version = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (prompt_id, version),
    )


def resolve_writing_eval_prompt(connection: RuntimeConnection, version_type: str, version_ref: str) -> dict[str, str]:
    normalized_type = version_type.strip()
    normalized_ref = version_ref.strip()
    if normalized_type == "prompt_version" and "@" in normalized_ref:
        prompt_id, version = normalized_ref.split("@", 1)
        prompt = load_prompt_version(connection, prompt_id.strip(), version.strip())
        if prompt is None:
            raise RuntimeError(f"prompt version not found: {normalized_ref}")
        function_name = str(prompt.get("function_name") or "").strip()
        scene_code = function_name if function_name in SUPPORTED_WRITING_SCENES else "articleWrite"
        prompt_content = str(prompt.get("prompt_content") or "").strip() or DEFAULT_WRITING_EVAL_PROMPT
        return {
            "label": normalized_ref,
            "promptId": prompt_id.strip(),
            "version": version.strip(),
            "sceneCode": scene_code,
            "promptContent": prompt_content,
        }

    return {
        "label": normalized_ref or "article_write@active",
        "promptId": "article_write",
        "version": "active",
        "sceneCode": "articleWrite",
        "promptContent": load_prompt_content(connection, "article_write", DEFAULT_WRITING_EVAL_PROMPT),
    }


def merge_scoring_config(defaults: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for key, value in defaults.items():
        override_value = overrides.get(key)
        if isinstance(value, dict):
            merged[key] = merge_scoring_config(value, override_value if isinstance(override_value, dict) else {})
        else:
            merged[key] = override_value if isinstance(override_value, (int, float)) else value
    for key, value in overrides.items():
        if key not in merged and isinstance(value, (int, float, str, bool, dict, list)):
            merged[key] = value
    return merged


def load_scoring_profile(connection: RuntimeConnection, profile_code: str) -> dict[str, Any] | None:
    return connection.fetchone(
        """
        SELECT code, name, description, config_json
        FROM writing_eval_scoring_profiles
        WHERE code = ?
        LIMIT 1
        """,
        (profile_code,),
    )


def resolve_writing_eval_scoring_profile(connection: RuntimeConnection, version_type: str, version_ref: str) -> dict[str, Any]:
    normalized_type = version_type.strip()
    normalized_ref = version_ref.strip()
    if normalized_type == "scoring_profile" and normalized_ref:
        profile = load_scoring_profile(connection, normalized_ref)
        if profile is None:
            raise RuntimeError(f"scoring profile not found: {normalized_ref}")
        config = parse_payload(profile.get("config_json"))
        merged = merge_scoring_config(DEFAULT_WRITING_EVAL_SCORING_PROFILE, config)
        return {
            "label": normalized_ref,
            "code": normalized_ref,
            "name": str(profile.get("name") or normalized_ref),
            "config": merged,
        }

    return {
        "label": "default",
        "code": "default",
        "name": "default",
        "config": DEFAULT_WRITING_EVAL_SCORING_PROFILE,
    }


def load_layout_strategy(connection: RuntimeConnection, layout_strategy_id: int) -> dict[str, Any] | None:
    return connection.fetchone(
        """
        SELECT id, code, name, description, meta, config_json
        FROM layout_strategies
        WHERE id = ?
        LIMIT 1
        """,
        (layout_strategy_id,),
    )


def merge_layout_strategy(defaults: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    merged: dict[str, Any] = dict(defaults)
    for key in ["name", "tone", "paragraphLength", "titleStyle"]:
        value = overrides.get(key)
        if isinstance(value, str):
            merged[key] = value.strip()
    for key in ["bannedWords", "bannedPunctuation"]:
        value = overrides.get(key)
        if isinstance(value, list):
            merged[key] = [str(item).strip() for item in value if str(item).strip()]
    return merged


def resolve_writing_eval_layout_strategy(connection: RuntimeConnection, version_type: str, version_ref: str) -> dict[str, Any]:
    normalized_type = version_type.strip()
    normalized_ref = version_ref.strip()
    if normalized_type == "layout_strategy" and normalized_ref:
        layout_strategy_id = int(normalized_ref)
        layout_strategy = load_layout_strategy(connection, layout_strategy_id)
        if layout_strategy is None:
            raise RuntimeError(f"layout strategy not found: {normalized_ref}")
        config = parse_payload(layout_strategy.get("config_json"))
        merged = merge_layout_strategy(
            DEFAULT_WRITING_EVAL_LAYOUT_STRATEGY,
            config if isinstance(config, dict) else {},
        )
        merged["name"] = str(layout_strategy.get("name") or merged.get("name") or f"layout_strategy#{layout_strategy_id}").strip()
        return {
            "label": f"{merged['name']}#{layout_strategy_id}",
            "id": layout_strategy_id,
            "code": str(layout_strategy.get("code") or "").strip(),
            "name": merged["name"],
            "config": merged,
        }

    return {
        "label": "default",
        "id": 0,
        "code": "default",
        "name": "default",
        "config": DEFAULT_WRITING_EVAL_LAYOUT_STRATEGY,
    }


def resolve_writing_eval_apply_command_template(version_type: str, version_ref: str) -> dict[str, Any]:
    normalized_type = version_type.strip()
    normalized_ref = version_ref.strip()
    if normalized_type == "apply_command_template" and normalized_ref:
        template = WRITING_EVAL_APPLY_COMMAND_TEMPLATES.get(normalized_ref)
        if template is None:
            raise RuntimeError(f"apply command template not found: {normalized_ref}")
        return {
            "label": normalized_ref,
            "code": normalized_ref,
            "name": str(template.get("name") or normalized_ref),
            "config": dict(template.get("config") or {}),
        }
    return {
        "label": "default",
        "code": "default",
        "name": "default",
        "config": {
            "mode": "default",
            "intro": "请额外吸收以下 deepWriting 阶段改写指令：",
        },
    }


def parse_json_object(text: str) -> dict[str, Any]:
    trimmed = text.strip()
    fenced = None
    if "```" in trimmed:
        start = trimmed.find("```")
        end = trimmed.rfind("```")
        if end > start:
            fenced = trimmed[start + 3 : end].strip()
            if fenced.lower().startswith("json"):
                fenced = fenced[4:].strip()
    candidate = fenced or trimmed
    first = candidate.find("{")
    last = candidate.rfind("}")
    if first < 0 or last <= first:
        raise RuntimeError("model output did not contain json object")
    return json.loads(candidate[first : last + 1])


def clamp_score(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return max(minimum, min(maximum, value))


def round_score(value: float) -> float:
    return round(clamp_score(value), 2)


def count_phrase_hits(content: str, phrases: list[str]) -> int:
    return sum(max(0, content.count(phrase)) for phrase in phrases)


def split_sentences(content: str) -> list[str]:
    return [item.strip() for item in re.split(r"[。！？!?；;\n]+", content) if item.strip()]


def split_paragraphs(content: str) -> list[str]:
    return [item.strip() for item in re.split(r"\n{2,}|\r\n\r\n", content) if item.strip()]


def markdown_to_plain_text(content: str) -> str:
    text = re.sub(r"```[\s\S]*?```", " ", content)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[*_>~-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_strings(value: Any, limit: int = 10) -> list[str]:
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, list):
        items: list[str] = []
        for entry in value:
            if isinstance(entry, str) and entry.strip():
                items.append(entry.strip())
            if len(items) >= limit:
                break
        return items
    return []


def flatten_text_fragments(value: Any, limit: int = 30) -> list[str]:
    items: list[str] = []

    def visit(node: Any) -> None:
        if len(items) >= limit:
            return
        if isinstance(node, str):
            text = node.strip()
            if text:
                items.append(text)
            return
        if isinstance(node, list):
            for entry in node:
                visit(entry)
                if len(items) >= limit:
                    return
            return
        if isinstance(node, dict):
            for entry in node.values():
                visit(entry)
                if len(items) >= limit:
                    return

    visit(value)
    return items[:limit]


def build_case_generation_prompt(case_row: dict[str, Any]) -> str:
    input_payload = parse_json_value(case_row.get("input_payload_json")) or {}
    expected_constraints = parse_json_value(case_row.get("expected_constraints_json")) or {}
    viral_targets = parse_json_value(case_row.get("viral_targets_json")) or {}
    reference_bad_patterns = parse_json_value(case_row.get("reference_bad_patterns_json")) or []
    reference_good_output = str(case_row.get("reference_good_output") or "").strip()

    lines = [
        "请完成一篇中文文章写作任务。",
        "必须返回 JSON，不要解释，不要 markdown 代码块。",
        '返回结构：{"title":"字符串","lead":"字符串","markdown":"字符串"}',
        "要求：",
        "- title 要有冲突、收益或判断，不要标题党。",
        "- lead 用 2 到 3 句建立问题压强或反常识切口。",
        "- markdown 输出完整正文，段落短，避免机器腔和空话。",
        "- 只能使用输入中明确给出的信息或可直接推导的信息，不能编造机构、数字、引语或案例。",
        f"- 任务编码：{str(case_row.get('task_code') or '').strip()}",
        f"- 任务类型：{str(case_row.get('task_type') or '').strip()}",
        f"- 难度：{str(case_row.get('difficulty_level') or '').strip()}",
        f"- 选题：{str(case_row.get('topic_title') or '').strip()}",
        "",
        "输入上下文：",
        json.dumps(input_payload, ensure_ascii=False, indent=2),
        "",
        "固定约束：",
        json.dumps(expected_constraints, ensure_ascii=False, indent=2),
        "",
        "爆款目标：",
        json.dumps(viral_targets, ensure_ascii=False, indent=2),
    ]
    bad_patterns = extract_strings(reference_bad_patterns, 10)
    if bad_patterns:
        lines.extend(["", "必须避免的坏模式：", json.dumps(bad_patterns, ensure_ascii=False)])
    if reference_good_output:
        lines.extend(["", "参考优质输出片段（只学习表达力度，不要照抄）：", reference_good_output[:1800]])
    return "\n".join(lines).strip()


def build_reference_markdown(case_row: dict[str, Any]) -> str:
    input_payload = parse_json_value(case_row.get("input_payload_json")) or {}
    reference_good_output = str(case_row.get("reference_good_output") or "").strip()
    draft_candidates = [
        str(input_payload.get("currentDraft") or "").strip() if isinstance(input_payload, dict) else "",
        str(input_payload.get("draftMarkdown") or "").strip() if isinstance(input_payload, dict) else "",
        str(input_payload.get("markdown") or "").strip() if isinstance(input_payload, dict) else "",
        reference_good_output,
    ]
    for candidate in draft_candidates:
        if candidate:
            return candidate
    source_fragments = flatten_text_fragments(input_payload, 10)
    topic_title = str(case_row.get("topic_title") or "未命名选题").strip() or "未命名选题"
    if source_fragments:
        return f"# {topic_title}\n\n" + "\n\n".join(source_fragments[:4])
    return f"# {topic_title}\n\n当前样本没有提供参考正文。"


def normalize_writing_eval_experiment_mode(value: Any) -> str:
    normalized = str(value or "").strip()
    if normalized in {"title_only", "lead_only"}:
        return normalized
    return "full_article"


def normalize_writing_eval_decision_mode(value: Any) -> str:
    normalized = str(value or "").strip()
    if normalized in {"auto_keep", "auto_keep_or_discard"}:
        return normalized
    return "manual_review"


def normalize_writing_eval_resolution_status(value: Any) -> str:
    normalized = str(value or "").strip()
    if normalized in {"keep", "discard", "rollback"}:
        return normalized
    return "pending"


def extract_reference_document(case_row: dict[str, Any]) -> dict[str, str]:
    topic_title = str(case_row.get("topic_title") or "未命名选题").strip() or "未命名选题"
    reference_markdown = build_reference_markdown(case_row).strip()
    lines = reference_markdown.splitlines()
    title = topic_title
    body_markdown = reference_markdown
    if lines and re.match(r"^\s*#\s+", lines[0]):
        title = re.sub(r"^\s*#\s+", "", lines[0]).strip() or topic_title
        body_markdown = "\n".join(lines[1:]).strip()
    paragraphs = split_paragraphs(body_markdown or reference_markdown)
    lead = paragraphs[0] if paragraphs else topic_title
    return {
        "title": title,
        "lead": lead,
        "markdown": reference_markdown,
        "body_markdown": body_markdown,
        "topic_title": topic_title,
    }


def get_stage_artifact_payloads(case_row: dict[str, Any]) -> dict[str, Any]:
    payloads = parse_json_value(case_row.get("stage_artifact_payloads_json")) or {}
    return payloads if isinstance(payloads, dict) else {}


def extract_writing_eval_must_use_facts(case_row: dict[str, Any]) -> list[str]:
    stage_payloads = get_stage_artifact_payloads(case_row)
    deep_payload = stage_payloads.get("deepWriting")
    if not isinstance(deep_payload, dict):
        deep_payload = stage_payloads.get("deep_writing")
    if isinstance(deep_payload, dict):
        must_use = extract_strings(deep_payload.get("mustUseFacts"), 8)
        if must_use:
            return must_use
    input_payload = parse_json_value(case_row.get("input_payload_json")) or {}
    return extract_strings(input_payload.get("sourceFacts"), 8)


def build_deep_writing_apply_guide(case_row: dict[str, Any], apply_command_template: dict[str, Any] | None = None) -> str:
    stage_payloads = get_stage_artifact_payloads(case_row)
    deep_payload = stage_payloads.get("deepWriting")
    if not isinstance(deep_payload, dict):
        deep_payload = stage_payloads.get("deep_writing")
    if not isinstance(deep_payload, dict) or not deep_payload:
        return ""

    sections = (
        [
            " / ".join(
                item
                for item in [
                    f"{index + 1}. {str(section.get('heading') or '').strip() or f'章节 {index + 1}'}",
                    f"目标：{str(section.get('goal') or '').strip()}" if str(section.get("goal") or "").strip() else "",
                    f"段落任务：{str(section.get('paragraphMission') or '').strip()}" if str(section.get("paragraphMission") or "").strip() else "",
                    (
                        "证据提示：" + "；".join(extract_strings(section.get("evidenceHints"), 4))
                        if extract_strings(section.get("evidenceHints"), 4)
                        else ""
                    ),
                    f"衔接：{str(section.get('transition') or '').strip()}" if str(section.get("transition") or "").strip() else "",
                ]
                if item
            )
            for index, section in enumerate([item for item in deep_payload.get("sectionBlueprint", []) if isinstance(item, dict)][:6])
        ]
        if isinstance(deep_payload.get("sectionBlueprint"), list)
        else []
    )
    history_plan = (
        [
            "；".join(
                item
                for item in [
                    f"旧文：{str(entry.get('title') or '').strip() or '未命名旧文'}",
                    f"使用时机：{str(entry.get('useWhen') or '').strip()}" if str(entry.get("useWhen") or "").strip() else "",
                    f"桥接句：{str(entry.get('bridgeSentence') or '').strip()}" if str(entry.get("bridgeSentence") or "").strip() else "",
                ]
                if item
            )
            for entry in [item for item in deep_payload.get("historyReferencePlan", []) if isinstance(item, dict)][:2]
        ]
        if isinstance(deep_payload.get("historyReferencePlan"), list)
        else []
    )

    template_config = apply_command_template.get("config") if isinstance(apply_command_template, dict) else {}
    if not isinstance(template_config, dict):
        template_config = {}
    mode = str(template_config.get("mode") or "default").strip() or "default"
    intro = str(template_config.get("intro") or "请额外吸收以下 deepWriting 阶段改写指令：").strip()

    core_lines = [
        f"采用标题：{str(deep_payload.get('selectedTitle') or '').strip()}" if str(deep_payload.get("selectedTitle") or "").strip() else "",
        f"核心观点：{str(deep_payload.get('centralThesis') or '').strip()}" if str(deep_payload.get("centralThesis") or "").strip() else "",
        f"写作角度：{str(deep_payload.get('writingAngle') or '').strip()}" if str(deep_payload.get("writingAngle") or "").strip() else "",
        f"开头策略：{str(deep_payload.get('openingStrategy') or '').strip()}" if str(deep_payload.get("openingStrategy") or "").strip() else "",
        f"目标情绪：{str(deep_payload.get('targetEmotion') or '').strip()}" if str(deep_payload.get("targetEmotion") or "").strip() else "",
        f"结尾策略：{str(deep_payload.get('endingStrategy') or '').strip()}" if str(deep_payload.get("endingStrategy") or "").strip() else "",
    ]
    structure_lines = [
        f"写作结构：\n{chr(10).join(sections)}" if sections else "",
        f"历史文章自然引用：{' | '.join(history_plan)}" if history_plan else "",
    ]
    constraint_lines = [
        (
            "必须吃透的事实：" + "；".join(extract_strings(deep_payload.get("mustUseFacts"), 6))
            if extract_strings(deep_payload.get("mustUseFacts"), 6)
            else ""
        ),
        (
            "表达约束：" + "；".join(extract_strings(deep_payload.get("voiceChecklist"), 6))
            if extract_strings(deep_payload.get("voiceChecklist"), 6)
            else ""
        ),
        (
            "重点避开这些死刑词：" + "、".join(extract_strings(deep_payload.get("bannedWordWatchlist"), 8))
            if extract_strings(deep_payload.get("bannedWordWatchlist"), 8)
            else ""
        ),
        (
            "终稿自检：" + "；".join(extract_strings(deep_payload.get("finalChecklist"), 6))
            if extract_strings(deep_payload.get("finalChecklist"), 6)
            else ""
        ),
    ]

    if mode == "structure_first":
        lines = [intro, *structure_lines, *core_lines, *constraint_lines]
    elif mode == "constraints_first":
        lines = [intro, *constraint_lines, *core_lines, *structure_lines]
    else:
        lines = [intro, *core_lines, *structure_lines, *constraint_lines]
    guide_lines = [item for item in lines if item]
    return "\n".join(guide_lines).strip() if len(guide_lines) > 1 else ""


def build_style_guide(layout_strategy: dict[str, Any] | None) -> str:
    if not layout_strategy:
        return ""
    config = layout_strategy.get("config")
    if not isinstance(config, dict):
        return ""
    lines = [
        f"当前启用版式策略：{layout_strategy.get('name')}" if str(layout_strategy.get("name") or "").strip() else None,
        f"语气要求：{config.get('tone')}" if str(config.get("tone") or "").strip() else None,
        f"段落长度：{config.get('paragraphLength')}" if str(config.get("paragraphLength") or "").strip() else None,
        f"标题风格：{config.get('titleStyle')}" if str(config.get("titleStyle") or "").strip() else None,
        (
            "附加禁词：" + "、".join(str(item).strip() for item in config.get("bannedWords", []) if str(item).strip())
            if isinstance(config.get("bannedWords"), list) and any(str(item).strip() for item in config.get("bannedWords", []))
            else None
        ),
        (
            "禁用标点：" + " ".join(str(item).strip() for item in config.get("bannedPunctuation", []) if str(item).strip())
            if isinstance(config.get("bannedPunctuation"), list) and any(str(item).strip() for item in config.get("bannedPunctuation", []))
            else None
        ),
    ]
    style_lines = [item for item in lines if item]
    if not style_lines:
        return ""
    return "\n".join(["请额外遵守以下版式策略：", *style_lines]).strip()


def build_scene_generation_prompt(
    case_row: dict[str, Any],
    prompt_meta: dict[str, str],
    experiment_mode: str = "full_article",
    layout_strategy: dict[str, Any] | None = None,
    apply_command_template: dict[str, Any] | None = None,
) -> str:
    reference_document = extract_reference_document(case_row)
    style_guide = build_style_guide(layout_strategy)
    deep_writing_guide = build_deep_writing_apply_guide(case_row, apply_command_template)
    if experiment_mode == "title_only":
        input_payload = parse_json_value(case_row.get("input_payload_json")) or {}
        viral_targets = parse_json_value(case_row.get("viral_targets_json")) or {}
        expected_constraints = parse_json_value(case_row.get("expected_constraints_json")) or {}
        lines = [
            "请输出 JSON，不要解释，不要 markdown 代码块。",
            '字段：{"workingTitle":"字符串","titleOptions":[{"title":"字符串","styleLabel":"字符串","angle":"字符串","reason":"字符串","riskHint":"字符串"}],"selectionReason":"字符串"}',
            "只优化标题，不改写正文和首段，不新增事实、数据、案例和承诺。",
            "titleOptions 固定返回 3 个标题，分别体现观点判断型、问题切口型、反差结果型。",
            "标题必须可兑现，优先提升点击力、清晰度和传播性，不要标题党。",
            f"选题：{reference_document['topic_title']}",
            f"当前标题：{reference_document['title']}",
            f"当前首段：{reference_document['lead']}",
        ]
        if style_guide:
            lines.extend([style_guide, ""])
        if deep_writing_guide:
            lines.extend([deep_writing_guide, ""])
        lines.extend(
            [
                "输入上下文：",
                json.dumps(input_payload, ensure_ascii=False, indent=2),
                "爆款目标：",
                json.dumps(viral_targets, ensure_ascii=False, indent=2),
                "固定约束：",
                json.dumps(expected_constraints, ensure_ascii=False, indent=2),
            ]
        )
        return "\n".join(lines).strip()

    if experiment_mode == "lead_only":
        lines = [
            "请输出 JSON，不要解释，不要 markdown 代码块。",
            '字段：{"rewrittenLead":"字符串","punchlines":[""],"rhythmAdvice":[""]}',
            "只改写首段表达和句子力度，不改标题，不改后续正文，不新增事实、数据和案例。",
            "rewrittenLead 长度控制在 80-160 字，必须更快进入冲突、判断或利益点。",
            f"选题：{reference_document['topic_title']}",
            f"当前标题：{reference_document['title']}",
        ]
        if style_guide:
            lines.extend([style_guide, ""])
        if deep_writing_guide:
            lines.extend([deep_writing_guide, ""])
        lines.extend(
            [
                "参考正文：",
                reference_document["markdown"],
            ]
        )
        return "\n".join(lines).strip()

    if prompt_meta["sceneCode"] == "outlinePlan":
        input_payload = parse_json_value(case_row.get("input_payload_json")) or {}
        viral_targets = parse_json_value(case_row.get("viral_targets_json")) or {}
        expected_constraints = parse_json_value(case_row.get("expected_constraints_json")) or {}
        lines = [
            "请输出 JSON，不要解释，不要 markdown 代码块。",
            '字段：{"workingTitle":"字符串","titleOptions":[{"title":"字符串","styleLabel":"字符串","angle":"字符串","reason":"字符串","riskHint":"字符串"}],"openingHook":"字符串","titleStrategyNotes":[""]}',
            "titleOptions 固定返回 3 个标题，分别体现观点判断型、问题切口型、反差结果型。",
            "openingHook 用 2-3 句建立第一屏留存，不要展开整篇正文。",
            "标题必须和正文可兑现，不要标题党。",
            f"选题：{str(case_row.get('topic_title') or '').strip()}",
        ]
        if style_guide:
            lines.extend([style_guide, ""])
        if deep_writing_guide:
            lines.extend([deep_writing_guide, ""])
        lines.extend(
            [
                "输入上下文：",
                json.dumps(input_payload, ensure_ascii=False, indent=2),
                "爆款目标：",
                json.dumps(viral_targets, ensure_ascii=False, indent=2),
                "固定约束：",
                json.dumps(expected_constraints, ensure_ascii=False, indent=2),
            ]
        )
        return "\n".join(lines).strip()

    if prompt_meta["sceneCode"] == "prosePolish":
        lines = [
            "请输出 JSON，不要解释，不要 markdown 代码块。",
            '字段：{"rewrittenLead":"字符串","punchlines":[""],"rhythmAdvice":[""]}',
            "只改写首段表达和句子力度，不新增事实、数据和案例。",
            "rewrittenLead 长度控制在 80-160 字，必须更快进入冲突或判断。",
            f"选题：{str(case_row.get('topic_title') or '').strip()}",
        ]
        if style_guide:
            lines.extend([style_guide, ""])
        if deep_writing_guide:
            lines.extend([deep_writing_guide, ""])
        lines.extend(
            [
                "参考正文：",
                build_reference_markdown(case_row),
            ]
        )
        return "\n".join(lines).strip()

    base_prompt = build_case_generation_prompt(case_row)
    guide_blocks = [block for block in [style_guide, deep_writing_guide, base_prompt] if block]
    return "\n\n".join(guide_blocks).strip()


def call_text_model(model: str, system_prompt: str, user_prompt: str, temperature: float) -> str:
    provider = infer_provider(model)
    if provider == "openai":
        return call_openai_text(model, system_prompt, user_prompt, temperature)
    if provider == "anthropic":
        return call_anthropic_text(model, system_prompt, user_prompt, temperature)
    return call_gemini_text(model, system_prompt, user_prompt, temperature)


def normalize_generated_document(raw_text: str, topic_title: str) -> dict[str, str]:
    fallback_title = topic_title.strip() or "未命名选题"
    try:
        payload = parse_json_object(raw_text)
        title = str(payload.get("title") or "").strip() or fallback_title
        lead = str(payload.get("lead") or "").strip()
        markdown = str(payload.get("markdown") or "").strip()
        if not markdown:
            markdown = lead or title
        if not lead:
            paragraphs = split_paragraphs(markdown)
            lead = paragraphs[0] if paragraphs else markdown[:120]
        return {"title": title, "lead": lead, "markdown": markdown}
    except Exception:
        cleaned = raw_text.strip()
        paragraphs = split_paragraphs(cleaned)
        lead = paragraphs[0] if paragraphs else cleaned[:120]
        return {
            "title": fallback_title,
            "lead": lead,
            "markdown": cleaned or lead or fallback_title,
        }


def normalize_scene_generated_document(
    raw_text: str,
    case_row: dict[str, Any],
    prompt_meta: dict[str, str],
    experiment_mode: str = "full_article",
) -> dict[str, str]:
    topic_title = str(case_row.get("topic_title") or "").strip()
    reference_document = extract_reference_document(case_row)
    if experiment_mode == "title_only":
        try:
            payload = parse_json_object(raw_text)
            title_options = payload.get("titleOptions")
            chosen_title = str(payload.get("workingTitle") or "").strip() or reference_document["title"]
            if isinstance(title_options, list):
                for item in title_options:
                    if isinstance(item, dict) and str(item.get("title") or "").strip():
                        chosen_title = str(item.get("title") or "").strip()
                        break
            body_markdown = reference_document["body_markdown"].strip()
            markdown = f"# {chosen_title}\n\n{body_markdown}".strip() if body_markdown else f"# {chosen_title}\n\n{reference_document['lead']}"
            return {
                "title": chosen_title,
                "lead": reference_document["lead"],
                "markdown": markdown.strip(),
            }
        except Exception:
            fallback = normalize_generated_document(raw_text, reference_document["title"])
            body_markdown = reference_document["body_markdown"].strip()
            title = fallback["title"].strip() or reference_document["title"]
            markdown = f"# {title}\n\n{body_markdown}".strip() if body_markdown else f"# {title}\n\n{reference_document['lead']}"
            return {
                "title": title,
                "lead": reference_document["lead"],
                "markdown": markdown.strip(),
            }

    if experiment_mode == "lead_only":
        try:
            payload = parse_json_object(raw_text)
            rewritten_lead = str(payload.get("rewrittenLead") or "").strip() or reference_document["lead"]
            body_paragraphs = split_paragraphs(reference_document["body_markdown"])
            if body_paragraphs:
                body_paragraphs[0] = rewritten_lead
            else:
                body_paragraphs = [rewritten_lead]
            body_markdown = "\n\n".join(body_paragraphs).strip()
            markdown = f"# {reference_document['title']}\n\n{body_markdown}".strip()
            return {
                "title": reference_document["title"],
                "lead": rewritten_lead,
                "markdown": markdown,
            }
        except Exception:
            fallback = normalize_generated_document(raw_text, reference_document["title"])
            rewritten_lead = fallback["lead"].strip() or reference_document["lead"]
            body_paragraphs = split_paragraphs(reference_document["body_markdown"])
            if body_paragraphs:
                body_paragraphs[0] = rewritten_lead
            else:
                body_paragraphs = [rewritten_lead]
            body_markdown = "\n\n".join(body_paragraphs).strip()
            markdown = f"# {reference_document['title']}\n\n{body_markdown}".strip()
            return {
                "title": reference_document["title"],
                "lead": rewritten_lead,
                "markdown": markdown,
            }

    if prompt_meta["sceneCode"] == "outlinePlan":
        try:
            payload = parse_json_object(raw_text)
            title_options = payload.get("titleOptions")
            chosen_title = topic_title or "未命名选题"
            if isinstance(title_options, list):
                for item in title_options:
                    if isinstance(item, dict) and str(item.get("title") or "").strip():
                        chosen_title = str(item.get("title") or "").strip()
                        break
            if not chosen_title:
                chosen_title = str(payload.get("workingTitle") or "").strip() or topic_title or "未命名选题"
            opening_hook = str(payload.get("openingHook") or "").strip()
            reference_markdown = build_reference_markdown(case_row)
            markdown = f"# {chosen_title}\n\n{opening_hook or topic_title}\n\n{reference_markdown}"
            return {
                "title": chosen_title,
                "lead": opening_hook or topic_title or chosen_title,
                "markdown": markdown.strip(),
            }
        except Exception:
            return normalize_generated_document(raw_text, topic_title)

    if prompt_meta["sceneCode"] == "prosePolish":
        try:
            payload = parse_json_object(raw_text)
            rewritten_lead = str(payload.get("rewrittenLead") or "").strip()
            reference_markdown = build_reference_markdown(case_row)
            paragraphs = split_paragraphs(reference_markdown)
            if paragraphs:
                paragraphs[0] = rewritten_lead or paragraphs[0]
            markdown = "\n\n".join(paragraphs) if paragraphs else rewritten_lead or reference_markdown
            return {
                "title": topic_title or "未命名选题",
                "lead": rewritten_lead or (paragraphs[0] if paragraphs else topic_title or "未命名选题"),
                "markdown": markdown.strip(),
            }
        except Exception:
            return normalize_generated_document(raw_text, topic_title)

    return normalize_generated_document(raw_text, topic_title)


def analyze_ai_noise_for_writing(content: str) -> dict[str, Any]:
    text = content.strip()
    if not text:
        return {"score": 0.0, "findings": ["输出为空"]}
    banned_hits = count_phrase_hits(text, WRITING_AI_NOISE_BANNED_PHRASES)
    empty_hits = count_phrase_hits(text, WRITING_AI_NOISE_EMPTY_PHRASES)
    transition_hits = count_phrase_hits(text, WRITING_AI_NOISE_TRANSITIONS)
    sentences = split_sentences(text)
    long_sentences = sum(1 for sentence in sentences if len(sentence) >= 38)
    repeated_connector_count = len(re.findall(r"我们需要|在这个|通过|进行", text))
    raw_score = (
        banned_hits * 14
        + empty_hits * 9
        + transition_hits * 6
        + long_sentences * 8
        + max(0, repeated_connector_count - 2) * 4
    )
    findings: list[str] = []
    if banned_hits:
        findings.append(f"命中机器腔高风险短语 {banned_hits} 次")
    if empty_hits:
        findings.append(f"命中空话短语 {empty_hits} 次")
    if transition_hits >= 2:
        findings.append(f"转折连接词偏多 {transition_hits} 次")
    if long_sentences:
        findings.append(f"检测到长句 {long_sentences} 句")
    if repeated_connector_count > 2:
        findings.append(f"模板化连接词重复 {repeated_connector_count} 次")
    return {
        "score": round_score(min(100.0, float(raw_score))),
        "findings": findings,
        "longSentenceCount": long_sentences,
        "repeatedConnectorCount": repeated_connector_count,
    }


def keyword_overlap_ratio(keywords: list[str], content: str) -> float:
    cleaned = [item for item in keywords if len(item) >= 2]
    if not cleaned:
        return 0.0
    hits = sum(1 for item in cleaned if item in content)
    return hits / len(cleaned)


def weighted_average(scores: list[tuple[float, float]]) -> float:
    total_weight = sum(max(0.0, float(weight)) for _, weight in scores)
    if total_weight <= 0:
        total_weight = float(len(scores)) or 1.0
        return sum(value for value, _ in scores) / total_weight
    return sum(value * max(0.0, float(weight)) for value, weight in scores) / total_weight


def apply_weight_multipliers(weights: dict[str, Any], multipliers: dict[str, float]) -> dict[str, float]:
    adjusted = {key: float(value) for key, value in weights.items() if isinstance(value, (int, float))}
    for key, multiplier in multipliers.items():
        adjusted[key] = float(adjusted.get(key, 1.0)) * float(multiplier)
    return adjusted


def build_writing_eval_judge_prompt(
    case_row: dict[str, Any],
    generated: dict[str, str],
    experiment_mode: str,
) -> str:
    input_payload = parse_json_value(case_row.get("input_payload_json")) or {}
    expected_constraints = parse_json_value(case_row.get("expected_constraints_json")) or {}
    viral_targets = parse_json_value(case_row.get("viral_targets_json")) or {}
    must_use_facts = extract_writing_eval_must_use_facts(case_row)
    bad_patterns = extract_strings(parse_json_value(case_row.get("reference_bad_patterns_json")) or [], 8)
    reference_good_output = str(case_row.get("reference_good_output") or "").strip()
    lines = [
        "请作为写作评测裁判，基于任务、事实边界、爆款目标和输出结果打分。",
        "输出 JSON，不要解释，不要 markdown 代码块。",
        (
            '字段：{"scores":{"styleScore":0-10,"languageScore":0-10,"densityScore":0-10,"emotionScore":0-10,'
            '"structureScore":0-10,"topicMomentumScore":0-10,"headlineScore":0-10,"hookScore":0-10,'
            '"shareabilityScore":0-10,"readerValueScore":0-10,"noveltyScore":0-10,"platformFitScore":0-10},'
            '"reasons":{"style":"字符串","language":"字符串","density":"字符串","emotion":"字符串","structure":"字符串",'
            '"topicMomentum":"字符串","headline":"字符串","hook":"字符串","shareability":"字符串","readerValue":"字符串","novelty":"字符串","platformFit":"字符串"},'
            '"problems":["字符串"],"keepRecommendation":"keep|discard|observe","summary":"字符串"}'
        ),
        "打分时要重点识别：标题兑现度、hook 后是否掉速、事实覆盖、机器腔、情绪操纵、标题党风险。",
        f"任务编码：{str(case_row.get('task_code') or '').strip()}",
        f"任务类型：{str(case_row.get('task_type') or '').strip()}",
        f"实验模式：{experiment_mode}",
        f"选题：{str(case_row.get('topic_title') or '').strip()}",
        "输入上下文：",
        json.dumps(input_payload, ensure_ascii=False, indent=2),
        "固定约束：",
        json.dumps(expected_constraints, ensure_ascii=False, indent=2),
        "爆款目标：",
        json.dumps(viral_targets, ensure_ascii=False, indent=2),
        "必须覆盖的事实：",
        json.dumps(must_use_facts, ensure_ascii=False),
        "必须规避的坏模式：",
        json.dumps(bad_patterns, ensure_ascii=False),
        "参考好稿（只作为表达力度参考，不是判定唯一标准）：",
        reference_good_output[:1800] if reference_good_output else "无",
        "待评测输出标题：",
        generated["title"],
        "待评测输出开头：",
        generated["lead"],
        "待评测输出正文：",
        generated["markdown"][:7000],
    ]
    return "\n".join(lines).strip()


def normalize_writing_eval_judge_score(value: Any) -> float | None:
    if not isinstance(value, (int, float)):
        return None
    numeric = float(value)
    if numeric <= 10.0:
        numeric *= 10.0
    return round_score(numeric)


def blend_rule_and_judge_score(rule_score: float, judge_score: float | None, rule_weight: float, judge_weight: float) -> float:
    if judge_score is None:
        return round_score(rule_score)
    normalized_rule_weight = max(0.0, float(rule_weight))
    normalized_judge_weight = max(0.0, float(judge_weight))
    total_weight = normalized_rule_weight + normalized_judge_weight
    if total_weight <= 0:
        return round_score(rule_score)
    return round_score((rule_score * normalized_rule_weight + judge_score * normalized_judge_weight) / total_weight)


def run_writing_eval_judge(
    model: str,
    case_row: dict[str, Any],
    generated: dict[str, str],
    experiment_mode: str,
    temperature: float,
) -> dict[str, Any]:
    user_prompt = build_writing_eval_judge_prompt(case_row, generated, experiment_mode)
    raw_output = call_text_model(model, DEFAULT_WRITING_EVAL_JUDGE_PROMPT, user_prompt, temperature)
    payload = parse_json_object(raw_output)
    score_payload = payload.get("scores")
    reason_payload = payload.get("reasons")
    if not isinstance(score_payload, dict):
        score_payload = {}
    if not isinstance(reason_payload, dict):
        reason_payload = {}
    normalized_scores = {
        "styleScore": normalize_writing_eval_judge_score(score_payload.get("styleScore")),
        "languageScore": normalize_writing_eval_judge_score(score_payload.get("languageScore")),
        "densityScore": normalize_writing_eval_judge_score(score_payload.get("densityScore")),
        "emotionScore": normalize_writing_eval_judge_score(score_payload.get("emotionScore")),
        "structureScore": normalize_writing_eval_judge_score(score_payload.get("structureScore")),
        "topicMomentumScore": normalize_writing_eval_judge_score(score_payload.get("topicMomentumScore")),
        "headlineScore": normalize_writing_eval_judge_score(score_payload.get("headlineScore")),
        "hookScore": normalize_writing_eval_judge_score(score_payload.get("hookScore")),
        "shareabilityScore": normalize_writing_eval_judge_score(score_payload.get("shareabilityScore")),
        "readerValueScore": normalize_writing_eval_judge_score(score_payload.get("readerValueScore")),
        "noveltyScore": normalize_writing_eval_judge_score(score_payload.get("noveltyScore")),
        "platformFitScore": normalize_writing_eval_judge_score(score_payload.get("platformFitScore")),
    }
    keep_recommendation = str(payload.get("keepRecommendation") or "").strip().lower()
    if keep_recommendation not in {"keep", "discard", "observe"}:
        keep_recommendation = "observe"
    return {
        "status": "ok",
        "model": model,
        "scores": normalized_scores,
        "reasons": {
            "style": str(reason_payload.get("style") or "").strip(),
            "language": str(reason_payload.get("language") or "").strip(),
            "density": str(reason_payload.get("density") or "").strip(),
            "emotion": str(reason_payload.get("emotion") or "").strip(),
            "structure": str(reason_payload.get("structure") or "").strip(),
            "topicMomentum": str(reason_payload.get("topicMomentum") or "").strip(),
            "headline": str(reason_payload.get("headline") or "").strip(),
            "hook": str(reason_payload.get("hook") or "").strip(),
            "shareability": str(reason_payload.get("shareability") or "").strip(),
            "readerValue": str(reason_payload.get("readerValue") or "").strip(),
            "novelty": str(reason_payload.get("novelty") or "").strip(),
            "platformFit": str(reason_payload.get("platformFit") or "").strip(),
        },
        "problems": extract_strings(payload.get("problems"), 8),
        "summary": str(payload.get("summary") or "").strip(),
        "keepRecommendation": keep_recommendation,
    }


def score_writing_result(
    case_row: dict[str, Any],
    generated: dict[str, str],
    prompt_meta: dict[str, str],
    model: str,
    scoring_profile: dict[str, Any],
    experiment_mode: str = "full_article",
) -> dict[str, Any]:
    title = generated["title"].strip()
    lead = generated["lead"].strip()
    markdown = generated["markdown"].strip()
    plain_text = markdown_to_plain_text(markdown)
    combined_text = "\n".join([title, lead, plain_text]).strip()
    sentences = split_sentences(combined_text)
    paragraphs = split_paragraphs(markdown)
    input_payload = parse_json_value(case_row.get("input_payload_json")) or {}
    expected_constraints = parse_json_value(case_row.get("expected_constraints_json")) or {}
    viral_targets = parse_json_value(case_row.get("viral_targets_json")) or {}
    reference_bad_patterns = extract_strings(parse_json_value(case_row.get("reference_bad_patterns_json")) or [], 12)
    source_fragments = flatten_text_fragments(input_payload, 24) + flatten_text_fragments(expected_constraints, 16)
    topic_title = str(case_row.get("topic_title") or "").strip()
    source_text = " ".join(source_fragments + [topic_title, str(case_row.get("reference_good_output") or "")]).strip()
    must_use_facts = extract_writing_eval_must_use_facts(case_row)
    ai_noise = analyze_ai_noise_for_writing(combined_text)
    ai_noise_score = float(ai_noise["score"])
    bad_pattern_hits = sum(1 for pattern in reference_bad_patterns if pattern and pattern in combined_text)
    fact_signal_count = len(re.findall(r"\d+(?:\.\d+)?", combined_text))
    fact_signal_count += count_phrase_hits(combined_text, WRITING_FACT_UNITS)
    emotion_hits = count_phrase_hits(combined_text, WRITING_EMOTION_CUES)
    conflict_hits = count_phrase_hits(combined_text, WRITING_CONFLICT_CUES)
    value_hits = count_phrase_hits(combined_text, WRITING_VALUE_CUES)
    novelty_hits = count_phrase_hits(combined_text, WRITING_NOVELTY_CUES)
    timeliness_hits = count_phrase_hits(combined_text, WRITING_TIMELINESS_CUES)
    shareability_hits = count_phrase_hits(combined_text, WRITING_SHAREABILITY_CUES)
    risk_hits = count_phrase_hits(combined_text, WRITING_RISK_CUES)
    keyword_pool = list({item for item in re.findall(r"[\u4e00-\u9fffA-Za-z0-9]{2,}", topic_title) if len(item) >= 2})
    keyword_pool.extend(flatten_text_fragments(viral_targets, 12))
    overlap_ratio = keyword_overlap_ratio(keyword_pool[:18], combined_text)
    title_length = len(title)
    lead_length = len(lead)
    markdown_length = len(plain_text)
    must_use_fact_hits = sum(1 for fact in must_use_facts if fact and fact in combined_text)
    must_use_fact_coverage = (must_use_fact_hits / len(must_use_facts)) if must_use_facts else 0.0
    short_sentence_count = sum(1 for sentence in sentences if len(sentence) <= 28)
    quotable_sentence_count = sum(1 for sentence in sentences if 12 <= len(sentence) <= 32 and any(token in sentence for token in ["是", "不是", "会", "要", "更", "才"]))
    heading_count = len(re.findall(r"^#{1,3}\s+", markdown, flags=re.MULTILINE))
    long_paragraph_count = sum(1 for paragraph in paragraphs if len(paragraph) >= 160)
    title_bonus = 10 if 12 <= title_length <= 26 else 4 if 8 <= title_length <= 30 else -8
    title_signal_bonus = 8 if re.search(r"\d|为什么|如何|不是|而是|：|\?", title) else 0
    lead_bonus = 12 if 28 <= lead_length <= 110 else 4 if 18 <= lead_length <= 140 else -10
    length_fit_bonus = 12 if 450 <= markdown_length <= 1800 else 4 if 280 <= markdown_length <= 2400 else -10
    platform_para_bonus = 10 if paragraphs and len(paragraphs) >= 4 else 0
    source_numbers = set(re.findall(r"\d+(?:\.\d+)?", source_text))
    output_numbers = set(re.findall(r"\d+(?:\.\d+)?", combined_text))
    unsupported_number_count = len([item for item in output_numbers if item not in source_numbers]) if source_numbers else max(0, len(output_numbers) - 1)

    rule_style_score = clamp_score(62 + min(12, short_sentence_count * 1.5) + min(10, conflict_hits * 3) - ai_noise_score * 0.22 - bad_pattern_hits * 6)
    rule_language_score = clamp_score(90 - ai_noise_score * 0.5 - bad_pattern_hits * 5 - max(0, long_paragraph_count - 1) * 4)
    rule_density_score = clamp_score(34 + min(26, fact_signal_count * 3.2) + overlap_ratio * 18 + must_use_fact_coverage * 20 - ai_noise_score * 0.12)
    rule_emotion_score = clamp_score(34 + min(24, emotion_hits * 8) + min(18, conflict_hits * 5) + (8 if "?" in lead or "？" in lead else 0))
    rule_structure_score = clamp_score(42 + title_bonus + lead_bonus * 0.6 + platform_para_bonus + min(12, heading_count * 4) - long_paragraph_count * 4)
    rule_topic_momentum_score = clamp_score(36 + overlap_ratio * 28 + min(18, timeliness_hits * 6) + min(10, conflict_hits * 3))
    rule_headline_score = clamp_score(45 + title_bonus + title_signal_bonus + min(12, count_phrase_hits(title, WRITING_CONFLICT_CUES) * 4) - bad_pattern_hits * 4)
    rule_hook_score = clamp_score(36 + lead_bonus + min(18, conflict_hits * 4) + (10 if "?" in lead or "？" in lead else 0) + (8 if paragraphs and len(paragraphs[0]) <= 110 else 0))
    rule_shareability_score = clamp_score(34 + min(24, quotable_sentence_count * 6) + min(16, shareability_hits * 6) + min(10, value_hits * 3))
    rule_reader_value_score = clamp_score(35 + min(28, value_hits * 8) + overlap_ratio * 18 + (8 if re.search(r"建议|做法|要点|提醒", markdown) else 0))
    rule_novelty_score = clamp_score(30 + min(30, novelty_hits * 8) + min(16, conflict_hits * 4))
    rule_platform_fit_score = clamp_score(48 + length_fit_bonus + platform_para_bonus + (10 if title_length <= 28 else 0) - long_paragraph_count * 4)
    scoring_config = scoring_profile.get("config") if isinstance(scoring_profile, dict) else {}
    quality_weights = scoring_config.get("qualityWeights") if isinstance(scoring_config, dict) and isinstance(scoring_config.get("qualityWeights"), dict) else {}
    viral_weights = scoring_config.get("viralWeights") if isinstance(scoring_config, dict) and isinstance(scoring_config.get("viralWeights"), dict) else {}
    total_weights = scoring_config.get("totalWeights") if isinstance(scoring_config, dict) else {}
    penalties = scoring_config.get("penalties") if isinstance(scoring_config, dict) else {}
    judge_config = scoring_config.get("judge") if isinstance(scoring_config, dict) and isinstance(scoring_config.get("judge"), dict) else {}
    if experiment_mode == "title_only":
        quality_weights = apply_weight_multipliers(
            quality_weights,
            {"style": 0.5, "language": 0.5, "density": 0.2, "emotion": 0.4, "structure": 1.4},
        )
        viral_weights = apply_weight_multipliers(
            viral_weights,
            {
                "topicMomentum": 0.8,
                "headline": 3.0,
                "hook": 0.35,
                "shareability": 1.6,
                "readerValue": 0.45,
                "novelty": 1.2,
                "platformFit": 1.2,
            },
        )
        total_weights = {"quality": 0.25, "viral": 0.75}
    elif experiment_mode == "lead_only":
        quality_weights = apply_weight_multipliers(
            quality_weights,
            {"style": 1.2, "language": 1.3, "density": 0.45, "emotion": 1.6, "structure": 1.1},
        )
        viral_weights = apply_weight_multipliers(
            viral_weights,
            {
                "topicMomentum": 0.75,
                "headline": 0.5,
                "hook": 3.0,
                "shareability": 1.2,
                "readerValue": 1.35,
                "novelty": 0.9,
                "platformFit": 1.0,
            },
        )
        total_weights = {"quality": 0.35, "viral": 0.65}
    judge_enabled = float(judge_config.get("enabled", 1.0)) > 0
    judge_rule_weight = float(judge_config.get("ruleWeight", 0.65))
    judge_weight = float(judge_config.get("judgeWeight", 0.35))
    judge_temperature = float(judge_config.get("temperature", 0.2))
    judge_result: dict[str, Any] = {
        "status": "disabled" if not judge_enabled else "pending",
        "model": model,
        "scores": {},
        "reasons": {},
        "problems": [],
        "summary": "",
        "keepRecommendation": "observe",
    }
    if judge_enabled:
        try:
            judge_result = run_writing_eval_judge(model, case_row, generated, experiment_mode, judge_temperature)
        except Exception as error:
            judge_result = {
                "status": "error",
                "model": model,
                "error": str(error)[:500],
                "scores": {},
                "reasons": {},
                "problems": [],
                "summary": "",
                "keepRecommendation": "observe",
            }
    judge_scores = judge_result.get("scores") if isinstance(judge_result.get("scores"), dict) else {}
    style_score = blend_rule_and_judge_score(rule_style_score, judge_scores.get("styleScore"), judge_rule_weight, judge_weight)
    language_score = blend_rule_and_judge_score(rule_language_score, judge_scores.get("languageScore"), judge_rule_weight, judge_weight)
    density_score = blend_rule_and_judge_score(rule_density_score, judge_scores.get("densityScore"), judge_rule_weight, judge_weight)
    emotion_score = blend_rule_and_judge_score(rule_emotion_score, judge_scores.get("emotionScore"), judge_rule_weight, judge_weight)
    structure_score = blend_rule_and_judge_score(rule_structure_score, judge_scores.get("structureScore"), judge_rule_weight, judge_weight)
    topic_momentum_score = blend_rule_and_judge_score(rule_topic_momentum_score, judge_scores.get("topicMomentumScore"), judge_rule_weight, judge_weight)
    headline_score = blend_rule_and_judge_score(rule_headline_score, judge_scores.get("headlineScore"), judge_rule_weight, judge_weight)
    hook_score = blend_rule_and_judge_score(rule_hook_score, judge_scores.get("hookScore"), judge_rule_weight, judge_weight)
    shareability_score = blend_rule_and_judge_score(rule_shareability_score, judge_scores.get("shareabilityScore"), judge_rule_weight, judge_weight)
    reader_value_score = blend_rule_and_judge_score(rule_reader_value_score, judge_scores.get("readerValueScore"), judge_rule_weight, judge_weight)
    novelty_score = blend_rule_and_judge_score(rule_novelty_score, judge_scores.get("noveltyScore"), judge_rule_weight, judge_weight)
    platform_fit_score = blend_rule_and_judge_score(rule_platform_fit_score, judge_scores.get("platformFitScore"), judge_rule_weight, judge_weight)
    quality_score = round_score(
        weighted_average(
            [
                (style_score, float(quality_weights.get("style", 1.0)) if isinstance(quality_weights, dict) else 1.0),
                (language_score, float(quality_weights.get("language", 1.0)) if isinstance(quality_weights, dict) else 1.0),
                (density_score, float(quality_weights.get("density", 1.0)) if isinstance(quality_weights, dict) else 1.0),
                (emotion_score, float(quality_weights.get("emotion", 1.0)) if isinstance(quality_weights, dict) else 1.0),
                (structure_score, float(quality_weights.get("structure", 1.0)) if isinstance(quality_weights, dict) else 1.0),
            ]
        )
    )
    viral_score = round_score(
        weighted_average(
            [
                (topic_momentum_score, float(viral_weights.get("topicMomentum", 1.0)) if isinstance(viral_weights, dict) else 1.0),
                (headline_score, float(viral_weights.get("headline", 1.0)) if isinstance(viral_weights, dict) else 1.0),
                (hook_score, float(viral_weights.get("hook", 1.0)) if isinstance(viral_weights, dict) else 1.0),
                (shareability_score, float(viral_weights.get("shareability", 1.0)) if isinstance(viral_weights, dict) else 1.0),
                (reader_value_score, float(viral_weights.get("readerValue", 1.0)) if isinstance(viral_weights, dict) else 1.0),
                (novelty_score, float(viral_weights.get("novelty", 1.0)) if isinstance(viral_weights, dict) else 1.0),
                (platform_fit_score, float(viral_weights.get("platformFit", 1.0)) if isinstance(viral_weights, dict) else 1.0),
            ]
        )
    )
    factual_risk_penalty = round_score(min(35.0, unsupported_number_count * 8.0 + risk_hits * 6.0))
    ai_noise_penalty = round_score(min(30.0, ai_noise_score * 0.3))
    total_quality_weight = float(total_weights.get("quality", 0.45)) if isinstance(total_weights, dict) else 0.45
    total_viral_weight = float(total_weights.get("viral", 0.55)) if isinstance(total_weights, dict) else 0.55
    total_weight_sum = total_quality_weight + total_viral_weight
    if total_weight_sum <= 0:
        total_quality_weight = 0.45
        total_viral_weight = 0.55
        total_weight_sum = 1.0
    normalized_quality_weight = total_quality_weight / total_weight_sum
    normalized_viral_weight = total_viral_weight / total_weight_sum
    ai_noise_multiplier = float(penalties.get("aiNoiseMultiplier", 0.6)) if isinstance(penalties, dict) else 0.6
    total_score = round_score(
        quality_score * normalized_quality_weight + viral_score * normalized_viral_weight - factual_risk_penalty - ai_noise_penalty * ai_noise_multiplier
    )

    return {
        "style_score": round_score(style_score),
        "language_score": round_score(language_score),
        "density_score": round_score(density_score),
        "emotion_score": round_score(emotion_score),
        "structure_score": round_score(structure_score),
        "topic_momentum_score": round_score(topic_momentum_score),
        "headline_score": round_score(headline_score),
        "hook_score": round_score(hook_score),
        "shareability_score": round_score(shareability_score),
        "reader_value_score": round_score(reader_value_score),
        "novelty_score": round_score(novelty_score),
        "platform_fit_score": round_score(platform_fit_score),
        "quality_score": quality_score,
        "viral_score": viral_score,
        "factual_risk_penalty": factual_risk_penalty,
        "ai_noise_penalty": ai_noise_penalty,
        "total_score": total_score,
        "judge_payload_json": {
            "model": model,
            "promptLabel": prompt_meta["label"],
            "sceneCode": prompt_meta["sceneCode"],
            "topicTitle": topic_title,
            "signals": {
                "factSignalCount": fact_signal_count,
                "mustUseFactCount": len(must_use_facts),
                "mustUseFactHits": must_use_fact_hits,
                "mustUseFactCoverage": round(must_use_fact_coverage, 3),
                "emotionHits": emotion_hits,
                "conflictHits": conflict_hits,
                "valueHits": value_hits,
                "noveltyHits": novelty_hits,
                "timelinessHits": timeliness_hits,
                "shareabilityHits": shareability_hits,
                "badPatternHits": bad_pattern_hits,
                "keywordOverlapRatio": round(overlap_ratio, 3),
                "unsupportedNumberCount": unsupported_number_count,
            },
            "aiNoise": ai_noise,
            "mustUseFacts": must_use_facts,
            "ruleScores": {
                "styleScore": round_score(rule_style_score),
                "languageScore": round_score(rule_language_score),
                "densityScore": round_score(rule_density_score),
                "emotionScore": round_score(rule_emotion_score),
                "structureScore": round_score(rule_structure_score),
                "topicMomentumScore": round_score(rule_topic_momentum_score),
                "headlineScore": round_score(rule_headline_score),
                "hookScore": round_score(rule_hook_score),
                "shareabilityScore": round_score(rule_shareability_score),
                "readerValueScore": round_score(rule_reader_value_score),
                "noveltyScore": round_score(rule_novelty_score),
                "platformFitScore": round_score(rule_platform_fit_score),
            },
            "hybridJudge": {
                **judge_result,
                "blend": {
                    "ruleWeight": round(judge_rule_weight, 4),
                    "judgeWeight": round(judge_weight, 4),
                },
            },
            "scoringProfile": {
                "label": str(scoring_profile.get("label") or "default"),
                "qualityWeights": quality_weights if isinstance(quality_weights, dict) else {},
                "viralWeights": viral_weights if isinstance(viral_weights, dict) else {},
                "totalWeights": {
                    "quality": round(normalized_quality_weight, 4),
                    "viral": round(normalized_viral_weight, 4),
                },
                "penalties": {
                    "aiNoiseMultiplier": round(ai_noise_multiplier, 4),
                },
                "judge": {
                    "enabled": judge_enabled,
                    "temperature": round(judge_temperature, 4),
                    "ruleWeight": round(judge_rule_weight, 4),
                    "judgeWeight": round(judge_weight, 4),
                },
            },
            "experimentMode": experiment_mode,
        },
    }


def build_score_snapshot(scores: dict[str, Any]) -> dict[str, float]:
    keys = [
        "style_score",
        "language_score",
        "density_score",
        "emotion_score",
        "structure_score",
        "topic_momentum_score",
        "headline_score",
        "hook_score",
        "shareability_score",
        "reader_value_score",
        "novelty_score",
        "platform_fit_score",
        "quality_score",
        "viral_score",
        "factual_risk_penalty",
        "ai_noise_penalty",
        "total_score",
    ]
    return {key: round_score(float(scores.get(key) or 0.0)) for key in keys}


def build_score_delta(candidate_scores: dict[str, Any], base_scores: dict[str, Any]) -> dict[str, float]:
    keys = [
        "style_score",
        "language_score",
        "density_score",
        "emotion_score",
        "structure_score",
        "topic_momentum_score",
        "headline_score",
        "hook_score",
        "shareability_score",
        "reader_value_score",
        "novelty_score",
        "platform_fit_score",
        "quality_score",
        "viral_score",
        "factual_risk_penalty",
        "ai_noise_penalty",
        "total_score",
    ]
    delta: dict[str, float] = {}
    for key in keys:
        delta[key] = round(float(candidate_scores.get(key) or 0.0) - float(base_scores.get(key) or 0.0), 2)
    return delta


def determine_winner(candidate_scores: dict[str, Any], base_scores: dict[str, Any]) -> str:
    candidate_total = float(candidate_scores.get("total_score") or 0.0)
    base_total = float(base_scores.get("total_score") or 0.0)
    if candidate_total > base_total + 0.01:
        return "candidate"
    if base_total > candidate_total + 0.01:
        return "base"
    return "tie"


def execute_writing_eval_case(
    connection: RuntimeConnection,
    case_row: dict[str, Any],
    prompt_meta: dict[str, str],
    scoring_profile: dict[str, Any],
    experiment_mode: str = "full_article",
    layout_strategy: dict[str, Any] | None = None,
    apply_command_template: dict[str, Any] | None = None,
) -> tuple[dict[str, str], dict[str, Any], str, list[str]]:
    primary_model, fallback_model = get_scene_route(connection, prompt_meta["sceneCode"])
    user_prompt = build_scene_generation_prompt(case_row, prompt_meta, experiment_mode, layout_strategy, apply_command_template)
    model_errors: list[str] = []
    raw_output = ""
    selected_model = primary_model

    for candidate_model in [primary_model, fallback_model]:
        if not candidate_model:
            continue
        try:
            raw_output = call_text_model(
                candidate_model,
                prompt_meta["promptContent"],
                user_prompt,
                0.7,
            )
            selected_model = candidate_model
            break
        except Exception as error:
            model_errors.append(f"{candidate_model}: {error}")

    if not raw_output.strip():
        raise RuntimeError("; ".join(model_errors) or "writing eval generation failed")

    generated = normalize_scene_generated_document(raw_output, case_row, prompt_meta, experiment_mode)
    scores = score_writing_result(case_row, generated, prompt_meta, selected_model, scoring_profile, experiment_mode)
    scores["judge_payload_json"]["layoutStrategyLabel"] = str(layout_strategy.get("label") if layout_strategy else "default")
    scores["judge_payload_json"]["applyCommandTemplateLabel"] = str(apply_command_template.get("label") if apply_command_template else "default")
    return generated, scores, selected_model, model_errors


def build_failed_generation(case_row: dict[str, Any], error_message: str) -> dict[str, str]:
    topic_title = str(case_row.get("topic_title") or "未命名选题").strip() or "未命名选题"
    task_code = str(case_row.get("task_code") or "").strip()
    return {
        "title": topic_title,
        "lead": f"评测样本执行失败：{error_message[:120]}",
        "markdown": f"# {topic_title}\n\n当前样本执行失败。\n\n- taskCode: {task_code or 'unknown'}\n- error: {error_message[:500]}",
    }


def build_failed_scores(
    prompt_meta: dict[str, str],
    model: str,
    case_row: dict[str, Any],
    error_message: str,
    fallback_errors: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "style_score": 0.0,
        "language_score": 0.0,
        "density_score": 0.0,
        "emotion_score": 0.0,
        "structure_score": 0.0,
        "topic_momentum_score": 0.0,
        "headline_score": 0.0,
        "hook_score": 0.0,
        "shareability_score": 0.0,
        "reader_value_score": 0.0,
        "novelty_score": 0.0,
        "platform_fit_score": 0.0,
        "quality_score": 0.0,
        "viral_score": 0.0,
        "factual_risk_penalty": 35.0,
        "ai_noise_penalty": 30.0,
        "total_score": 0.0,
        "judge_payload_json": {
            "model": model,
            "promptLabel": prompt_meta["label"],
            "sceneCode": prompt_meta["sceneCode"],
            "topicTitle": str(case_row.get("topic_title") or "").strip(),
            "error": error_message[:500],
            "status": "failed",
            "hybridJudge": {
                "status": "failed",
                "model": model,
                "scores": {},
                "reasons": {},
                "problems": [error_message[:160]],
                "summary": "",
                "keepRecommendation": "discard",
            },
            "fallbackErrors": fallback_errors or [],
        },
    }


def save_writing_eval_result(
    connection: RuntimeConnection,
    run_id: int,
    case_id: int,
    generated: dict[str, str],
    scores: dict[str, Any],
) -> None:
    now = now_iso()
    now_param = timestamp_value(connection, now)
    connection.execute(
        """
        INSERT INTO writing_optimization_results (
          run_id, case_id, generated_title, generated_lead, generated_markdown,
          style_score, language_score, density_score, emotion_score, structure_score, topic_momentum_score,
          headline_score, hook_score, shareability_score, reader_value_score, novelty_score, platform_fit_score,
          quality_score, viral_score, factual_risk_penalty, ai_noise_penalty, total_score, judge_payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, case_id) DO UPDATE SET
          generated_title = excluded.generated_title,
          generated_lead = excluded.generated_lead,
          generated_markdown = excluded.generated_markdown,
          style_score = excluded.style_score,
          language_score = excluded.language_score,
          density_score = excluded.density_score,
          emotion_score = excluded.emotion_score,
          structure_score = excluded.structure_score,
          topic_momentum_score = excluded.topic_momentum_score,
          headline_score = excluded.headline_score,
          hook_score = excluded.hook_score,
          shareability_score = excluded.shareability_score,
          reader_value_score = excluded.reader_value_score,
          novelty_score = excluded.novelty_score,
          platform_fit_score = excluded.platform_fit_score,
          quality_score = excluded.quality_score,
          viral_score = excluded.viral_score,
          factual_risk_penalty = excluded.factual_risk_penalty,
          ai_noise_penalty = excluded.ai_noise_penalty,
          total_score = excluded.total_score,
          judge_payload_json = excluded.judge_payload_json
        """,
        (
            run_id,
            case_id,
            generated["title"],
            generated["lead"],
            generated["markdown"],
            scores["style_score"],
            scores["language_score"],
            scores["density_score"],
            scores["emotion_score"],
            scores["structure_score"],
            scores["topic_momentum_score"],
            scores["headline_score"],
            scores["hook_score"],
            scores["shareability_score"],
            scores["reader_value_score"],
            scores["novelty_score"],
            scores["platform_fit_score"],
            scores["quality_score"],
            scores["viral_score"],
            scores["factual_risk_penalty"],
            scores["ai_noise_penalty"],
            scores["total_score"],
            json_value(connection, scores["judge_payload_json"]),
            now_param,
        ),
    )


def summarize_writing_eval_scores(results: list[dict[str, Any]], base_results: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    if not results:
        return {
            "casesProcessed": 0,
            "totalScore": 0.0,
            "qualityScore": 0.0,
            "viralScore": 0.0,
        }

    metric_pairs = [
        ("totalScore", "total_score"),
        ("qualityScore", "quality_score"),
        ("viralScore", "viral_score"),
        ("styleScore", "style_score"),
        ("languageScore", "language_score"),
        ("densityScore", "density_score"),
        ("emotionScore", "emotion_score"),
        ("structureScore", "structure_score"),
        ("topicMomentumScore", "topic_momentum_score"),
        ("headlineScore", "headline_score"),
        ("hookScore", "hook_score"),
        ("shareabilityScore", "shareability_score"),
        ("readerValueScore", "reader_value_score"),
        ("noveltyScore", "novelty_score"),
        ("platformFitScore", "platform_fit_score"),
        ("factualRiskPenalty", "factual_risk_penalty"),
        ("aiNoisePenalty", "ai_noise_penalty"),
    ]

    def average(key: str) -> float:
        return round_score(sum(float(item.get(key) or 0.0) for item in results) / len(results))

    summary: dict[str, Any] = {
        "casesProcessed": len(results),
        "failedCaseCount": sum(1 for item in results if str(item.get("status") or "").strip() == "failed"),
    }
    for summary_key, raw_key in metric_pairs:
        summary[summary_key] = average(raw_key)
    if not base_results:
        return summary

    def average_base(key: str) -> float:
        return round_score(sum(float(item.get(key) or 0.0) for item in base_results) / len(base_results))

    for summary_key, raw_key in metric_pairs:
        base_key = f"base{summary_key[0].upper()}{summary_key[1:]}"
        delta_key = f"delta{summary_key[0].upper()}{summary_key[1:]}"
        summary[base_key] = average_base(raw_key)
        summary[delta_key] = round(summary[summary_key] - summary[base_key], 2)
    summary["improvedCaseCount"] = sum(
        1 for index, item in enumerate(results)
        if str(item.get("status") or "").strip() != "failed"
        if float(item.get("total_score") or 0.0) > float(base_results[index].get("total_score") or 0.0)
    )
    summary["regressedCaseCount"] = sum(
        1 for index, item in enumerate(results)
        if str(item.get("status") or "").strip() != "failed"
        if float(item.get("total_score") or 0.0) < float(base_results[index].get("total_score") or 0.0)
    )
    return summary


def extract_candidate_and_base_score_inputs(connection: RuntimeConnection, run_id: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows = connection.fetchall(
        """
        SELECT style_score, language_score, density_score, emotion_score, structure_score, topic_momentum_score,
               headline_score, hook_score, shareability_score, reader_value_score, novelty_score, platform_fit_score,
               quality_score, viral_score, factual_risk_penalty, ai_noise_penalty, total_score, judge_payload_json
        FROM writing_optimization_results
        WHERE run_id = ?
        ORDER BY id ASC
        """,
        (run_id,),
    )
    candidate_results: list[dict[str, Any]] = []
    base_results: list[dict[str, Any]] = []
    score_keys = [
        "style_score",
        "language_score",
        "density_score",
        "emotion_score",
        "structure_score",
        "topic_momentum_score",
        "headline_score",
        "hook_score",
        "shareability_score",
        "reader_value_score",
        "novelty_score",
        "platform_fit_score",
        "quality_score",
        "viral_score",
        "factual_risk_penalty",
        "ai_noise_penalty",
        "total_score",
    ]
    for row in rows:
        candidate_results.append({key: float(row.get(key) or 0.0) for key in score_keys})
        judge_payload = parse_payload(row.get("judge_payload_json"))
        baseline_scores = parse_payload(parse_payload(judge_payload.get("baseline")).get("scores"))
        base_results.append({key: float(baseline_scores.get(key) or 0.0) for key in score_keys})
    return candidate_results, base_results


def build_promotion_decision_from_summary(summary: dict[str, Any]) -> dict[str, str]:
    delta_total = float(summary.get("deltaTotalScore") or 0.0)
    delta_quality = float(summary.get("deltaQualityScore") or 0.0)
    delta_viral = float(summary.get("deltaViralScore") or 0.0)
    failed_case_count = int(summary.get("failedCaseCount") or 0)
    factual_risk_penalty = float(summary.get("factualRiskPenalty") or 0.0)
    base_factual_risk_penalty = float(summary.get("baseFactualRiskPenalty") or factual_risk_penalty)
    ai_noise_penalty = float(summary.get("aiNoisePenalty") or 0.0)
    base_ai_noise_penalty = float(summary.get("baseAiNoisePenalty") or ai_noise_penalty)
    improved_case_count = int(summary.get("improvedCaseCount") or 0)
    regressed_case_count = int(summary.get("regressedCaseCount") or 0)

    blockers: list[str] = []
    if delta_total < 2:
        blockers.append(f"总分仅提升 {delta_total:.2f}")
    if failed_case_count > 0:
        blockers.append(f"失败样本 {failed_case_count} 条")
    if delta_quality < 0:
        blockers.append(f"质量分 {delta_quality:+.2f}")
    if delta_viral < 0:
        blockers.append(f"爆款分 {delta_viral:+.2f}")
    if factual_risk_penalty > base_factual_risk_penalty:
        blockers.append("事实风险上升")
    if ai_noise_penalty > base_ai_noise_penalty:
        blockers.append("机器腔惩罚上升")
    if improved_case_count < regressed_case_count:
        blockers.append(f"退化样本 {regressed_case_count} 条多于提分样本 {improved_case_count} 条")

    if blockers:
        return {
            "suggestion": "discard",
            "reason": f"当前更适合 discard：{'；'.join(blockers[:4])}。",
        }
    return {
        "suggestion": "keep",
        "reason": f"总分提升 {delta_total:.2f}，提分样本 {improved_case_count} 条，事实风险与机器腔未上升。",
    }


def extract_openai_text(payload: dict[str, Any]) -> str:
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()

    chunks = payload.get("output")
    texts: list[str] = []
    if isinstance(chunks, list):
        for item in chunks:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for part in content:
                if isinstance(part, dict) and isinstance(part.get("text"), str) and part["text"].strip():
                    texts.append(part["text"].strip())
    merged = "\n".join(texts).strip()
    if not merged:
        raise RuntimeError("openai returned no text")
    return merged


def extract_anthropic_text(payload: dict[str, Any]) -> str:
    content = payload.get("content")
    if not isinstance(content, list):
        raise RuntimeError("anthropic returned no content")
    texts = [
        str(item.get("text")).strip()
        for item in content
        if isinstance(item, dict) and isinstance(item.get("text"), str) and item["text"].strip()
    ]
    merged = "\n".join(texts).strip()
    if not merged:
        raise RuntimeError("anthropic returned no text")
    return merged


def extract_gemini_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates")
    texts: list[str] = []
    if isinstance(candidates, list):
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            content = candidate.get("content")
            if not isinstance(content, dict):
                continue
            parts = content.get("parts")
            if not isinstance(parts, list):
                continue
            for part in parts:
                if isinstance(part, dict) and isinstance(part.get("text"), str) and part["text"].strip():
                    texts.append(part["text"].strip())
    merged = "\n".join(texts).strip()
    if not merged:
        raise RuntimeError("gemini returned no text")
    return merged


def request_json(url: str, headers: dict[str, str], body: dict[str, Any], timeout: int = 90) -> dict[str, Any]:
    request = Request(
        url,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
            return payload if isinstance(payload, dict) else {}
    except HTTPError as error:
        raw = error.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(raw)
            message = payload.get("error", {}).get("message") or payload.get("message") or raw
        except json.JSONDecodeError:
            message = raw or f"HTTP {error.code}"
        raise RuntimeError(str(message))
    except URLError as error:
        raise RuntimeError(f"request failed: {error.reason}") from error


def decode_html(value: str) -> str:
    return html.unescape(value.replace("\xa0", " "))


def strip_html(value: str) -> str:
    return decode_html(TOPIC_TAG_PATTERN.sub(" ", value)).strip()


def absolutize_url(base_url: str, href: str) -> str | None:
    try:
        from urllib.parse import urljoin

        resolved = urljoin(base_url, href)
        return resolved if resolved.startswith(("http://", "https://")) else None
    except Exception:
        return None


def extract_topics_from_html(base_url: str, html_text: str) -> list[dict[str, str | None]]:
    topics: list[dict[str, str | None]] = []
    seen: set[str] = set()

    for href, content in TOPIC_LINK_PATTERN.findall(html_text):
        text = re.sub(r"\s+", " ", strip_html(content)).strip()
        if len(text) < 12 or len(text) > 80:
            continue
        if TOPIC_SKIP_PATTERN.search(text):
            continue
        if text in seen:
            continue
        seen.add(text)
        topics.append(
            {
                "title": text,
                "source_url": absolutize_url(base_url, href),
            }
        )

    return topics


def pick_emotion_labels(title: str) -> list[str]:
    labels: list[str] = []
    if re.search(r"裁员|降薪|亏损|倒闭|收缩|失业|出血|焦虑", title):
        labels.append("行业焦虑")
    if re.search(r"涨价|降价|利润|融资|估值|财富|收入|现金", title):
        labels.append("财富焦虑")
    if re.search(r"AI|模型|大厂|算力|芯片|平台|工具", title, re.IGNORECASE):
        labels.append("技术震荡")
    if re.search(r"监管|争议|反垄断|封禁|事故|问题|风险", title):
        labels.append("冷眼旁观")
    if not labels:
        labels.append("创作危机")
    return labels[:3]


def build_angle_options(title: str, labels: list[str]) -> list[str]:
    lead = labels[0] if labels else "行业焦虑"
    return [
        f"{lead}不是背景音，它本身就是这条新闻最值得写的切口。",
        f"别急着重复标题，先拆开“{title}”背后的利益变化和叙事漏洞。",
        f"如果把这件事放回长期观察里，真正变化的不是事件，而是判断这件事的坐标。",
    ]


def build_topic_summary(title: str) -> str:
    return f"热点信号：{title}。建议优先关注其中涉及的数据变化、角色关系和叙事转向。"


def fetch_source_topics(source: dict[str, Any]) -> list[dict[str, str | None]]:
    homepage_url = source.get("homepage_url")
    if not homepage_url:
        return []

    request = Request(
        str(homepage_url),
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
            )
        },
        method="GET",
    )

    try:
        with urlopen(request, timeout=20) as response:
            if int(getattr(response, "status", 200)) >= 400:
                return []
            html_text = response.read().decode("utf-8", errors="ignore")
    except Exception:
        return []

    return extract_topics_from_html(str(homepage_url), html_text)[:8]


def fetch_url_article(url: str) -> dict[str, str]:
    request = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
            )
        },
        method="GET",
    )

    try:
        with urlopen(request, timeout=20) as response:
            status = int(getattr(response, "status", 200))
            if status >= 400:
                raise RuntimeError(f"抓取源链接失败，HTTP {status}")
            html_text = response.read().decode("utf-8", errors="ignore")
    except HTTPError as error:
        raise RuntimeError(f"抓取源链接失败，HTTP {error.code}") from error
    except URLError as error:
        raise RuntimeError(f"抓取源链接失败: {error.reason}") from error

    title_match = re.search(r"<title[^>]*>([\s\S]*?)</title>", html_text, re.IGNORECASE)
    title = decode_html(title_match.group(1).strip()) if title_match else ""
    raw_text = re.sub(r"\s+", " ", strip_html(html_text)).strip()[:12000]
    if not raw_text:
        raise RuntimeError("抓取结果为空")
    return {"title": title, "rawText": raw_text}


def infer_title_from_url(url: str) -> str:
    try:
        from urllib.parse import urlparse, unquote

        parsed = urlparse(url)
        segments = [segment for segment in parsed.path.split("/") if segment]
        if segments:
            return unquote(segments[-1]).replace("-", " ").replace("_", " ")[:60]
        return parsed.netloc.replace("www.", "", 1)[:60]
    except Exception:
        return "URL 碎片"


def fallback_distill(title: str | None, raw_content: str) -> dict[str, str]:
    text = re.sub(r"\s+", " ", raw_content).strip()
    normalized_title = (title or text[:24] or "未命名碎片").strip()
    return {
        "title": normalized_title,
        "distilledContent": text[:400],
    }


def resolve_screenshot_input(screenshot_path: str) -> tuple[str, bytes]:
    trimmed = screenshot_path.strip()
    if not trimmed:
        raise RuntimeError("empty screenshot path")

    if trimmed.startswith("data:image/"):
        header, encoded = trimmed.split(",", 1)
        mime_type = header.split(";")[0].replace("data:", "", 1)
        return mime_type, base64.b64decode(encoded)

    if trimmed.startswith("http://") or trimmed.startswith("https://"):
        request = Request(
            trimmed,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
                )
            },
            method="GET",
        )
        with urlopen(request, timeout=30) as response:
            content_type = response.headers.get_content_type() or "image/png"
            return content_type, response.read()

    path = Path(trimmed)
    candidates: list[Path] = []
    if path.is_absolute():
        candidates.append(path)
    else:
        normalized = trimmed.lstrip("/")
        candidates.append(REPO_ROOT / "apps" / "web" / "public" / normalized)
        candidates.append(REPO_ROOT / normalized)

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            mime_type = mimetypes.guess_type(candidate.name)[0] or "image/png"
            return mime_type, candidate.read_bytes()

    raise RuntimeError(f"screenshot file not found: {screenshot_path}")


def call_openai_vision(model: str, system_prompt: str, user_prompt: str, mime_type: str, image_bytes: bytes) -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("missing OPENAI_API_KEY")
    image_data_url = f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode('utf-8')}"
    payload = request_json(
        "https://api.openai.com/v1/responses",
        {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        {
            "model": model,
            "input": [
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": system_prompt}],
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": user_prompt},
                        {"type": "input_image", "image_url": image_data_url},
                    ],
                },
            ],
            "temperature": 0.2,
        },
    )
    return extract_openai_text(payload)


def call_anthropic_vision(model: str, system_prompt: str, user_prompt: str, mime_type: str, image_bytes: bytes) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("missing ANTHROPIC_API_KEY")
    payload = request_json(
        "https://api.anthropic.com/v1/messages",
        {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        {
            "model": model,
            "system": system_prompt,
            "max_tokens": 4096,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt},
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": mime_type,
                                "data": base64.b64encode(image_bytes).decode("utf-8"),
                            },
                        },
                    ],
                }
            ],
        },
    )
    return extract_anthropic_text(payload)


def call_gemini_vision(model: str, system_prompt: str, user_prompt: str, mime_type: str, image_bytes: bytes) -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("missing GEMINI_API_KEY")
    payload = request_json(
        (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={api_key}"
        ),
        {"Content-Type": "application/json"},
        {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": f"{system_prompt}\n\n{user_prompt}"},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": base64.b64encode(image_bytes).decode("utf-8"),
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {"temperature": 0.2},
        },
    )
    return extract_gemini_text(payload)


def call_openai_text(model: str, system_prompt: str, user_prompt: str, temperature: float) -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("missing OPENAI_API_KEY")
    payload = request_json(
        "https://api.openai.com/v1/responses",
        {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        {
            "model": model,
            "input": [
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": system_prompt}],
                },
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": user_prompt}],
                },
            ],
            "temperature": temperature,
        },
    )
    return extract_openai_text(payload)


def call_anthropic_text(model: str, system_prompt: str, user_prompt: str, temperature: float) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("missing ANTHROPIC_API_KEY")
    payload = request_json(
        "https://api.anthropic.com/v1/messages",
        {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        {
            "model": model,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
            "max_tokens": 4096,
            "temperature": temperature,
        },
    )
    return extract_anthropic_text(payload)


def call_gemini_text(model: str, system_prompt: str, user_prompt: str, temperature: float) -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("missing GEMINI_API_KEY")
    payload = request_json(
        (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={api_key}"
        ),
        {"Content-Type": "application/json"},
        {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}],
                }
            ],
            "generationConfig": {"temperature": temperature},
        },
    )
    return extract_gemini_text(payload)


def generate_fragment_distill(
    connection: RuntimeConnection,
    source_type: str,
    title_hint: str,
    raw_content: str,
    source_url: str | None,
) -> dict[str, str]:
    system_prompt = load_prompt_content(connection, "fragment_distill", DEFAULT_FRAGMENT_DISTILL_PROMPT)
    primary_model, fallback_model = get_scene_route(connection, "fragmentDistill")
    user_prompt = "\n".join(
        [
            "请把下面的输入提纯成适合写作系统长期复用的原子事实碎片。",
            "返回 JSON，不要解释，不要 markdown。",
            '字段要求：{"title":"字符串","distilledContent":"字符串"}',
            "distilledContent 只保留时间、地点、数据、动作、冲突，不写空泛判断。",
            f"sourceType: {source_type}",
            f"sourceUrl: {source_url}" if source_url else "",
            f"sourceTitle: {title_hint}" if title_hint else "",
            "",
            raw_content,
        ]
    ).strip()

    models = [primary_model, fallback_model]
    seen: set[str] = set()
    errors: list[str] = []
    fallback = fallback_distill(title_hint, raw_content)

    for model in models:
        if not model or model in seen:
            continue
        seen.add(model)
        provider = infer_provider(model)
        try:
            if provider == "openai":
                text = call_openai_text(model, system_prompt, user_prompt, 0.2)
            elif provider == "anthropic":
                text = call_anthropic_text(model, system_prompt, user_prompt, 0.2)
            else:
                text = call_gemini_text(model, system_prompt, user_prompt, 0.2)
            payload = parse_json_object(text)
            return {
                "title": str(payload.get("title") or fallback["title"]).strip() or fallback["title"],
                "rawContent": raw_content,
                "distilledContent": str(payload.get("distilledContent") or fallback["distilledContent"]).strip()
                or fallback["distilledContent"],
                "model": model,
                "provider": provider,
            }
        except Exception as error:
            errors.append(f"{model}: {error}")

    return {
        "title": fallback["title"],
        "rawContent": raw_content,
        "distilledContent": fallback["distilledContent"],
        "model": "fallback-local-distill",
        "provider": "local",
        "errors": " | ".join(errors),
    }


def generate_vision_note(
    connection: RuntimeConnection,
    title_hint: str,
    note: str,
    screenshot_path: str,
) -> dict[str, str]:
    system_prompt = load_prompt_content(connection, "vision_note", DEFAULT_VISION_PROMPT)
    primary_model, fallback_model = get_scene_route(connection, "visionNote")
    user_prompt = "\n".join(
        [
            "请基于截图内容，输出适合写作系统长期复用的结构化碎片。",
            "只返回 JSON，不要解释，不要 markdown。",
            '字段要求：{"title":"字符串","rawContent":"字符串","distilledContent":"字符串"}',
            "rawContent 用于记录截图中可见的正文、数字、按钮状态、界面元素和异常信息。",
            "distilledContent 只保留能直接复用的事实、结论、数字、关系和动作。",
            f"titleHint: {title_hint or '无'}",
            f"note: {note or '无'}",
        ]
    )
    try:
        mime_type, image_bytes = resolve_screenshot_input(screenshot_path)
    except Exception as error:
        fallback_raw = note.strip() or "截图已上传，但当前任务没有拿到可读取的图片文件。"
        return {
            "title": title_hint.strip() or "截图碎片",
            "rawContent": fallback_raw,
            "distilledContent": fallback_raw[:400],
            "model": "fallback-local-vision-note",
            "provider": "local",
            "errors": str(error),
        }
    models = [primary_model, fallback_model]
    seen: set[str] = set()
    errors: list[str] = []

    for model in models:
        if not model or model in seen:
            continue
        seen.add(model)
        provider = infer_provider(model)
        try:
            if provider == "openai":
                text = call_openai_vision(model, system_prompt, user_prompt, mime_type, image_bytes)
            elif provider == "anthropic":
                text = call_anthropic_vision(model, system_prompt, user_prompt, mime_type, image_bytes)
            else:
                text = call_gemini_vision(model, system_prompt, user_prompt, mime_type, image_bytes)
            payload = parse_json_object(text)
            title = str(payload.get("title") or title_hint or "截图碎片").strip() or "截图碎片"
            raw_content = str(payload.get("rawContent") or note or title).strip()
            distilled_content = str(payload.get("distilledContent") or raw_content).strip()
            return {
                "title": title,
                "rawContent": raw_content,
                "distilledContent": distilled_content,
                "model": model,
                "provider": provider,
            }
        except Exception as error:
            errors.append(f"{model}: {error}")

    fallback_raw = note.strip() or "截图已上传，但当前环境未能完成视觉理解。"
    return {
        "title": title_hint.strip() or "截图碎片",
        "rawContent": fallback_raw,
        "distilledContent": fallback_raw[:400],
        "model": "fallback-local-vision-note",
        "provider": "local",
        "errors": " | ".join(errors),
    }


def claim_next_job(connection: RuntimeConnection) -> dict[str, Any] | None:
    now = now_iso()
    now_param = timestamp_value(connection, now)
    if connection.kind == "postgres":
        try:
            row = connection.fetchone(
                """
                WITH next_job AS (
                  SELECT id
                  FROM job_queue
                  WHERE status = 'queued' AND (run_at IS NULL OR run_at <= ?)
                  ORDER BY id ASC
                  LIMIT 1
                  FOR UPDATE SKIP LOCKED
                )
                UPDATE job_queue AS job
                SET status = 'running', locked_at = ?, updated_at = ?
                FROM next_job
                WHERE job.id = next_job.id
                RETURNING job.*
                """,
                (now_param, now_param, now_param),
            )
            connection.commit()
            return row
        except Exception:
            connection.rollback()
            raise

    connection.connection.execute("BEGIN IMMEDIATE")
    row = connection.fetchone(
        """
        SELECT *
        FROM job_queue
        WHERE status = 'queued' AND (run_at IS NULL OR run_at <= ?)
        ORDER BY id ASC
        LIMIT 1
        """,
        (now_param,),
    )
    if row is None:
        connection.commit()
        return None

    updated = connection.execute(
        """
        UPDATE job_queue
        SET status = 'running', locked_at = ?, updated_at = ?
        WHERE id = ? AND status = 'queued'
        """,
        (now_param, now_param, row["id"]),
    )
    connection.commit()
    if updated == 0:
        return None
    return row


def complete_job(connection: RuntimeConnection, job_id: int) -> None:
    now = now_iso()
    now_param = timestamp_value(connection, now)
    job = connection.fetchone(
        "SELECT id, job_type, payload_json FROM job_queue WHERE id = ? LIMIT 1",
        (job_id,),
    )
    connection.execute(
        "UPDATE job_queue SET status = 'completed', locked_at = NULL, updated_at = ? WHERE id = ?",
        (now_param, job_id),
    )
    payload = parse_payload(job.get("payload_json")) if job else {}
    if job and str(job.get("job_type")) == "topicFetch":
        run_id = int(payload.get("topicSyncRunId") or 0)
        inserted_count = int(payload.get("insertedCount") or 0)
        if run_id > 0:
            record_topic_sync_run_result(connection, run_id, success=True, inserted_count=inserted_count)
    connection.commit()


def fail_job(connection: RuntimeConnection, job_id: int, error_message: str) -> None:
    now = now_iso()
    now_param = timestamp_value(connection, now)
    job = connection.fetchone(
        "SELECT id, job_type, payload_json FROM job_queue WHERE id = ? LIMIT 1",
        (job_id,),
    )
    connection.execute(
        """
        UPDATE job_queue
        SET status = 'failed', locked_at = NULL, attempts = attempts + 1, last_error = ?, updated_at = ?
        WHERE id = ?
        """,
        (error_message[:400], now_param, job_id),
    )
    payload = parse_payload(job.get("payload_json")) if job else {}
    if job and str(job.get("job_type")) == "topicFetch":
        run_id = int(payload.get("topicSyncRunId") or 0)
        if run_id > 0:
            record_topic_sync_run_result(connection, run_id, success=False, error_message=error_message)
    connection.commit()


def enqueue_job(connection: RuntimeConnection, job_type: str, payload: dict[str, Any]) -> None:
    now = now_iso()
    now_param = timestamp_value(connection, now)
    connection.execute(
        """
        INSERT INTO job_queue (job_type, status, payload_json, run_at, attempts, created_at, updated_at)
        VALUES (?, 'queued', ?, ?, 0, ?, ?)
        """,
        (job_type, json_value(connection, payload), now_param, now_param, now_param),
    )
    connection.commit()


def upsert_topic_sync_run(
    connection: RuntimeConnection,
    window_start: datetime,
    scheduled_source_count: int,
    enqueued_job_count: int,
) -> int:
    window_start_iso = window_start.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    window_start_param = timestamp_value(connection, window_start_iso)
    now = now_iso()
    now_param = timestamp_value(connection, now)
    existing = connection.fetchone(
        """
        SELECT id, scheduled_source_count, enqueued_job_count, completed_source_count, failed_source_count
        FROM topic_sync_runs
        WHERE sync_window_start = ?
        LIMIT 1
        """,
        (window_start_param,),
    )
    if existing is None:
        run_id = connection.insert(
            """
            INSERT INTO topic_sync_runs (
              sync_window_start, sync_window_label, status, scheduled_source_count, enqueued_job_count,
              completed_source_count, failed_source_count, inserted_item_count, last_error, triggered_at, finished_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                window_start_param,
                get_topic_sync_window_label(window_start),
                "running",
                scheduled_source_count,
                enqueued_job_count,
                0,
                0,
                0,
                None,
                now_param,
                None,
                now_param,
                now_param,
            ),
        )
        connection.commit()
        return run_id

    next_scheduled_count = max(int(existing.get("scheduled_source_count") or 0), scheduled_source_count)
    next_enqueued_count = int(existing.get("enqueued_job_count") or 0) + enqueued_job_count
    status = "running"
    if int(existing.get("completed_source_count") or 0) + int(existing.get("failed_source_count") or 0) >= next_scheduled_count and next_scheduled_count > 0:
        status = "partial_failed" if int(existing.get("failed_source_count") or 0) > 0 else "completed"
    connection.execute(
        """
        UPDATE topic_sync_runs
        SET status = ?, scheduled_source_count = ?, enqueued_job_count = ?, updated_at = ?
        WHERE id = ?
        """,
        (status, next_scheduled_count, next_enqueued_count, now_param, int(existing["id"])),
    )
    connection.commit()
    return int(existing["id"])


def record_topic_sync_run_result(
    connection: RuntimeConnection,
    run_id: int,
    *,
    success: bool,
    inserted_count: int = 0,
    error_message: str | None = None,
) -> None:
    now = now_iso()
    now_param = timestamp_value(connection, now)
    existing = connection.fetchone(
        """
        SELECT id, scheduled_source_count, completed_source_count, failed_source_count, inserted_item_count
        FROM topic_sync_runs
        WHERE id = ?
        LIMIT 1
        """,
        (run_id,),
    )
    if existing is None:
        return

    completed_count = int(existing.get("completed_source_count") or 0) + (1 if success else 0)
    failed_count = int(existing.get("failed_source_count") or 0) + (0 if success else 1)
    inserted_item_count = int(existing.get("inserted_item_count") or 0) + max(int(inserted_count), 0)
    scheduled_count = int(existing.get("scheduled_source_count") or 0)
    finished = scheduled_count > 0 and completed_count + failed_count >= scheduled_count
    status = "running"
    if finished:
        status = "partial_failed" if failed_count > 0 else "completed"
    elif failed_count > 0:
        status = "running"

    connection.execute(
        """
        UPDATE topic_sync_runs
        SET status = ?, completed_source_count = ?, failed_source_count = ?, inserted_item_count = ?,
            last_error = ?, finished_at = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            status,
            completed_count,
            failed_count,
            inserted_item_count,
            error_message[:400] if error_message else None,
            now_param if finished else None,
            now_param,
            run_id,
        ),
    )


def has_pending_topic_fetch_job(connection: RuntimeConnection, source_id: int) -> bool:
    if connection.kind == "postgres":
        row = connection.fetchone(
            """
            SELECT id
            FROM job_queue
            WHERE job_type = ? AND status IN (?, ?) AND payload_json ->> 'sourceId' = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            ("topicFetch", "queued", "running", str(source_id)),
        )
        return row is not None

    row = connection.fetchone(
        """
        SELECT id
        FROM job_queue
        WHERE job_type = ? AND status IN (?, ?) AND payload_json LIKE ?
        ORDER BY id DESC
        LIMIT 1
        """,
        ("topicFetch", "queued", "running", f'%"sourceId": {source_id}%'),
    )
    return row is not None


def has_pending_knowledge_refresh_job(connection: RuntimeConnection, card_id: int) -> bool:
    if connection.kind == "postgres":
        row = connection.fetchone(
            """
            SELECT id
            FROM job_queue
            WHERE job_type = ? AND status IN (?, ?) AND payload_json ->> 'cardId' = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            ("knowledgeRefresh", "queued", "running", str(card_id)),
        )
        return row is not None

    row = connection.fetchone(
        """
        SELECT id
        FROM job_queue
        WHERE job_type = ? AND status IN (?, ?) AND payload_json LIKE ?
        ORDER BY id DESC
        LIMIT 1
        """,
        ("knowledgeRefresh", "queued", "running", f'%"cardId": {card_id}%'),
    )
    return row is not None


def sync_topics_for_source(connection: RuntimeConnection, source: dict[str, Any], limit_per_source: int = 4) -> int:
    topics = fetch_source_topics(source)
    inserted = 0
    topic_now = now_iso()
    topic_now_param = timestamp_value(connection, topic_now)

    for topic in topics[:limit_per_source]:
        owner_user_id = source.get("owner_user_id")
        existing = (
            connection.fetchone(
                """
                SELECT id
                FROM topic_items
                WHERE source_name = ? AND title = ? AND owner_user_id IS NULL
                ORDER BY id DESC
                LIMIT 1
                """,
                (source["name"], topic["title"]),
            )
            if owner_user_id is None
            else connection.fetchone(
                """
                SELECT id
                FROM topic_items
                WHERE source_name = ? AND title = ? AND owner_user_id = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                (source["name"], topic["title"], owner_user_id),
            )
        )
        if existing is not None:
            continue

        emotion_labels = pick_emotion_labels(str(topic["title"]))
        connection.execute(
            """
            INSERT INTO topic_items (
              owner_user_id, source_name, title, summary, emotion_labels_json, angle_options_json, source_url, published_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                owner_user_id,
                source["name"],
                topic["title"],
                build_topic_summary(str(topic["title"])),
                json_value(connection, emotion_labels),
                json_value(connection, build_angle_options(str(topic["title"]), emotion_labels)),
                topic.get("source_url"),
                topic_now_param,
                topic_now_param,
            ),
        )
        inserted += 1

    connection.execute(
        "UPDATE topic_sources SET last_fetched_at = ?, updated_at = ? WHERE id = ?",
        (topic_now_param, topic_now_param, source["id"]),
    )
    connection.commit()
    return inserted


def slugify(value: str) -> str:
    lowered = value.strip().lower()
    cleaned = []
    last_dash = False
    for char in lowered:
        if char.isalnum() or ("\u4e00" <= char <= "\u9fff"):
            cleaned.append(char)
            last_dash = False
        elif not last_dash:
            cleaned.append("-")
            last_dash = True
    return "".join(cleaned).strip("-")[:48] or "knowledge-card"


def tokenize_knowledge_text(value: str) -> list[str]:
    tokens = re.sub(r"[^\w\u4e00-\u9fff]+", " ", value.lower()).split()
    deduped: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        if len(token) < 2 or token in seen:
            continue
        deduped.append(token)
        seen.add(token)
        if len(deduped) >= 36:
            break
    return deduped


def sync_related_knowledge_links(
    connection: RuntimeConnection,
    user_ids: list[int],
    card_id: int,
    title: str,
    summary: str,
    status: str,
    source_fragment_ids: list[int],
) -> list[int]:
    connection.execute(
        "DELETE FROM knowledge_card_links WHERE source_card_id = ? OR target_card_id = ?",
        (card_id, card_id),
    )

    candidates = connection.fetchall(
        f"""
        SELECT kc.id, kc.user_id, kc.title, kc.summary, kc.status, kc.confidence_score
        FROM knowledge_cards kc
        WHERE kc.user_id IN ({", ".join("?" for _ in user_ids)}) AND kc.id != ?
        ORDER BY kc.updated_at DESC, kc.id DESC
        """,
        (*user_ids, card_id),
    )
    current_tokens = tokenize_knowledge_text(f"{title} {summary}")
    source_fragment_set = set(source_fragment_ids)
    selected: list[tuple[int, str, int, float]] = []

    for candidate in candidates:
        candidate_fragment_rows = connection.fetchall(
            "SELECT fragment_id FROM knowledge_card_fragments WHERE knowledge_card_id = ? ORDER BY id ASC",
            (candidate["id"],),
        )
        candidate_fragment_ids = [int(row["fragment_id"]) for row in candidate_fragment_rows]
        candidate_tokens = tokenize_knowledge_text(f"{candidate['title']} {candidate.get('summary') or ''}")
        token_overlap = len([token for token in current_tokens if token in candidate_tokens])
        shared_evidence = len([fragment_id for fragment_id in candidate_fragment_ids if fragment_id in source_fragment_set])
        exact_title_hit = (
            title.strip() == str(candidate["title"]).strip()
            or title in str(candidate["title"])
            or str(candidate["title"]) in title
        )
        score = token_overlap * 3 + shared_evidence * 6
        if exact_title_hit:
            score += 6
        if candidate["status"] == "active":
            score += 1
        if candidate["status"] == "archived":
            score -= 2
        if status == "conflicted" and candidate["status"] == "conflicted" and token_overlap > 0:
            score += 2
        if shared_evidence <= 0 and token_overlap < 2 and score < 6:
            continue
        link_type = "contradicts" if status == "conflicted" and candidate["status"] == "conflicted" and token_overlap > 0 else "mentions"
        selected.append((int(candidate["id"]), link_type, score, float(candidate["confidence_score"] or 0)))

    selected.sort(key=lambda item: (-item[2], -item[3], -item[0]))
    selected = selected[:4]
    now_param = timestamp_value(connection, now_iso())
    for target_card_id, link_type, _, _ in selected:
        connection.execute(
            """
            INSERT INTO knowledge_card_links (source_card_id, target_card_id, link_type, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (card_id, target_card_id, link_type, now_param),
    )
    return [target_card_id for target_card_id, _, _, _ in selected]


def load_fragments_for_compile(
    connection: RuntimeConnection,
    scope_user_ids: list[int],
    anchor_fragment_id: int | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    scope_placeholders = ", ".join("?" for _ in scope_user_ids)
    if anchor_fragment_id and anchor_fragment_id > 0:
        anchor = connection.fetchone(
            f"""
            SELECT id, title, source_type, distilled_content
            FROM fragments
            WHERE id = ? AND user_id IN ({scope_placeholders})
            LIMIT 1
            """,
            (anchor_fragment_id, *scope_user_ids),
        )
        if anchor is None:
            raise RuntimeError("anchor fragment not found in visible scope")
        additional = connection.fetchall(
            f"""
            SELECT id, title, source_type, distilled_content
            FROM fragments
            WHERE user_id IN ({scope_placeholders}) AND id != ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (*scope_user_ids, anchor_fragment_id, max(0, limit - 1)),
        )
        return [anchor, *additional]

    return connection.fetchall(
        f"""
        SELECT id, title, source_type, distilled_content
        FROM fragments
        WHERE user_id IN ({scope_placeholders})
        ORDER BY id DESC
        LIMIT ?
        """,
        (*scope_user_ids, limit),
    )


def compile_knowledge_card(
    connection: RuntimeConnection,
    user_id: int,
    title_hint: str | None = None,
    anchor_fragment_id: int | None = None,
) -> int:
    scope_user_ids = resolve_scope_user_ids(connection, user_id)
    fragments = load_fragments_for_compile(connection, scope_user_ids, anchor_fragment_id)
    if not fragments:
        raise RuntimeError("no fragments available for knowledge compile")

    primary = fragments[0]
    title = title_hint or primary["title"] or primary["distilled_content"][:18] or "未命名主题档案"
    slug = f"{slugify(title)}-{user_id}"
    summary = "；".join(str(fragment["distilled_content"]) for fragment in fragments)[:300]
    key_facts = [str(fragment["distilled_content"]) for fragment in fragments[:4]]
    open_questions = [
        "这一主题还缺少更强的时间线证据",
        "是否已经补到至少一条相反事实来源",
    ]
    status = "active"
    confidence = 0.72
    card_type = "topic" if primary["source_type"] == "url" else "event"
    now = now_iso()
    now_param = timestamp_value(connection, now)

    existing = connection.fetchone(
        f"SELECT id FROM knowledge_cards WHERE user_id IN ({', '.join('?' for _ in scope_user_ids)}) AND slug = ?",
        (*scope_user_ids, slug),
    )
    if existing is None:
        card_id = connection.insert(
            """
            INSERT INTO knowledge_cards (
              user_id, card_type, title, slug, summary, key_facts_json, open_questions_json,
              confidence_score, status, last_compiled_at, last_verified_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                card_type,
                title,
                slug,
                summary,
                json_value(connection, key_facts),
                json_value(connection, open_questions),
                confidence,
                status,
                now_param,
                now_param,
                now_param,
                now_param,
            ),
        )
    else:
        card_id = int(existing["id"])
        connection.execute(
            """
            UPDATE knowledge_cards
            SET card_type = ?, title = ?, summary = ?, key_facts_json = ?, open_questions_json = ?,
                confidence_score = ?, status = ?, last_compiled_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                card_type,
                title,
                summary,
                json_value(connection, key_facts),
                json_value(connection, open_questions),
                confidence,
                status,
                now_param,
                now_param,
                card_id,
            ),
        )
        connection.execute("DELETE FROM knowledge_card_fragments WHERE knowledge_card_id = ?", (card_id,))

    for fragment in fragments:
        connection.execute(
            """
            INSERT INTO knowledge_card_fragments (knowledge_card_id, fragment_id, relation_type, evidence_weight, created_at)
            VALUES (?, ?, 'evidence', 1, ?)
            """,
            (card_id, fragment["id"], now_param),
        )

    related_card_ids = sync_related_knowledge_links(
        connection,
        scope_user_ids,
        card_id,
        title,
        summary,
        status,
        [int(fragment["id"]) for fragment in fragments],
    )

    revision_count = connection.fetchone(
        "SELECT COUNT(*) AS count FROM knowledge_card_revisions WHERE knowledge_card_id = ?",
        (card_id,),
    )
    connection.execute(
        """
        INSERT INTO knowledge_card_revisions (
          knowledge_card_id, revision_no, compiled_payload_json, change_summary, compiled_by_job_id, created_at
        ) VALUES (?, ?, ?, ?, NULL, ?)
        """,
        (
            card_id,
            int(revision_count["count"]) + 1,
            json_value(
                connection,
                {
                    "summary": summary,
                    "keyFacts": key_facts,
                    "openQuestions": open_questions,
                    "sourceFragmentIds": [int(fragment["id"]) for fragment in fragments],
                    "relatedCardIds": related_card_ids,
                },
            ),
            "Worker 自动编译主题档案",
            now_param,
        ),
    )
    connection.commit()
    return card_id


def handle_capture_job(connection: RuntimeConnection, payload: dict[str, Any]) -> None:
    fragment_id = int(payload.get("fragmentId") or 0)
    if fragment_id <= 0:
        raise RuntimeError("capture job missing fragmentId")

    fragment = connection.fetchone(
        """
        SELECT id, user_id, title, raw_content, distilled_content, source_type, source_url, screenshot_path
        FROM fragments
        WHERE id = ?
        """,
        (fragment_id,),
    )
    if fragment is None:
        raise RuntimeError("fragment not found")

    source_url = payload.get("url") or fragment["source_url"]
    screenshot_path = payload.get("screenshotPath") or fragment["screenshot_path"]
    source_type = payload.get("sourceType") or fragment["source_type"]
    title_hint = str(payload.get("title") or fragment.get("title") or "").strip()
    raw_content = str(fragment.get("raw_content") or payload.get("rawContent") or "").strip()
    distilled_content = str(fragment.get("distilled_content") or payload.get("distilledContent") or "").strip()
    now = now_iso()
    now_param = timestamp_value(connection, now)

    if source_type == "url" and source_url and (payload.get("retryUrlFetch") or payload.get("retryDistill")):
        retry_payload = dict(payload)
        try:
            article = fetch_url_article(str(source_url))
            title_hint = title_hint or str(article.get("title") or infer_title_from_url(str(source_url)))
            regenerated = generate_fragment_distill(connection, "url", title_hint, str(article["rawText"]), str(source_url))
            connection.execute(
                """
                UPDATE fragments
                SET title = ?, raw_content = ?, distilled_content = ?, source_url = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    regenerated["title"],
                    regenerated["rawContent"],
                    regenerated["distilledContent"],
                    source_url,
                    now_param,
                    fragment_id,
                ),
            )
            title_hint = regenerated["title"]
            raw_content = regenerated["rawContent"]
            distilled_content = regenerated["distilledContent"]
            retry_payload.update(
                {
                    "title": regenerated["title"],
                    "rawContent": regenerated["rawContent"],
                    "distilledContent": regenerated["distilledContent"],
                    "retryUrlFetch": False,
                    "retryDistill": False,
                    "retryRecoveredAt": now,
                    "retryModel": regenerated.get("model"),
                    "retryProvider": regenerated.get("provider"),
                    "retryError": None,
                }
            )
            payload = retry_payload
        except Exception as error:
            payload = {
                **retry_payload,
                "retryUrlFetch": False,
                "retryDistill": False,
                "retryAttemptedAt": now,
                "retryError": str(error),
            }

    existing_source = connection.fetchone(
        "SELECT id FROM fragment_sources WHERE fragment_id = ?",
        (fragment_id,),
    )
    raw_payload = json_value(connection, payload)
    if existing_source is None:
        connection.execute(
            """
            INSERT INTO fragment_sources (fragment_id, source_type, source_url, screenshot_path, raw_payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (fragment_id, source_type, source_url, screenshot_path, raw_payload, now_param),
        )
    else:
        connection.execute(
            """
            UPDATE fragment_sources
            SET source_type = ?, source_url = ?, screenshot_path = ?, raw_payload_json = ?
            WHERE fragment_id = ?
            """,
            (source_type, source_url, screenshot_path, raw_payload, fragment_id),
        )

    enqueue_job(connection, "knowledgeCompile", {"userId": int(fragment["user_id"]), "fragmentId": fragment_id})
    connection.commit()


def handle_vision_note_job(connection: RuntimeConnection, payload: dict[str, Any]) -> None:
    fragment_id = int(payload.get("fragmentId") or 0)
    if fragment_id <= 0:
        raise RuntimeError("visionNote job missing fragmentId")

    fragment = connection.fetchone(
        """
        SELECT id, user_id, title, raw_content, screenshot_path
        FROM fragments
        WHERE id = ?
        """,
        (fragment_id,),
    )
    if fragment is None:
        raise RuntimeError("fragment not found")

    title_hint = str(payload.get("title") or fragment.get("title") or "截图碎片")
    note = str(payload.get("note") or fragment.get("raw_content") or "")
    screenshot_path = str(payload.get("screenshotPath") or fragment.get("screenshot_path") or "").strip()
    if not screenshot_path:
        raise RuntimeError("visionNote job missing screenshotPath")

    result = generate_vision_note(connection, title_hint, note, screenshot_path)
    now = now_iso()
    now_param = timestamp_value(connection, now)
    connection.execute(
        """
        UPDATE fragments
        SET title = ?, raw_content = ?, distilled_content = ?, screenshot_path = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            result["title"],
            result["rawContent"],
            result["distilledContent"],
            screenshot_path,
            now_param,
            fragment_id,
        ),
    )
    handle_capture_job(
        connection,
        {
            **payload,
            "fragmentId": fragment_id,
            "sourceType": "screenshot",
            "screenshotPath": screenshot_path,
            "title": result["title"],
            "rawContent": result["rawContent"],
            "distilledContent": result["distilledContent"],
            "visionModel": result.get("model"),
            "visionProvider": result.get("provider"),
            "visionErrors": result.get("errors"),
        },
    )


def handle_knowledge_compile_job(connection: RuntimeConnection, payload: dict[str, Any]) -> None:
    user_id = int(payload.get("userId") or 0)
    if user_id <= 0:
        raise RuntimeError("knowledgeCompile job missing userId")
    fragment_id = int(payload.get("fragmentId") or 0)
    title_hint = str(payload.get("titleHint") or "").strip() or None
    compile_knowledge_card(connection, user_id, title_hint=title_hint, anchor_fragment_id=fragment_id or None)


def handle_knowledge_refresh_job(connection: RuntimeConnection, payload: dict[str, Any]) -> None:
    card_id = int(payload.get("cardId") or 0)
    if card_id <= 0:
        raise RuntimeError("knowledgeRefresh job missing cardId")

    card = connection.fetchone(
        "SELECT id, user_id, title FROM knowledge_cards WHERE id = ?",
        (card_id,),
    )
    if card is None:
        raise RuntimeError("knowledge card not found")
    compile_knowledge_card(connection, int(card["user_id"]), str(card["title"]))


def handle_topic_fetch_job(connection: RuntimeConnection, payload: dict[str, Any]) -> None:
    source_id = int(payload.get("sourceId") or 0)
    if source_id <= 0:
        raise RuntimeError("topicFetch job missing sourceId")

    source = connection.fetchone(
        """
        SELECT id, owner_user_id, name, homepage_url, is_active
        FROM topic_sources
        WHERE id = ?
        """,
        (source_id,),
    )
    if source is None:
        raise RuntimeError("topic source not found")
    if not source.get("is_active"):
        return

    inserted = sync_topics_for_source(connection, source, int(payload.get("limitPerSource") or 4))
    payload["insertedCount"] = int(inserted)


def handle_writing_eval_run_job(connection: RuntimeConnection, payload: dict[str, Any]) -> None:
    run_id = int(payload.get("runId") or 0)
    if run_id <= 0:
        raise RuntimeError("writingEvalRun job missing runId")

    run = connection.fetchone(
        """
        SELECT id, run_code, dataset_id, base_version_type, base_version_ref, candidate_version_type, candidate_version_ref, experiment_mode
        FROM writing_optimization_runs
        WHERE id = ?
        LIMIT 1
        """,
        (run_id,),
    )
    if run is None:
        raise RuntimeError("writing eval run not found")

    started_at = now_iso()
    started_param = timestamp_value(connection, started_at)
    connection.execute(
        """
        UPDATE writing_optimization_runs
        SET status = 'running', started_at = ?, finished_at = NULL, error_message = NULL, score_summary_json = ?
        WHERE id = ?
        """,
        (started_param, json_value(connection, {"casesProcessed": 0}), run_id),
    )
    connection.execute("DELETE FROM writing_optimization_results WHERE run_id = ?", (run_id,))
    connection.commit()

    candidate_scored_results: list[dict[str, Any]] = []
    base_scored_results: list[dict[str, Any]] = []
    try:
        experiment_mode = normalize_writing_eval_experiment_mode(run.get("experiment_mode"))
        base_prompt = resolve_writing_eval_prompt(
            connection,
            str(run.get("base_version_type") or ""),
            str(run.get("base_version_ref") or ""),
        )
        base_scoring_profile = resolve_writing_eval_scoring_profile(
            connection,
            str(run.get("base_version_type") or ""),
            str(run.get("base_version_ref") or ""),
        )
        base_layout_strategy = resolve_writing_eval_layout_strategy(
            connection,
            str(run.get("base_version_type") or ""),
            str(run.get("base_version_ref") or ""),
        )
        base_apply_command_template = resolve_writing_eval_apply_command_template(
            str(run.get("base_version_type") or ""),
            str(run.get("base_version_ref") or ""),
        )
        candidate_prompt = resolve_writing_eval_prompt(
            connection,
            str(run.get("candidate_version_type") or ""),
            str(run.get("candidate_version_ref") or ""),
        )
        candidate_scoring_profile = resolve_writing_eval_scoring_profile(
            connection,
            str(run.get("candidate_version_type") or ""),
            str(run.get("candidate_version_ref") or ""),
        )
        candidate_layout_strategy = resolve_writing_eval_layout_strategy(
            connection,
            str(run.get("candidate_version_type") or ""),
            str(run.get("candidate_version_ref") or ""),
        )
        candidate_apply_command_template = resolve_writing_eval_apply_command_template(
            str(run.get("candidate_version_type") or ""),
            str(run.get("candidate_version_ref") or ""),
        )
        cases = connection.fetchall(
            """
            SELECT id, task_code, task_type, topic_title, input_payload_json, expected_constraints_json, viral_targets_json,
                   stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json, difficulty_level
            FROM writing_eval_cases
            WHERE dataset_id = ? AND is_enabled = ?
            ORDER BY id ASC
            """,
            (int(run["dataset_id"]), True if connection.kind == "postgres" else 1),
        )
        if not cases:
            raise RuntimeError("当前评测集没有启用中的样本")

        for case_row in cases:
            try:
                if (
                    base_prompt["promptId"] == candidate_prompt["promptId"]
                    and base_prompt["version"] == candidate_prompt["version"]
                    and base_prompt["sceneCode"] == candidate_prompt["sceneCode"]
                    and base_prompt["promptContent"] == candidate_prompt["promptContent"]
                    and base_layout_strategy["label"] == candidate_layout_strategy["label"]
                    and base_apply_command_template["label"] == candidate_apply_command_template["label"]
                ):
                    candidate_generated, candidate_scores, candidate_model, candidate_errors = execute_writing_eval_case(
                        connection,
                        case_row,
                        candidate_prompt,
                        candidate_scoring_profile,
                        experiment_mode,
                        candidate_layout_strategy,
                        candidate_apply_command_template,
                    )
                    candidate_scores["status"] = "succeeded"
                    base_generated = candidate_generated
                    base_scores = score_writing_result(
                        case_row,
                        base_generated,
                        base_prompt,
                        candidate_model,
                        base_scoring_profile,
                        experiment_mode,
                    )
                    base_scores["status"] = "succeeded"
                    base_scores["judge_payload_json"]["layoutStrategyLabel"] = base_layout_strategy["label"]
                    base_scores["judge_payload_json"]["applyCommandTemplateLabel"] = base_apply_command_template["label"]
                    base_model = candidate_model
                    base_errors = list(candidate_errors)
                else:
                    base_generated, base_scores, base_model, base_errors = execute_writing_eval_case(
                        connection,
                        case_row,
                        base_prompt,
                        base_scoring_profile,
                        experiment_mode,
                        base_layout_strategy,
                        base_apply_command_template,
                    )
                    base_scores["status"] = "succeeded"
                    candidate_generated, candidate_scores, candidate_model, candidate_errors = execute_writing_eval_case(
                        connection,
                        case_row,
                        candidate_prompt,
                        candidate_scoring_profile,
                        experiment_mode,
                        candidate_layout_strategy,
                        candidate_apply_command_template,
                    )
                    candidate_scores["status"] = "succeeded"

                delta_scores = build_score_delta(candidate_scores, base_scores)
                winner = determine_winner(candidate_scores, base_scores)
                candidate_judge_payload = dict(candidate_scores["judge_payload_json"])
                if candidate_errors:
                    candidate_judge_payload["fallbackErrors"] = candidate_errors
                candidate_judge_payload["baseline"] = {
                    "versionRef": str(run.get("base_version_ref") or ""),
                    "versionType": str(run.get("base_version_type") or ""),
                    "model": base_model,
                    "generated": base_generated,
                    "scores": build_score_snapshot(base_scores),
                    "judge": base_scores["judge_payload_json"],
                    "fallbackErrors": base_errors,
                }
                candidate_judge_payload["comparison"] = {
                    "winner": winner,
                    "delta": delta_scores,
                    "candidateVersionRef": str(run.get("candidate_version_ref") or ""),
                    "baseVersionRef": str(run.get("base_version_ref") or ""),
                    "experimentMode": experiment_mode,
                }
                candidate_judge_payload["versions"] = {
                    "base": {
                        "type": str(run.get("base_version_type") or ""),
                        "ref": str(run.get("base_version_ref") or ""),
                        "label": base_prompt["label"],
                        "sceneCode": base_prompt["sceneCode"],
                        "scoringProfile": base_scoring_profile["label"],
                        "layoutStrategy": base_layout_strategy["label"],
                        "applyCommandTemplate": base_apply_command_template["label"],
                    },
                    "candidate": {
                        "type": str(run.get("candidate_version_type") or ""),
                        "ref": str(run.get("candidate_version_ref") or ""),
                        "label": candidate_prompt["label"],
                        "sceneCode": candidate_prompt["sceneCode"],
                        "scoringProfile": candidate_scoring_profile["label"],
                        "layoutStrategy": candidate_layout_strategy["label"],
                        "applyCommandTemplate": candidate_apply_command_template["label"],
                    },
                }
                candidate_judge_payload["experimentMode"] = experiment_mode
                candidate_scores["judge_payload_json"] = candidate_judge_payload
            except Exception as case_error:
                error_message = str(case_error)
                base_generated = build_failed_generation(case_row, error_message)
                candidate_generated = build_failed_generation(case_row, error_message)
                base_model = "failed"
                candidate_model = "failed"
                base_errors = []
                candidate_errors = []
                base_scores = build_failed_scores(base_prompt, base_model, case_row, error_message)
                candidate_scores = build_failed_scores(candidate_prompt, candidate_model, case_row, error_message)
                base_scores["status"] = "failed"
                candidate_scores["status"] = "failed"
                candidate_scores["judge_payload_json"]["baseline"] = {
                    "versionRef": str(run.get("base_version_ref") or ""),
                    "versionType": str(run.get("base_version_type") or ""),
                    "model": base_model,
                    "generated": base_generated,
                    "scores": build_score_snapshot(base_scores),
                    "judge": base_scores["judge_payload_json"],
                    "fallbackErrors": base_errors,
                }
                candidate_scores["judge_payload_json"]["comparison"] = {
                    "winner": "failed",
                    "delta": build_score_delta(candidate_scores, base_scores),
                    "candidateVersionRef": str(run.get("candidate_version_ref") or ""),
                    "baseVersionRef": str(run.get("base_version_ref") or ""),
                    "experimentMode": experiment_mode,
                }
                candidate_scores["judge_payload_json"]["versions"] = {
                    "base": {
                        "type": str(run.get("base_version_type") or ""),
                        "ref": str(run.get("base_version_ref") or ""),
                        "label": base_prompt["label"],
                        "sceneCode": base_prompt["sceneCode"],
                        "layoutStrategy": base_layout_strategy["label"],
                        "applyCommandTemplate": base_apply_command_template["label"],
                    },
                    "candidate": {
                        "type": str(run.get("candidate_version_type") or ""),
                        "ref": str(run.get("candidate_version_ref") or ""),
                        "label": candidate_prompt["label"],
                        "sceneCode": candidate_prompt["sceneCode"],
                        "layoutStrategy": candidate_layout_strategy["label"],
                        "applyCommandTemplate": candidate_apply_command_template["label"],
                    },
                }
                candidate_scores["judge_payload_json"]["experimentMode"] = experiment_mode
                candidate_scores["judge_payload_json"]["caseError"] = error_message[:500]

            save_writing_eval_result(connection, run_id, int(case_row["id"]), candidate_generated, candidate_scores)
            candidate_scored_results.append(candidate_scores)
            base_scored_results.append(base_scores)
            connection.commit()

        score_payload = {
            "casesProcessed": len(candidate_scored_results),
            "baseVersionRef": str(run.get("base_version_ref") or ""),
            "candidateVersionRef": str(run.get("candidate_version_ref") or ""),
            "baseVersionType": str(run.get("base_version_type") or ""),
            "candidateVersionType": str(run.get("candidate_version_type") or ""),
            "experimentMode": experiment_mode,
            "pipelineStage": "generation_completed",
            "generationCompletedAt": now_iso(),
        }
        connection.execute(
            """
            UPDATE writing_optimization_runs
            SET status = 'scoring', score_summary_json = ?, finished_at = NULL, error_message = NULL
            WHERE id = ?
            """,
            (json_value(connection, score_payload), run_id),
        )
        connection.commit()
        enqueue_job(connection, "writingEvalScore", {"runId": run_id, "runCode": str(run.get("run_code") or "")})
    except Exception as error:
        failed_at = now_iso()
        summary = summarize_writing_eval_scores(candidate_scored_results, base_scored_results if base_scored_results else None)
        summary["error"] = str(error)
        summary["experimentMode"] = normalize_writing_eval_experiment_mode(run.get("experiment_mode"))
        connection.execute(
            """
            UPDATE writing_optimization_runs
            SET status = 'failed', score_summary_json = ?, error_message = ?, finished_at = ?
            WHERE id = ?
            """,
            (
                json_value(connection, summary),
                str(error)[:400],
                timestamp_value(connection, failed_at),
                run_id,
            ),
        )
        connection.commit()
        raise


def handle_writing_eval_score_job(connection: RuntimeConnection, payload: dict[str, Any]) -> None:
    run_id = int(payload.get("runId") or 0)
    if run_id <= 0:
        raise RuntimeError("writingEvalScore job missing runId")

    run = connection.fetchone(
        """
        SELECT id, run_code, base_version_type, base_version_ref, candidate_version_type, candidate_version_ref, experiment_mode
        FROM writing_optimization_runs
        WHERE id = ?
        LIMIT 1
        """,
        (run_id,),
    )
    if run is None:
        raise RuntimeError("writing eval run not found")

    try:
        candidate_results, base_results = extract_candidate_and_base_score_inputs(connection, run_id)
        if not candidate_results:
            raise RuntimeError("当前实验还没有可评分结果")
        summary = summarize_writing_eval_scores(candidate_results, base_results)
        summary["baseVersionRef"] = str(run.get("base_version_ref") or "")
        summary["candidateVersionRef"] = str(run.get("candidate_version_ref") or "")
        summary["baseVersionType"] = str(run.get("base_version_type") or "")
        summary["candidateVersionType"] = str(run.get("candidate_version_type") or "")
        summary["experimentMode"] = normalize_writing_eval_experiment_mode(run.get("experiment_mode"))
        summary["pipelineStage"] = "score_completed"
        summary["scoreCompletedAt"] = now_iso()
        connection.execute(
            """
            UPDATE writing_optimization_runs
            SET status = 'promoting', score_summary_json = ?, error_message = NULL
            WHERE id = ?
            """,
            (json_value(connection, summary), run_id),
        )
        connection.commit()
        enqueue_job(connection, "writingEvalPromote", {"runId": run_id, "runCode": str(run.get("run_code") or "")})
    except Exception as error:
        failed_at = now_iso()
        connection.execute(
            """
            UPDATE writing_optimization_runs
            SET status = 'failed', error_message = ?, finished_at = ?
            WHERE id = ?
            """,
            (str(error)[:400], timestamp_value(connection, failed_at), run_id),
        )
        connection.commit()
        raise


def handle_writing_eval_promote_job(connection: RuntimeConnection, payload: dict[str, Any]) -> None:
    run_id = int(payload.get("runId") or 0)
    if run_id <= 0:
        raise RuntimeError("writingEvalPromote job missing runId")

    run = connection.fetchone(
        """
        SELECT id, decision_mode, resolution_status, score_summary_json
        FROM writing_optimization_runs
        WHERE id = ?
        LIMIT 1
        """,
        (run_id,),
    )
    if run is None:
        raise RuntimeError("writing eval run not found")

    try:
        summary = parse_payload(run.get("score_summary_json"))
        decision = build_promotion_decision_from_summary(summary)
        decision_mode = normalize_writing_eval_decision_mode(run.get("decision_mode"))
        resolution_status = normalize_writing_eval_resolution_status(run.get("resolution_status"))
        finished_at = now_iso()
        summary["autoDecision"] = decision["suggestion"]
        summary["autoDecisionReason"] = decision["reason"]
        summary["autoExecutionMode"] = decision_mode
        summary["autoExecutionTargetDecision"] = decision["suggestion"]
        summary["autoExecutionReason"] = decision["reason"]
        summary["autoExecutionAttempted"] = False
        summary["autoExecutionCompletedAt"] = None
        summary["autoExecutionResult"] = "manual_review"
        summary.pop("autoExecutionError", None)
        summary["pipelineStage"] = "promotion_ready"
        summary["promotionCompletedAt"] = finished_at
        connection.execute(
            """
            UPDATE writing_optimization_runs
            SET status = 'succeeded', score_summary_json = ?, finished_at = ?, error_message = NULL
            WHERE id = ?
            """,
            (json_value(connection, summary), timestamp_value(connection, finished_at), run_id),
        )
        connection.commit()

        auto_execute_decision: str | None = None
        if resolution_status != "pending":
            summary["autoExecutionResult"] = "noop_already_resolved"
        elif decision_mode == "auto_keep_or_discard":
            auto_execute_decision = decision["suggestion"]
        elif decision_mode == "auto_keep":
            if decision["suggestion"] == "keep":
                auto_execute_decision = "keep"
            else:
                summary["autoExecutionResult"] = "skipped_non_keep"

        should_persist_auto_execution_summary = auto_execute_decision is not None or summary["autoExecutionResult"] != "manual_review"
        if auto_execute_decision:
            summary["autoExecutionAttempted"] = True
            try:
                result = dispatch_writing_eval_auto_resolve(run_id, auto_execute_decision, decision["reason"])
                summary["autoExecutionCompletedAt"] = now_iso()
                if isinstance(result, dict):
                    action = str(result.get("action") or auto_execute_decision).strip() or auto_execute_decision
                    summary["autoExecutionResult"] = "noop_already_resolved" if action == "noop" else action
                else:
                    summary["autoExecutionResult"] = "missing_service_dispatch_result"
            except Exception as error:
                summary["autoExecutionCompletedAt"] = now_iso()
                summary["autoExecutionResult"] = "failed"
                summary["autoExecutionError"] = str(error)[:400]
        if should_persist_auto_execution_summary:
            connection.execute(
                """
                UPDATE writing_optimization_runs
                SET score_summary_json = ?, error_message = NULL
                WHERE id = ?
                """,
                (json_value(connection, summary), run_id),
            )
            connection.commit()
    except Exception as error:
        failed_at = now_iso()
        connection.execute(
            """
            UPDATE writing_optimization_runs
            SET status = 'failed', error_message = ?, finished_at = ?
            WHERE id = ?
            """,
            (str(error)[:400], timestamp_value(connection, failed_at), run_id),
        )
        connection.commit()
        raise


def handle_job(connection: RuntimeConnection, job: dict[str, Any]) -> None:
    payload = parse_payload(job.get("payload_json"))
    job_type = job["job_type"]
    if job_type == "capture":
        handle_capture_job(connection, payload)
        return
    if job_type == "visionNote":
        handle_vision_note_job(connection, payload)
        return
    if job_type == "knowledgeCompile":
        handle_knowledge_compile_job(connection, payload)
        return
    if job_type == "knowledgeRefresh":
        handle_knowledge_refresh_job(connection, payload)
        return
    if job_type == "topicFetch":
        handle_topic_fetch_job(connection, payload)
        connection.execute(
            "UPDATE job_queue SET payload_json = ?, updated_at = ? WHERE id = ?",
            (json_value(connection, payload), timestamp_value(connection, now_iso()), int(job["id"])),
        )
        connection.commit()
        return
    if job_type == "writingEvalRun":
        handle_writing_eval_run_job(connection, payload)
        return
    if job_type == "writingEvalScore":
        handle_writing_eval_score_job(connection, payload)
        return
    if job_type == "writingEvalPromote":
        handle_writing_eval_promote_job(connection, payload)
        return

    connection.execute(
        "UPDATE job_queue SET last_error = ?, updated_at = ? WHERE id = ?",
        (f"skipped unsupported job type: {job_type}", timestamp_value(connection, now_iso()), job["id"]),
    )
    connection.commit()


def run_scheduler_tick(connection: RuntimeConnection) -> dict[str, int]:
    ensure_runtime_scheduler_schema(connection)
    now_dt = datetime.now(timezone.utc)
    now = now_dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    stale_lock_before = (
        now_dt - timedelta(minutes=10)
    ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    free_snapshot_before = (
        now_dt - timedelta(days=3)
    ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    stale_knowledge_before = (
        now_dt - timedelta(days=7)
    ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    now_param = timestamp_value(connection, now)
    stale_lock_before_param = timestamp_value(connection, stale_lock_before)
    free_snapshot_before_param = timestamp_value(connection, free_snapshot_before)
    stale_knowledge_before_param = timestamp_value(connection, stale_knowledge_before)

    expired_tokens = connection.execute(
        """
        UPDATE wechat_connections
        SET status = 'expired', updated_at = ?
        WHERE access_token_expires_at IS NOT NULL AND access_token_expires_at <= ? AND status = 'valid'
        """,
        (now_param, now_param),
    )
    requeued_jobs = connection.execute(
        """
        UPDATE job_queue
        SET status = 'queued', locked_at = NULL, run_at = ?, updated_at = ?
        WHERE status = 'running' AND locked_at IS NOT NULL AND locked_at < ?
        """,
        (now_param, now_param, stale_lock_before_param),
    )
    deleted_snapshots = connection.execute(
        """
        DELETE FROM document_snapshots
        WHERE id IN (
          SELECT s.id
          FROM document_snapshots s
          INNER JOIN documents d ON d.id = s.document_id
          INNER JOIN users u ON u.id = d.user_id
          WHERE u.plan_code = 'free' AND s.created_at < ?
        )
        """,
        (free_snapshot_before_param,),
    )
    stale_cards_marked = connection.execute(
        """
        UPDATE knowledge_cards
        SET status = 'stale', updated_at = ?
        WHERE status = 'active' AND last_compiled_at IS NOT NULL AND last_compiled_at < ?
        """,
        (now_param, stale_knowledge_before_param),
    )

    topic_jobs_enqueued = 0
    topic_sync_window = get_current_topic_sync_window(now_dt)
    if topic_sync_window is not None:
        sources = connection.fetchall(
            """
            SELECT id, owner_user_id, name, homepage_url, source_type, priority, last_fetched_at
            FROM topic_sources
            WHERE is_active = ?
            ORDER BY priority DESC, owner_user_id ASC, id ASC
            """,
            (True if connection.kind == "postgres" else 1,),
        )
        due_sources: list[dict[str, Any]] = []

        for source in sources:
            last_fetched_at = source.get("last_fetched_at")
            if last_fetched_at:
                try:
                    last_fetch_time = datetime.fromisoformat(str(last_fetched_at).replace("Z", "+00:00"))
                    if last_fetch_time >= topic_sync_window:
                        continue
                except ValueError:
                    pass

            if has_pending_topic_fetch_job(connection, int(source["id"])):
                continue

            due_sources.append(source)

        topic_sync_run_id = (
            upsert_topic_sync_run(connection, topic_sync_window, len(due_sources), len(due_sources))
            if due_sources
            else 0
        )

        for source in due_sources:
            enqueue_job(
                connection,
                "topicFetch",
                {
                    "sourceId": int(source["id"]),
                    "limitPerSource": 4,
                    "topicSyncRunId": topic_sync_run_id,
                    "topicSyncWindowStart": topic_sync_window.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                },
            )
            topic_jobs_enqueued += 1

    knowledge_refresh_enqueued = 0
    stale_cards = connection.fetchall(
        """
        SELECT id
        FROM knowledge_cards
        WHERE status = 'stale'
        ORDER BY last_compiled_at ASC, id ASC
        LIMIT 12
        """
    )
    for card in stale_cards:
        card_id = int(card["id"])
        if has_pending_knowledge_refresh_job(connection, card_id):
            continue
        enqueue_job(
            connection,
            "knowledgeRefresh",
            {
                "cardId": card_id,
            },
        )
        knowledge_refresh_enqueued += 1

    connection.commit()
    return {
        "expired_tokens": int(expired_tokens),
        "requeued_jobs": int(requeued_jobs),
        "deleted_snapshots": int(deleted_snapshots),
        "stale_cards_marked": int(stale_cards_marked),
        "knowledge_refresh_enqueued": int(knowledge_refresh_enqueued),
        "topic_jobs_enqueued": int(topic_jobs_enqueued),
    }
