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
