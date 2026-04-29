#!/usr/bin/env python3
import argparse
import http.client
import html
import http.cookiejar
import json
import os
import random
import re
import sqlite3
import ssl
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path


KB_ID = "yzwtEwztOBEMAhDI92qcCxOe4HqWDNWgKMg5IMgNkEM="
KB_NAME = "公众号10W+爆文素材库(持续更新)"
ARTIFACT_DIR = Path("artifacts/plan24")
RAW_CACHE_PATH = Path("/tmp/huoziwriter-plan24-fulltext-raw.json")
WEWE_RAW_CACHE_PATH = Path("/tmp/huoziwriter-plan24-wewe-fulltext-raw.json")
CANDIDATE_CACHE_PATH = Path("/tmp/huoziwriter-plan24-candidates.json")
SAMPLE_PATH = ARTIFACT_DIR / "fulltext-100-sample.json"
ANALYSIS_PATH = ARTIFACT_DIR / "fulltext-100-analysis.json"
REPORT_PATH = ARTIFACT_DIR / "fulltext-100-analysis.md"
DEFAULT_FOCUS_PROFILE = "broad"

SENSITIVE_RE = re.compile(
    r"政治|政务|政府|外交|国际冲突|战争|军事|军工|武器|袭击|恐怖|制裁|特朗普|美国最大敌人|霸权|"
    r"猝死|死亡(?!谷)|死去|离世|遇害|杀人|凶杀|被杀|杀害|自杀|刑事|血腥|暴力|欺凌|嫖娼|成人网站|OnlyFans|低俗|擦边|"
    r"中医|国学中医|治愈|药|医院|诊断|癌|抑郁|焦虑|恐吓|彩票|生肖|运势|祝福|壁纸|招聘|公告"
)

LOW_SIGNAL_RE = re.compile(r"今日头条|全文|公告|招聘|壁纸|祝福|生肖|运势|星座|彩票")

RECRUITING_RE = re.compile(
    r"春招|秋招|校招|社招|实习|实习生|暑期实习|寒假实习|内推|岗位|招人|招招招|"
    r"坑位告急|简历|offer|入职|转正机会|校园招聘|应届生"
)

BAD_BODY_RE = re.compile(
    r"图文来自网络|如有侵权|联系删除|喜欢点个赞|支持就在看|点击蓝字关注|"
    r"倒贴钱|丑八怪|太难看|低俗|擦边|美女校花|吓一跳"
)

GENERIC_OPENING_RE = re.compile(
    r"^(现在这个|在当今|随着社会|众所周知|对于很多|大家都知道|近年来)"
)

IMG_TAG_RE = re.compile(r"<img\b[^>]*>", re.I)
ATTR_RE = re.compile(r"([:\w-]+)\s*=\s*(['\"])(.*?)\2", re.S)

CATEGORY_QUERIES = {
    "AI与科技": ["AI", "DeepSeek", "Manus", "智能体", "AI工具", "机器人"],
    "商业与公司": ["商业", "公司", "品牌", "创业", "产品", "增长"],
    "职场与个人成长": ["职场", "普通人", "年轻人", "打工人", "副业", "成长"],
    "消费与生活方式": ["消费", "年轻人", "生活方式", "小红书", "买", "省钱"],
    "旅行与城市": ["旅游", "城市", "春游", "旅行", "县城", "周末"],
    "教育与学习": ["教育", "大学生", "学习", "高考", "老师", "孩子"],
    "情感与关系": ["情感", "关系", "婚姻", "男人", "女人", "家庭"],
    "文化与审美": ["文化", "审美", "读书", "电影", "音乐", "故事"],
}

ACCOUNT_VERTICALS = {
    "机器之心": "AI与科技",
    "量子位": "AI与科技",
    "Founder Park": "商业与公司",
    "极客公园": "AI与科技",
    "虎嗅APP": "商业与公司",
    "晚点LatePost": "商业与公司",
    "刀法研究所": "商业与公司",
    "36氪": "商业与公司",
    "DT商业观察": "消费与生活方式",
    "品牌星球Brandstar": "消费与生活方式",
    "企鹅吃喝指南": "消费与生活方式",
    "一条": "消费与生活方式",
    "星球研究所": "旅行与城市",
    "中国国家地理": "旅行与城市",
    "地道风物": "旅行与城市",
    "看理想": "文化与审美",
    "单读": "文化与审美",
    "一席": "文化与审美",
    "人物": "文化与审美",
    "GQ实验室": "文化与审美",
    "Lens": "文化与审美",
    "果壳": "教育与学习",
    "外滩教育": "教育与学习",
    "新世相": "情感与关系",
    "简单心理": "情感与关系",
    "我要WhatYouNeed": "情感与关系",
    "KnowYourself": "情感与关系",
}

DIVERSITY_CATEGORY_WEIGHTS = {
    "AI与科技": 0.18,
    "商业与公司": 0.14,
    "职场与个人成长": 0.12,
    "消费与生活方式": 0.14,
    "旅行与城市": 0.10,
    "教育与学习": 0.10,
    "文化与审美": 0.12,
    "情感与关系": 0.10,
}

DEFAULT_MIN_CATEGORIES = 6
DEFAULT_MIN_ACCOUNTS = 12
DEFAULT_MAX_CATEGORY_SHARE = 0.35
DEFAULT_MAX_ACCOUNT_SHARE = 0.12
DEFAULT_FETCH_CONCURRENCY = 6

FOCUS_PROFILE_CONFIGS = {
    "broad": {
        "label": "广谱多题材",
        "min_categories": DEFAULT_MIN_CATEGORIES,
        "min_accounts": DEFAULT_MIN_ACCOUNTS,
        "max_category_share": DEFAULT_MAX_CATEGORY_SHARE,
        "max_account_share": DEFAULT_MAX_ACCOUNT_SHARE,
        "categories": {},
    },
    "business-monetization": {
        "label": "商业变现与AI工具聚焦",
        "min_categories": 7,
        "min_accounts": 8,
        "max_category_share": 0.40,
        "max_account_share": 0.20,
        "candidate_per_account_cap": 20,
        "categories": {
            "AI产品与Agent": {
                "weight": 0.20,
                "title_patterns": [
                    r"(AI|大模型|模型|智能体|Agent|OpenAI|Claude|Cursor|编程|工作流|自动化|多模态|推理|infra|benchmark|龙虾|AI产品|AI工具)"
                ],
                "text_patterns": [
                    r"(AI产品|AI 工具|模型能力|工作流|自动化|提示词|agent|智能体|编程|开发流|推理|基建|token|API)"
                ],
                "account_patterns": [r"(机器之心|量子位|新智元|数字生命卡兹克|APPSO)"],
            },
            "商业案例与创业": {
                "weight": 0.22,
                "title_patterns": [
                    r"(创业|公司|品牌|融资|商业|增长|创始人|CEO|案例|生意|经营|市场|产品战略|商业化)"
                ],
                "text_patterns": [
                    r"(创业|创始人|公司|品牌|商业模型|增长|经营|渠道|商业化|用户需求|定位|转化)"
                ],
                "account_patterns": [r"(刀法研究所|晚点LatePost|Founder Park|虎嗅APP|DT商业观察)"],
            },
            "产品评测与效率工具": {
                "weight": 0.13,
                "title_patterns": [r"(实测|亲测|评测|测评|上手|工具|效率|软件|应用|插件|AI助手|工作流|汽车|手机|硬件|产品体验)"],
                "text_patterns": [r"(实测|体验|对比|效率|工具|软件|插件|上手|功能|工作流|使用成本|产品体验|交互成本)"],
                "account_patterns": [r"(MacTalk|APPSO|雷科技|数字生命卡兹克|Founder Park|虎嗅APP)"],
            },
            "实操复盘与解决方案": {
                "weight": 0.13,
                "title_patterns": [r"(复盘|拆解|方法|流程|方案|手册|教程|踩坑|解决|实践|经验|怎么做|如何做|对话|推荐这\\s*\\d+\\s*款|做到了)"],
                "text_patterns": [r"(复盘|拆解|流程|方案|实践|经验|第一|第二|第三|步骤|清单|执行|推荐|适合谁|不适合谁)"],
                "account_patterns": [r"(刘小排r|MacTalk|饼干哥哥AGI|Founder Park|虎嗅APP|晚点LatePost)"],
            },
            "SaaS与软件增长": {
                "weight": 0.08,
                "title_patterns": [r"(SaaS|订阅|ARR|MRR|留存|转化|获客|B2B|企业软件|软件增长|软件公司|增长模型|决策订阅|企业级软件)"],
                "text_patterns": [r"(SaaS|订阅|ARR|MRR|留存|获客|转化|付费|续费|增长曲线|B2B|销售|企业软件|席位订阅|决策订阅)"],
                "account_patterns": [r"(Founder Park|晚点LatePost|虎嗅APP|MacTalk|DT商业观察)"],
            },
            "出海与赚美金": {
                "weight": 0.11,
                "title_patterns": [r"(出海|海外|美金|美元|跨境|独立站|remote|远程|Stripe|Shopify|TikTok|赚美金|欧美|老外|海外市场)"],
                "text_patterns": [r"(出海|海外客户|美金|美元|跨境|独立站|remote|远程接单|Shopify|Stripe|TikTok|海外市场|欧美市场|海外用户)"],
                "account_patterns": [r"(跨境风向标|刘小排r|默默的小站|虎嗅APP|Founder Park)"],
            },
            "副业与个人变现": {
                "weight": 0.06,
                "title_patterns": [r"(副业|赚钱|变现|一人公司|个人品牌|接单|收入|佣金|被动收入|下班后赚钱|自由职业|裸辞)"],
                "text_patterns": [r"(副业|变现|收入|接单|佣金|一人公司|个人品牌|赚钱路径|现金流|自由职业|独立开发)"],
                "account_patterns": [r"(刘小排r|默默的小站|MacTalk|新世相|Founder Park)"],
            },
            "GitHub项目与开发工具": {
                "weight": 0.07,
                "title_patterns": [r"(GitHub|开源|项目|仓库|Star|代码|开发工具|CLI|插件|框架|SDK|repo|repository|软件包|npm|PyPI|issue)"],
                "text_patterns": [r"(GitHub|开源|仓库|代码|开发者工具|CLI|插件|Star|issue|workflow|software package|npm|pypi|readme|pull request)"],
                "account_patterns": [r"(MacTalk|数字生命卡兹克|饼干哥哥AGI|新智元|机器之心)"],
            },
        },
    },
}


def compile_focus_profiles() -> dict:
    profiles = {}
    for code, config in FOCUS_PROFILE_CONFIGS.items():
        compiled_categories = {}
        for category, category_config in config.get("categories", {}).items():
            compiled_categories[category] = {
                "weight": category_config["weight"],
                "title_patterns": [re.compile(pattern, re.I) for pattern in category_config.get("title_patterns", [])],
                "text_patterns": [re.compile(pattern, re.I) for pattern in category_config.get("text_patterns", [])],
                "account_patterns": [re.compile(pattern, re.I) for pattern in category_config.get("account_patterns", [])],
            }
        profiles[code] = {
            **config,
            "categories": compiled_categories,
        }
    return profiles


FOCUS_PROFILES = compile_focus_profiles()


def log(message: str) -> None:
    print(message, flush=True)


def sanitize_focus_profile_code(value: str) -> str:
    code = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return code or DEFAULT_FOCUS_PROFILE


def resolve_focus_profile(value: str) -> tuple[str, dict]:
    code = sanitize_focus_profile_code(value)
    if code not in FOCUS_PROFILES:
        available = ", ".join(sorted(FOCUS_PROFILES))
        raise RuntimeError(f"未知 focus profile：{value}；可选值：{available}")
    return code, FOCUS_PROFILES[code]


def artifact_bundle_for_focus_profile(focus_profile: str) -> dict:
    code = sanitize_focus_profile_code(focus_profile)
    if code == DEFAULT_FOCUS_PROFILE:
        sample_path = SAMPLE_PATH
        analysis_path = ANALYSIS_PATH
        report_path = REPORT_PATH
        wewe_raw_cache = WEWE_RAW_CACHE_PATH
        fulltext_raw_cache = RAW_CACHE_PATH
        candidate_cache = CANDIDATE_CACHE_PATH
    else:
        stem = f"{code}-fulltext-100"
        sample_path = ARTIFACT_DIR / f"{stem}-sample.json"
        analysis_path = ARTIFACT_DIR / f"{stem}-analysis.json"
        report_path = ARTIFACT_DIR / f"{stem}-analysis.md"
        wewe_raw_cache = Path(f"/tmp/huoziwriter-plan24-wewe-fulltext-raw-{code}.json")
        fulltext_raw_cache = Path(f"/tmp/huoziwriter-plan24-fulltext-raw-{code}.json")
        candidate_cache = Path(f"/tmp/huoziwriter-plan24-candidates-{code}.json")
    return {
        "sample_path": sample_path,
        "analysis_path": analysis_path,
        "report_path": report_path,
        "wewe_raw_cache_path": wewe_raw_cache,
        "fulltext_raw_cache_path": fulltext_raw_cache,
        "candidate_cache_path": candidate_cache,
    }


def profile_defaults(focus_profile: str) -> dict:
    _, profile = resolve_focus_profile(focus_profile)
    return {
        "min_categories": profile.get("min_categories", DEFAULT_MIN_CATEGORIES),
        "min_accounts": profile.get("min_accounts", DEFAULT_MIN_ACCOUNTS),
        "max_category_share": profile.get("max_category_share", DEFAULT_MAX_CATEGORY_SHARE),
        "max_account_share": profile.get("max_account_share", DEFAULT_MAX_ACCOUNT_SHARE),
        "candidate_per_account_cap": profile.get("candidate_per_account_cap", 0),
    }


def read_secret(name: str, file_name: str) -> str:
    value = os.environ.get(name, "").strip()
    if value:
        return value
    path = Path.home() / ".config" / "ima" / file_name
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    return ""


def post_json(url: str, headers: dict, body: dict, timeout: int = 20) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout, context=ssl._create_unverified_context()) as response:
        return json.loads(response.read().decode("utf-8", "ignore"))


def get_json(url: str, timeout: int = 30, retries: int = 3) -> dict:
    last_error = None
    for attempt in range(1, retries + 1):
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "application/json,text/plain,*/*",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout, context=ssl._create_unverified_context()) as response:
                return json.loads(response.read().decode("utf-8", "ignore"))
        except (TimeoutError, urllib.error.URLError, http.client.RemoteDisconnected) as error:
            last_error = error
            if attempt >= retries:
                break
            time.sleep(1.5 * attempt)
    raise last_error or RuntimeError(f"GET failed: {url}")


def get_text(url: str, timeout: int = 30, retries: int = 3) -> str:
    last_error = None
    for attempt in range(1, retries + 1):
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout, context=ssl._create_unverified_context()) as response:
                return response.read().decode("utf-8", "ignore")
        except (TimeoutError, urllib.error.URLError, http.client.RemoteDisconnected) as error:
            last_error = error
            if attempt >= retries:
                break
            time.sleep(1.5 * attempt)
    raise last_error or RuntimeError(f"GET failed: {url}")


def ima_search(client_id: str, api_key: str, query: str, cursor: str = "") -> dict:
    headers = {
        "Content-Type": "application/json",
        "ima-openapi-clientid": client_id,
        "ima-openapi-apikey": api_key,
        "ima-openapi-ctx": "skill_version=huoziwriter-plan24-fulltext",
    }
    payload = post_json(
        "https://ima.qq.com/openapi/wiki/v1/search_knowledge",
        headers,
        {"knowledge_base_id": KB_ID, "query": query, "cursor": cursor},
    )
    if payload.get("code", payload.get("retcode")) != 0:
        raise RuntimeError(payload.get("msg") or payload.get("errmsg") or "IMA search failed")
    return payload.get("data") or {}


def normalize_text(value: str) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"<script.*?</script>", "", value, flags=re.S | re.I)
    value = re.sub(r"<style.*?</style>", "", value, flags=re.S | re.I)
    value = re.sub(r"<[^>]+>", "\n", value)
    value = re.sub(r"[\t\r\f\v ]+", " ", value)
    value = re.sub(r"\n{2,}", "\n", value)
    return value.strip()


def strip_tags(value: str) -> str:
    return normalize_text(value).replace("\n", "")


def extract_article_content_html(value: str) -> str:
    value = value or ""
    for pattern in [
        r'<div[^>]+id=["\']js_content["\'][^>]*>(.*?)</div>\s*<script',
        r'<section[^>]+id=["\']js_content["\'][^>]*>(.*?)</section>\s*<script',
        r'<div[^>]+class=["\'][^"\']*rich_media_content[^"\']*["\'][^>]*>(.*?)</div>\s*<script',
    ]:
        match = re.search(pattern, value, re.S | re.I)
        if match:
            return match.group(1)
    body_match = re.search(r"<body[^>]*>(.*?)</body>", value, re.S | re.I)
    return body_match.group(1) if body_match else value


def image_url_from_tag(tag: str) -> str:
    attrs = {key.lower(): html.unescape(value) for key, _, value in ATTR_RE.findall(tag)}
    for key in ["data-src", "data-croporisrc", "src", "data-original", "data-backsrc"]:
        value = (attrs.get(key) or "").strip()
        if value:
            if value.startswith("//"):
                value = "https:" + value
            return value
    return ""


def image_source_type(url: str) -> str:
    host = urllib.parse.urlparse(url).netloc.lower()
    if not url:
        return "unknown"
    if url.startswith("data:"):
        return "inline_data"
    if "mmbiz.qpic.cn" in host or "mmbiz.qlogo.cn" in host:
        return "wechat_media_cdn"
    if "res.wx.qq.com" in host or "mp.weixin.qq.com" in host:
        return "wechat_static"
    if "qpic.cn" in host or "gtimg.cn" in host:
        return "tencent_cdn"
    return "external_source"


def image_timing_label(char_offset: int, text_length: int) -> str:
    if char_offset <= 280:
        return "opening_hook"
    if char_offset <= 900:
        return "first_screen_support"
    if char_offset <= max(1200, text_length * 0.35):
        return "early_evidence"
    if char_offset <= text_length * 0.75:
        return "middle_pacing"
    return "late_reinforcement"


def recommended_account_cap(limit: int, focus_profile: str = DEFAULT_FOCUS_PROFILE) -> int:
    defaults = profile_defaults(focus_profile)
    share_cap = max(2, round(limit * defaults["max_account_share"]))
    if limit >= 50:
        floor_cap = ((limit + defaults["min_accounts"] - 1) // max(1, defaults["min_accounts"])) + 2
        return min(share_cap, floor_cap)
    return share_cap


def category_quota(limit: int) -> dict[str, int]:
    quotas = {
        category: max(1, round(limit * weight))
        for category, weight in DIVERSITY_CATEGORY_WEIGHTS.items()
    }
    delta = limit - sum(quotas.values())
    categories = list(DIVERSITY_CATEGORY_WEIGHTS)
    index = 0
    while delta:
        category = categories[index % len(categories)]
        if delta > 0:
            quotas[category] += 1
            delta -= 1
        elif quotas[category] > 1:
            quotas[category] -= 1
            delta += 1
        index += 1
    return quotas


def query_db_candidate_rows(
    connection: sqlite3.Connection,
    overfetch: int,
    focus_profile: str = DEFAULT_FOCUS_PROFILE,
) -> list[tuple]:
    defaults = profile_defaults(focus_profile)
    per_account_cap = max(0, int(defaults.get("candidate_per_account_cap", 0) or 0))
    if per_account_cap <= 0:
        return connection.execute(
            """
            select a.id, a.title, a.publish_time, f.mp_name
            from articles a
            join feeds f on f.id = a.mp_id
            order by a.publish_time desc
            limit ?
            """,
            (overfetch,),
        ).fetchall()
    return connection.execute(
        """
        with ranked as (
            select
                a.id,
                a.title,
                a.publish_time,
                f.mp_name,
                row_number() over (partition by f.id order by a.publish_time desc) as rn
            from articles a
            join feeds f on f.id = a.mp_id
        )
        select id, title, publish_time, mp_name
        from ranked
        where rn <= ?
        order by publish_time desc
        limit ?
        """,
        (per_account_cap, overfetch),
    ).fetchall()


def round_robin_rows_by_account(rows: list[tuple]) -> list[tuple]:
    grouped = defaultdict(list)
    ordered_accounts = []
    for row in rows:
        account = row[3]
        if account not in grouped:
            ordered_accounts.append(account)
        grouped[account].append(row)
    result = []
    while grouped:
        next_accounts = []
        for account in ordered_accounts:
            bucket = grouped.get(account)
            if not bucket:
                continue
            result.append(bucket.pop(0))
            if bucket:
                next_accounts.append(account)
            else:
                del grouped[account]
        ordered_accounts = next_accounts
    return result


def cached_sample_distribution_incompatible(
    cached: list[dict],
    limit: int,
    quotas: dict[str, int],
    account_cap: int,
) -> bool:
    if not cached:
        return False
    account_counts = Counter(item.get("account", "") for item in cached[:limit])
    category_counts = Counter(item.get("category", "") for item in cached[:limit])
    if account_cap > 0 and any(count > account_cap for count in account_counts.values()):
        return True
    for category, count in category_counts.items():
        if count > quotas.get(category, limit):
            return True
    return False


def focus_profile_quota(limit: int, focus_profile: str) -> dict[str, int]:
    code, profile = resolve_focus_profile(focus_profile)
    if code == DEFAULT_FOCUS_PROFILE:
        return category_quota(limit)
    category_weights = {
        category: max(0.01, float(config.get("weight", 0)))
        for category, config in profile.get("categories", {}).items()
    }
    quotas = {
        category: max(1, round(limit * weight))
        for category, weight in category_weights.items()
    }
    delta = limit - sum(quotas.values())
    categories = list(category_weights)
    index = 0
    while delta and categories:
        category = categories[index % len(categories)]
        if delta > 0:
            quotas[category] += 1
            delta -= 1
        elif quotas[category] > 1:
            quotas[category] -= 1
            delta += 1
        index += 1
    return quotas


def rebalance_quotas(limit: int, quotas: dict[str, int], available_counts: dict[str, int]) -> dict[str, int]:
    if not quotas:
        return quotas
    effective = {
        category: min(quotas.get(category, 0), max(0, int(available_counts.get(category, 0))))
        for category in quotas
    }
    delta = limit - sum(effective.values())
    if delta <= 0:
        return effective
    while delta > 0:
        candidates = sorted(
            (
                (available_counts.get(category, 0) - effective.get(category, 0), category)
                for category in quotas
            ),
            reverse=True,
        )
        progressed = False
        for spare, category in candidates:
            if spare <= 0:
                continue
            effective[category] += 1
            delta -= 1
            progressed = True
            if delta <= 0:
                break
        if not progressed:
            break
    return effective


def match_focus_categories(title: str, account: str, text: str, focus_profile: str) -> list[dict]:
    code, profile = resolve_focus_profile(focus_profile)
    if code == DEFAULT_FOCUS_PROFILE:
        category = ACCOUNT_VERTICALS.get(account, "未分类")
        return [{"category": category, "score": 1, "signals": ["account_vertical"]}]
    seed_title = f"{title}\n{account}"
    seed_text = f"{seed_title}\n{text[:4000]}"
    matches = []
    for category, config in profile.get("categories", {}).items():
        score = 0
        signals = []
        if any(pattern.search(seed_title) for pattern in config.get("title_patterns", [])):
            score += 3
            signals.append("title")
        if text and any(pattern.search(seed_text) for pattern in config.get("text_patterns", [])):
            score += 2
            signals.append("text")
        if any(pattern.search(account) for pattern in config.get("account_patterns", [])):
            score += 1
            signals.append("account")
        if score > 0:
            matches.append({"category": category, "score": score, "signals": signals})
    matches.sort(key=lambda item: (-item["score"], -len(item["signals"]), item["category"]))
    return matches


def primary_focus_match(title: str, account: str, text: str, focus_profile: str) -> dict | None:
    matches = match_focus_categories(title, account, text, focus_profile)
    return matches[0] if matches else None


def has_content_focus_signal(match: dict | None) -> bool:
    return bool(match and any(signal in {"title", "text"} for signal in match.get("signals", [])))


def diversity_issues(
    samples: list[dict],
    limit: int,
    min_categories: int,
    min_accounts: int,
    max_category_share: float,
    max_account_share: float,
) -> list[str]:
    if limit < 50:
        return []
    total = len(samples)
    category_counts = Counter(item.get("category") or "未分类" for item in samples)
    account_counts = Counter(item.get("account") or "未知账号" for item in samples)
    issues = []
    if len(category_counts) < min_categories:
        issues.append(f"题材覆盖不足：{len(category_counts)}/{min_categories}")
    if len(account_counts) < min_accounts:
        issues.append(f"账号覆盖不足：{len(account_counts)}/{min_accounts}")
    if category_counts:
        category, count = category_counts.most_common(1)[0]
        share = count / max(1, total)
        if share > max_category_share:
            issues.append(f"题材过度集中：{category} {count}/{total} ({share:.0%})")
    if account_counts:
        account, count = account_counts.most_common(1)[0]
        share = count / max(1, total)
        if share > max_account_share:
            issues.append(f"账号过度集中：{account} {count}/{total} ({share:.0%})")
    return issues


def extract_image_profile(content_html: str, text: str) -> dict:
    images = []
    for match in IMG_TAG_RE.finditer(content_html or ""):
        url = image_url_from_tag(match.group(0))
        if not url:
            continue
        char_offset = len(normalize_text(content_html[: match.start()]))
        images.append(
            {
                "index": len(images) + 1,
                "charOffset": char_offset,
                "timing": image_timing_label(char_offset, len(text)),
                "sourceType": image_source_type(url),
                "domain": urllib.parse.urlparse(url).netloc.lower(),
                "url": url,
            }
        )
    domains = Counter(image["domain"] or "unknown" for image in images)
    source_types = Counter(image["sourceType"] for image in images)
    timings = Counter(image["timing"] for image in images)
    offsets = [image["charOffset"] for image in images]
    intervals = [right - left for left, right in zip(offsets, offsets[1:])]
    return {
        "imageCount": len(images),
        "firstImageCharOffset": offsets[0] if offsets else None,
        "firstImageTiming": images[0]["timing"] if images else "no_image",
        "firstScreenImageCount": sum(1 for offset in offsets if offset <= 900),
        "imageDensityPerThousandChars": round(len(images) * 1000 / max(1, len(text)), 2),
        "averageIntervalChars": round(sum(intervals) / len(intervals), 1) if intervals else None,
        "timingDistribution": dict(timings),
        "sourceTypeDistribution": dict(source_types),
        "topDomains": [{"domain": domain, "count": count} for domain, count in domains.most_common(5)],
        "sampleUrls": [image["url"] for image in images[:5]],
    }


def is_sensitive(title: str, text: str = "") -> bool:
    probe = f"{title}\n{text[:1200]}"
    return bool(SENSITIVE_RE.search(probe) or LOW_SIGNAL_RE.search(title) or RECRUITING_RE.search(title))


def title_similarity(left: str, right: str) -> float:
    def fingerprint(value: str) -> set[str]:
        compact = re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]+", "", value.lower())
        if len(compact) <= 2:
            return {compact} if compact else set()
        grams = {compact[index : index + 2] for index in range(len(compact) - 1)}
        grams.update(re.findall(r"[A-Za-z0-9]{2,}", value.lower()))
        return grams

    left_tokens = fingerprint(left)
    right_tokens = fingerprint(right)
    if not left_tokens or not right_tokens:
        return 0.0
    overlap = len(left_tokens & right_tokens)
    containment = overlap / min(len(left_tokens), len(right_tokens))
    jaccard = overlap / len(left_tokens | right_tokens)
    return max(containment * 0.75, jaccard)


def quality_issues(title: str, account: str, text: str) -> list[str]:
    paragraphs = [line.strip() for line in text.splitlines() if line.strip()]
    issues = []
    if len(text) < 2200:
        issues.append("正文过短")
    if len(text) > 18000:
        issues.append("正文过长")
    if not account or account.startswith("gh_"):
        issues.append("账号名不可读")
    if is_sensitive(title, text):
        issues.append("敏感或低信号题材")
    if RECRUITING_RE.search(f"{title}\n{account}"):
        issues.append("招聘求职类污染")
    if BAD_BODY_RE.search(f"{title}\n{text[:2500]}\n{text[-1200:]}"):
        issues.append("低质搬运或猎奇表达")
    if paragraphs and GENERIC_OPENING_RE.search(paragraphs[0]):
        issues.append("泛化开头")
    if len(paragraphs) < 10:
        issues.append("段落结构不足")
    cjk_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
    if cjk_chars / max(1, len(text)) < 0.55:
        issues.append("中文正文占比不足")
    return issues


def article_id_from_wechat_url(url: str) -> str:
    path_match = re.search(r"mp\.weixin\.qq\.com/s/([^?#]+)", url or "")
    if path_match:
        return path_match.group(1)
    query = urllib.parse.parse_qs(urllib.parse.urlparse(url or "").query)
    return (query.get("__biz") or [""])[0]


def extract_json_feed_items(payload: dict, fallback_account: str = "") -> list[dict]:
    feed_title = str(payload.get("title") or fallback_account or "")
    items = []
    for raw in payload.get("items") or []:
        url = str(raw.get("url") or raw.get("external_url") or raw.get("id") or "")
        if url and url.startswith("http") is False and re.match(r"^[A-Za-z0-9_-]{8,}$", url):
            url = f"https://mp.weixin.qq.com/s/{url}"
        content = (
            raw.get("content_html")
            or raw.get("content_text")
            or raw.get("content")
            or raw.get("summary")
            or ""
        )
        article_html = extract_article_content_html(str(content))
        author = raw.get("author") or {}
        if isinstance(author, list):
            author = author[0] if author else {}
        account = str(author.get("name") or feed_title or "")
        title = strip_tags(str(raw.get("title") or ""))
        text = normalize_text(article_html)
        image_profile = extract_image_profile(article_html, text)
        if not url or "mp.weixin.qq.com/s" not in url or not title:
            continue
        items.append(
            {
                "title": title,
                "account": account,
                "url": url,
                "text": text,
                "imageProfile": image_profile,
                "publishDate": str(raw.get("date_published") or raw.get("date_modified") or ""),
            }
        )
    return items


def fetch_wechat_article_payload(url: str) -> dict:
    html_text = get_text(url, timeout=30)
    article_html = extract_article_content_html(html_text)
    text = normalize_text(article_html)
    image_profile = extract_image_profile(article_html, text)
    return {
        "html": html_text,
        "articleHtml": article_html,
        "text": text,
        "imageProfile": image_profile,
    }


def collect_wewe_samples(
    limit: int,
    base_url: str,
    feed: str,
    pages: int,
    page_size: int,
    title_include: str = "",
    title_exclude: str = "",
    max_per_account: int = 30,
    focus_profile: str = DEFAULT_FOCUS_PROFILE,
) -> list[dict]:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    paths = artifact_bundle_for_focus_profile(focus_profile)
    raw_cache_path = paths["wewe_raw_cache_path"]
    sample_path = paths["sample_path"]
    if raw_cache_path.exists():
        cached = json.loads(raw_cache_path.read_text(encoding="utf-8"))
    else:
        cached = []
    cached = [
        item
        for item in cached
        if not quality_issues(item.get("matchedTitle", ""), item.get("account", ""), item.get("text", ""))
        and item.get("focusProfile", DEFAULT_FOCUS_PROFILE) == sanitize_focus_profile_code(focus_profile)
    ]
    samples = list(cached)
    seen_urls = {item["url"] for item in samples}
    account_counts = Counter(item.get("account", "") for item in samples)
    encoded_include = urllib.parse.quote(title_include) if title_include else ""
    encoded_exclude = urllib.parse.quote(title_exclude) if title_exclude else ""
    base_url = base_url.rstrip("/")
    feed_path = "all.json" if feed == "all" else f"{feed}.json"

    for page in range(1, pages + 1):
        if len(samples) >= limit:
            break
        query = {
            "mode": "fulltext",
            "limit": str(page_size),
            "page": str(page),
        }
        if encoded_include:
            query["title_include"] = encoded_include
        if encoded_exclude:
            query["title_exclude"] = encoded_exclude
        query_string = "&".join(f"{key}={value}" for key, value in query.items())
        url = f"{base_url}/feeds/{feed_path}?{query_string}"
        log(f"[wewe-page] {page}/{pages} {url}")
        payload = get_json(url, timeout=60)
        items = extract_json_feed_items(payload)
        if not items:
            log(f"[wewe-empty] page={page}")
            break
        for item in items:
            if len(samples) >= limit:
                break
            if item["url"] in seen_urls:
                continue
            if max_per_account > 0 and account_counts[item["account"]] >= max_per_account:
                log(f"[wewe-account-cap] {item['account']} >= {max_per_account}")
                continue
            focus_match = primary_focus_match(item["title"], item["account"], item["text"], focus_profile)
            if sanitize_focus_profile_code(focus_profile) != DEFAULT_FOCUS_PROFILE and not has_content_focus_signal(focus_match):
                log(f"[wewe-focus-skip] {item['title'][:36]}")
                continue
            issues = quality_issues(item["title"], item["account"], item["text"])
            if issues:
                log(f"[wewe-quality-skip] {item['title'][:36]} :: {';'.join(issues)}")
                continue
            sample = {
                "sampleNo": len(samples) + 1,
                "category": (focus_match or {}).get("category") or ACCOUNT_VERTICALS.get(item["account"], "wewe-rss"),
                "categorySignals": (focus_match or {}).get("signals", []),
                "imaTitle": "",
                "matchedTitle": item["title"],
                "account": item["account"],
                "publishDate": item["publishDate"],
                "url": item["url"],
                "textLength": len(item["text"]),
                "text": item["text"],
                "imageProfile": item["imageProfile"],
                "source": "wewe_rss",
                "articleId": article_id_from_wechat_url(item["url"]),
                "focusProfile": sanitize_focus_profile_code(focus_profile),
            }
            samples.append(sample)
            seen_urls.add(item["url"])
            account_counts[item["account"]] += 1
            raw_cache_path.write_text(json.dumps(samples, ensure_ascii=False, indent=2), encoding="utf-8")
            log(f"[wewe-sample] {len(samples)}/{limit} {sample['account']} {sample['matchedTitle'][:48]}")

    sanitized = [{key: value for key, value in item.items() if key != "text"} for item in samples[:limit]]
    sample_path.write_text(json.dumps(sanitized, ensure_ascii=False, indent=2), encoding="utf-8")
    return samples[:limit]


def collect_wewe_db_samples(
    limit: int,
    db_path: str,
    max_per_account: int = 30,
    overfetch: int = 700,
    enforce_diversity: bool = True,
    focus_profile: str = DEFAULT_FOCUS_PROFILE,
    fetch_concurrency: int = DEFAULT_FETCH_CONCURRENCY,
) -> list[dict]:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    focus_code = sanitize_focus_profile_code(focus_profile)
    paths = artifact_bundle_for_focus_profile(focus_profile)
    raw_cache_path = paths["wewe_raw_cache_path"]
    sample_path = paths["sample_path"]
    if raw_cache_path.exists():
        cached = json.loads(raw_cache_path.read_text(encoding="utf-8"))
    else:
        cached = []
    cached = [
        item
        for item in cached
        if item.get("source") in {"wewe_rss", "wewe_db"}
        and not quality_issues(item.get("matchedTitle", ""), item.get("account", ""), item.get("text", ""))
        and item.get("focusProfile", DEFAULT_FOCUS_PROFILE) == focus_code
    ]
    quotas = focus_profile_quota(limit, focus_profile)
    effective_max_per_account = (
        min(max_per_account, recommended_account_cap(limit, focus_profile))
        if enforce_diversity
        else max_per_account
    )
    if enforce_diversity and cached_sample_distribution_incompatible(cached, limit, quotas, effective_max_per_account):
        log("[wewe-db-cache-reset] cached sample distribution incompatible with current caps")
        cached = []
        if raw_cache_path.exists():
            raw_cache_path.unlink()
    samples = list(cached[:limit])
    seen_urls = {item["url"] for item in samples}
    account_counts = Counter(item.get("account", "") for item in samples)
    category_counts = Counter(item.get("category", "") for item in samples)
    with sqlite3.connect(db_path) as connection:
        rows = query_db_candidate_rows(connection, overfetch, focus_profile)
    if focus_code != DEFAULT_FOCUS_PROFILE:
        scored_rows = []
        for row in rows:
            focus_match = primary_focus_match(row[1], row[3], "", focus_profile)
            if not focus_match:
                continue
            scored_rows.append((focus_match["score"], focus_match["category"], focus_match["signals"], row))
        scored_rows.sort(key=lambda item: (-item[0], item[1], -len(item[2])))
        rows = [row for _, _, _, row in scored_rows]
    if enforce_diversity:
        grouped_rows = defaultdict(list)
        for row in rows:
            account = row[3]
            focus_match = primary_focus_match(row[1], account, "", focus_profile)
            category = (focus_match or {}).get("category") or ACCOUNT_VERTICALS.get(account, "未分类")
            grouped_rows[category].append(row)
        quotas = rebalance_quotas(
            limit,
            quotas,
            {category: len(category_rows) for category, category_rows in grouped_rows.items()},
        )
        ordered_rows = []
        seen_article_ids = set()
        for category in quotas:
            category_rows = round_robin_rows_by_account(grouped_rows.get(category, []))
            for row in category_rows[: max(quotas[category] * 3, quotas[category] + 8)]:
                if row[0] not in seen_article_ids:
                    ordered_rows.append(row)
                    seen_article_ids.add(row[0])
        for row in round_robin_rows_by_account(rows):
            if row[0] not in seen_article_ids:
                ordered_rows.append(row)
                seen_article_ids.add(row[0])
        rows = ordered_rows
    pending_rows = []
    for article_id, title, publish_time, account in rows:
        url = f"https://mp.weixin.qq.com/s/{article_id}"
        if url in seen_urls:
            continue
        if effective_max_per_account > 0 and account_counts[account] >= effective_max_per_account:
            log(f"[wewe-db-account-cap] {account} >= {effective_max_per_account}")
            continue
        if is_sensitive(title):
            log(f"[wewe-db-title-skip] {title[:36]}")
            continue
        focus_match = primary_focus_match(title, account, "", focus_profile)
        if focus_code != DEFAULT_FOCUS_PROFILE and not focus_match:
            continue
        pending_rows.append((article_id, title, publish_time, account, focus_match))

    def fetch_row(payload: tuple) -> dict:
        article_id, title, publish_time, account, focus_match = payload
        url = f"https://mp.weixin.qq.com/s/{article_id}"
        fetched = fetch_wechat_article_payload(url)
        final_focus_match = primary_focus_match(title, account, fetched["text"], focus_profile)
        category = (final_focus_match or focus_match or {}).get("category") or ACCOUNT_VERTICALS.get(account, "未分类")
        return {
            "articleId": article_id,
            "title": title,
            "publishTime": publish_time,
            "account": account,
            "url": url,
            "text": fetched["text"],
            "imageProfile": fetched["imageProfile"],
            "category": category,
            "categorySignals": (final_focus_match or focus_match or {}).get("signals", []),
            "focusMatch": final_focus_match or focus_match,
        }

    max_workers = max(1, min(fetch_concurrency, len(pending_rows) or 1))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        row_iter = iter(enumerate(pending_rows, start=1))
        futures = {}
        for _ in range(max_workers):
            try:
                next_index, next_row = next(row_iter)
            except StopIteration:
                break
            futures[executor.submit(fetch_row, next_row)] = (next_index, next_row)
        while futures and len(samples) < limit:
            future = next(as_completed(futures))
            if len(samples) >= limit:
                break
            index, row = futures[future]
            del futures[future]
            article_id, title, publish_time, account, _ = row
            try:
                fetched = future.result()
            except Exception as error:
                log(f"[wewe-db-fetch-skip] {index}/{len(pending_rows)} {title[:36]} :: {error}")
            else:
                issues = quality_issues(title, account, fetched["text"])
                if issues:
                    log(f"[wewe-db-quality-skip] {title[:36]} :: {';'.join(issues)}")
                else:
                    category = fetched["category"]
                    if focus_code != DEFAULT_FOCUS_PROFILE and not has_content_focus_signal(fetched["focusMatch"]):
                        log(f"[wewe-db-focus-skip] {title[:36]}")
                    elif enforce_diversity and category_counts[category] >= quotas.get(category, limit):
                        log(f"[wewe-db-category-cap] {category} >= {quotas.get(category, limit)}")
                    elif effective_max_per_account > 0 and account_counts[account] >= effective_max_per_account:
                        log(f"[wewe-db-account-cap] {account} >= {effective_max_per_account}")
                    else:
                        sample = {
                            "sampleNo": len(samples) + 1,
                            "category": category,
                            "categorySignals": fetched.get("categorySignals", []),
                            "imaTitle": "",
                            "matchedTitle": title,
                            "account": account,
                            "publishDate": datetime.fromtimestamp(int(publish_time), timezone.utc).isoformat()
                            if publish_time
                            else "",
                            "url": fetched["url"],
                            "textLength": len(fetched["text"]),
                            "text": fetched["text"],
                            "imageProfile": fetched["imageProfile"],
                            "source": "wewe_db",
                            "articleId": article_id,
                            "focusProfile": focus_code,
                        }
                        samples.append(sample)
                        seen_urls.add(fetched["url"])
                        account_counts[account] += 1
                        category_counts[category] += 1
                        raw_cache_path.write_text(json.dumps(samples, ensure_ascii=False, indent=2), encoding="utf-8")
                        log(f"[wewe-db-sample] {len(samples)}/{limit} {account} {title[:48]}")
            if len(samples) < limit:
                try:
                    next_index, next_row = next(row_iter)
                except StopIteration:
                    pass
                else:
                    futures[executor.submit(fetch_row, next_row)] = (next_index, next_row)
    if len(samples) < limit and enforce_diversity:
        defaults = profile_defaults(focus_profile)
        soft_account_cap = max(effective_max_per_account, round(limit * defaults["max_account_share"]))
        log(f"[wewe-db-soft-fill] need={limit - len(samples)} soft_account_cap={soft_account_cap}")
        for row in pending_rows:
            if len(samples) >= limit:
                break
            article_id, title, publish_time, account, _ = row
            url = f"https://mp.weixin.qq.com/s/{article_id}"
            if url in seen_urls:
                continue
            if account_counts[account] >= soft_account_cap:
                continue
            try:
                fetched = fetch_row(row)
            except Exception as error:
                log(f"[wewe-db-soft-fetch-skip] {title[:36]} :: {error}")
                continue
            issues = quality_issues(title, account, fetched["text"])
            if issues:
                continue
            if focus_code != DEFAULT_FOCUS_PROFILE and not has_content_focus_signal(fetched["focusMatch"]):
                continue
            category = fetched["category"]
            sample = {
                "sampleNo": len(samples) + 1,
                "category": category,
                "categorySignals": fetched.get("categorySignals", []),
                "imaTitle": "",
                "matchedTitle": title,
                "account": account,
                "publishDate": datetime.fromtimestamp(int(publish_time), timezone.utc).isoformat()
                if publish_time
                else "",
                "url": fetched["url"],
                "textLength": len(fetched["text"]),
                "text": fetched["text"],
                "imageProfile": fetched["imageProfile"],
                "source": "wewe_db",
                "articleId": article_id,
                "focusProfile": focus_code,
            }
            samples.append(sample)
            seen_urls.add(fetched["url"])
            account_counts[account] += 1
            category_counts[category] += 1
            raw_cache_path.write_text(json.dumps(samples, ensure_ascii=False, indent=2), encoding="utf-8")
            log(f"[wewe-db-soft-sample] {len(samples)}/{limit} {account} {title[:48]}")
    sanitized = [{key: value for key, value in item.items() if key != "text"} for item in samples[:limit]]
    sample_path.write_text(json.dumps(sanitized, ensure_ascii=False, indent=2), encoding="utf-8")
    return samples[:limit]


def check_wewe_readiness(base_url: str, feed: str, db_path: str, focus_profile: str = DEFAULT_FOCUS_PROFILE) -> dict:
    base_url = base_url.rstrip("/")
    feed_path = "all.json" if feed == "all" else f"{feed}.json"
    focus_code, focus_profile_config = resolve_focus_profile(focus_profile)
    result = {
        "baseUrl": base_url,
        "dbPath": db_path,
        "focusProfile": focus_code,
        "focusLabel": focus_profile_config.get("label", focus_code),
        "endpointOk": False,
        "feedItems": 0,
        "accounts": None,
        "feeds": None,
        "articles": None,
        "articlesByFeed": [],
        "articlesByCategory": {},
        "ready": False,
        "nextAction": "",
    }
    try:
        payload = get_json(f"{base_url}/feeds/{feed_path}?mode=fulltext&limit=5&page=1", timeout=10)
        items = extract_json_feed_items(payload)
        result["endpointOk"] = True
        result["feedItems"] = len(items)
    except Exception as error:
        result["nextAction"] = f"WeWe RSS endpoint unavailable: {error}"
        return result
    if db_path and Path(db_path).exists():
        with sqlite3.connect(db_path) as connection:
            for table in ["accounts", "feeds", "articles"]:
                try:
                    result[table] = connection.execute(f"select count(*) from {table}").fetchone()[0]
                except sqlite3.Error:
                    result[table] = None
            try:
                feed_rows = connection.execute(
                    """
                    select f.mp_name, count(a.id) as article_count
                    from feeds f
                    left join articles a on a.mp_id = f.id
                    group by f.mp_name
                    order by article_count desc, f.mp_name
                    """
                ).fetchall()
                result["articlesByFeed"] = [
                    {"account": account, "articles": count}
                    for account, count in feed_rows
                ]
                category_counts = Counter()
                for account, count in feed_rows:
                    if focus_code == DEFAULT_FOCUS_PROFILE:
                        category_counts[ACCOUNT_VERTICALS.get(account, "未分类")] += count
                    else:
                        focus_match = primary_focus_match("", account, "", focus_profile)
                        if focus_match:
                            category_counts[focus_match["category"]] += count
                result["articlesByCategory"] = dict(category_counts)
            except sqlite3.Error:
                pass
    if not result["accounts"]:
        result["nextAction"] = "Open /dash, enter AUTH_CODE, then scan WeRead QR to add an account."
    elif not result["feeds"]:
        result["nextAction"] = "Add non-sensitive MP subscriptions with mp.weixin.qq.com/s/... article links."
    elif not result["articles"] and result["feedItems"] == 0:
        result["nextAction"] = "Trigger feed sync in WeWe RSS and wait until historical articles are imported."
    else:
        result["ready"] = True
        result["nextAction"] = "Run fulltext analysis with --source wewe."
    return result


class SogouWechatClient:
    def __init__(self):
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=ssl._create_unverified_context()),
            urllib.request.HTTPCookieProcessor(self.cookie_jar),
        )

    def get(self, url: str, referer: str = "https://weixin.sogou.com/", timeout: int = 20) -> str:
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Referer": referer,
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            },
        )
        with self.opener.open(request, timeout=timeout) as response:
            return response.read().decode("utf-8", "ignore")

    def approve_search(self, html_text: str, referer: str) -> None:
        match = re.search(r'uuid = "([^"]+)".*?ssToken = "([^"]+)"', html_text, re.S)
        if not match:
            return
        approve_url = (
            "https://weixin.sogou.com/approve?uuid="
            + urllib.parse.quote(match.group(1))
            + "&token="
            + urllib.parse.quote(match.group(2))
            + "&from=search"
        )
        try:
            self.get(approve_url, referer=referer, timeout=10)
        except Exception:
            return

    def search(self, query: str) -> list[dict]:
        url = "https://weixin.sogou.com/weixin?type=2&query=" + urllib.parse.quote(query)
        html_text = self.get(url, timeout=15)
        self.approve_search(html_text, url)
        items = []
        pattern = re.compile(
            r'<li[^>]*id="sogou_vr_11002601_box_\d+"[^>]*>.*?'
            r'<h3>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?'
            r'<p class="txt-info"[^>]*>(.*?)</p>.*?'
            r'<a[^>]*class="account"[^>]*>(.*?)</a>.*?'
            r'<span[^>]*class="s2"[^>]*>(.*?)</span>',
            re.S,
        )
        for match in pattern.finditer(html_text):
            items.append(
                {
                    "title": strip_tags(match.group(2)),
                    "link": html.unescape(match.group(1)),
                    "snippet": strip_tags(match.group(3)),
                    "account": strip_tags(match.group(4)),
                    "date": strip_tags(match.group(5)),
                    "searchUrl": url,
                }
            )
        if not items:
            fallback = re.compile(r'<h3>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', re.S)
            for match in fallback.finditer(html_text):
                items.append(
                    {
                        "title": strip_tags(match.group(2)),
                        "link": html.unescape(match.group(1)),
                        "snippet": "",
                        "account": "",
                        "date": "",
                        "searchUrl": url,
                    }
                )
        return items

    def resolve_link(self, item: dict) -> str | None:
        link = item["link"]
        if link.startswith("/"):
            target = "https://weixin.sogou.com" + urllib.parse.quote(link, safe="/:?=&%._-")
        else:
            target = link
        redirect_html = self.get(target, referer=item["searchUrl"], timeout=15)
        inner_match = re.search(r"uuid='([^']+)'.*?token='([^']+)'.*?from=inner", redirect_html, re.S)
        if inner_match:
            approve_url = (
                "https://weixin.sogou.com/approve?uuid="
                + urllib.parse.quote(inner_match.group(1))
                + "&token="
                + urllib.parse.quote(inner_match.group(2))
                + "&from=inner"
            )
            try:
                self.get(approve_url, referer=target, timeout=10)
            except Exception:
                pass
        parts = re.findall(r"url \+= '([^']*)'", redirect_html)
        if parts:
            return "".join(parts).replace("@", "")
        direct_match = re.search(r"https://mp\.weixin\.qq\.com/s\?[^\"'<>]+", redirect_html)
        return html.unescape(direct_match.group(0)) if direct_match else None

    def fetch_article(self, url: str, referer: str) -> dict | None:
        page = self.get(url, referer=referer, timeout=25)
        title = ""
        for pattern in [
            r'<meta property="og:title" content="([^"]+)"',
            r'<h1[^>]*id="activity-name"[^>]*>(.*?)</h1>',
            r'var msg_title = "(.*?)"',
        ]:
            match = re.search(pattern, page, re.S)
            if match:
                title = strip_tags(match.group(1))
                break
        account = ""
        account_match = re.search(r'<a[^>]*id="js_name"[^>]*>(.*?)</a>', page, re.S)
        if account_match:
            account = strip_tags(account_match.group(1))
        content_match = re.search(r'<div[^>]+id="js_content"[^>]*>(.*?)</div>\s*<script', page, re.S)
        if not content_match:
            return None
        text = normalize_text(content_match.group(1))
        if len(text) < 1200:
            return None
        return {"title": title, "account": account, "text": text, "url": url}


def collect_candidates(limit: int, overfetch: int) -> list[dict]:
    if CANDIDATE_CACHE_PATH.exists():
        cached = json.loads(CANDIDATE_CACHE_PATH.read_text(encoding="utf-8"))
        if len(cached) >= min(overfetch, limit):
            log(f"[candidates-cache] {len(cached)}")
            return cached[:overfetch]
    client_id = read_secret("IMA_OPENAPI_CLIENTID", "client_id")
    api_key = read_secret("IMA_OPENAPI_APIKEY", "api_key")
    if not client_id or not api_key:
        raise RuntimeError("缺少 IMA OpenAPI 凭证")
    seen_media = set()
    candidates = []
    for category, queries in CATEGORY_QUERIES.items():
        for query in queries:
            log(f"[ima-query] {category} / {query}")
            try:
                data = ima_search(client_id, api_key, query)
            except Exception as error:
                log(f"[ima-skip] {query}: {error}")
                continue
            for item in data.get("info_list") or []:
                media_id = str(item.get("media_id") or "")
                title = str(item.get("title") or "").strip()
                media_type = int(item.get("media_type") or 0)
                if not media_id or media_id in seen_media or media_type not in {2, 6}:
                    continue
                if is_sensitive(title):
                    continue
                seen_media.add(media_id)
                candidates.append(
                    {
                        "source": "ima_search",
                        "category": category,
                        "query": query,
                        "mediaId": media_id,
                        "title": title,
                        "parentFolderId": item.get("parent_folder_id") or "",
                    }
                )
                if len(candidates) >= overfetch:
                    CANDIDATE_CACHE_PATH.write_text(
                        json.dumps(candidates, ensure_ascii=False, indent=2),
                        encoding="utf-8",
                    )
                    log(f"[candidates] {len(candidates)}")
                    return candidates
            time.sleep(0.15)
    CANDIDATE_CACHE_PATH.write_text(json.dumps(candidates, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"[candidates] {len(candidates)}")
    return candidates


def collect_fulltext_samples(limit: int, overfetch: int) -> list[dict]:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    if RAW_CACHE_PATH.exists():
        cached = json.loads(RAW_CACHE_PATH.read_text(encoding="utf-8"))
    else:
        cached = []
    cached = [
        item
        for item in cached
        if not quality_issues(item.get("matchedTitle", ""), item.get("account", ""), item.get("text", ""))
    ]
    by_title = {item["imaTitle"]: item for item in cached}
    client = SogouWechatClient()
    candidates = collect_candidates(limit, overfetch)
    random.Random(24).shuffle(candidates)
    samples = list(cached)
    seen_urls = {item["url"] for item in samples}
    category_counts = Counter(item["category"] for item in samples)
    account_counts = Counter(item.get("account", "") for item in samples)
    quotas = category_quota(limit)
    max_per_account = recommended_account_cap(limit)
    for index, candidate in enumerate(candidates, start=1):
        if len(samples) >= limit:
            break
        if candidate["title"] in by_title:
            continue
        if category_counts[candidate["category"]] >= quotas.get(candidate["category"], 0):
            continue
        try:
            log(f"[search] {index}/{len(candidates)} {candidate['category']} {candidate['title'][:54]}")
            results = client.search(candidate["title"])
            scored = []
            for result in results[:8]:
                if is_sensitive(result["title"], result.get("snippet", "")):
                    continue
                score = title_similarity(candidate["title"], result["title"])
                if candidate["title"] in result["title"] or result["title"] in candidate["title"]:
                    score += 0.4
                scored.append((score, result))
            scored.sort(key=lambda pair: pair[0], reverse=True)
            for score, result in scored[:3]:
                if score < 0.55:
                    log(f"[drift] score={score:.2f} ima={candidate['title'][:26]} hit={result['title'][:26]}")
                    continue
                url = client.resolve_link(result)
                if not url or "mp.weixin.qq.com/s" not in url or url in seen_urls:
                    continue
                article = client.fetch_article(url, result["searchUrl"])
                if not article:
                    continue
                article_title = article["title"] or result["title"]
                final_score = title_similarity(candidate["title"], article_title)
                if candidate["title"] in article_title or article_title in candidate["title"]:
                    final_score += 0.4
                if final_score < 0.55:
                    log(f"[article-drift] score={final_score:.2f} ima={candidate['title'][:26]} article={article_title[:26]}")
                    continue
                issues = quality_issues(article_title, article["account"] or result.get("account", ""), article["text"])
                if issues:
                    log(f"[quality-skip] {article_title[:36]} :: {';'.join(issues)}")
                    continue
                account = article["account"] or result.get("account", "")
                if account_counts[account] >= max_per_account:
                    log(f"[account-cap] {account} >= {max_per_account}")
                    continue
                sample = {
                    "sampleNo": len(samples) + 1,
                    "category": candidate["category"],
                    "imaTitle": candidate["title"],
                    "matchedTitle": article_title,
                    "account": account,
                    "publishDate": result.get("date", ""),
                    "url": url,
                    "textLength": len(article["text"]),
                    "text": article["text"],
                }
                samples.append(sample)
                by_title[candidate["title"]] = sample
                seen_urls.add(url)
                category_counts[candidate["category"]] += 1
                account_counts[account] += 1
                RAW_CACHE_PATH.write_text(json.dumps(samples, ensure_ascii=False, indent=2), encoding="utf-8")
                log(f"[sample] {len(samples)}/{limit} {sample['category']} {sample['matchedTitle'][:48]}")
                break
        except Exception as error:
            log(f"[sogou-skip] {index}/{len(candidates)} {candidate['title'][:40]}: {error}")
        time.sleep(0.5 + random.random() * 0.6)
    sanitized = [{key: value for key, value in item.items() if key != "text"} for item in samples[:limit]]
    SAMPLE_PATH.write_text(json.dumps(sanitized, ensure_ascii=False, indent=2), encoding="utf-8")
    return samples[:limit]


def detect_title_mechanisms(title: str, opening: str) -> list[str]:
    probe = f"{title}\n{opening}"
    tags = []
    if re.search(r"\d|万|亿|%|天|小时|分钟|美元|美金|ARR|MRR", title):
        tags.append("数字结果")
    if re.search(r"实测|亲测|试了|评测|测评|体验|上手", probe):
        tags.append("实测体验")
    if re.search(r"复盘|拆解|案例|背后|凭什么|怎么做到|为什么", probe):
        tags.append("案例拆解")
    if re.search(r"赚钱|变现|副业|美金|佣金|收入|ARR|SaaS|订阅|增长", probe):
        tags.append("钱流承诺")
    if re.search(r"AI|OpenAI|Claude|Cursor|GitHub|SaaS|工具|开源|Agent|模型", title, re.I):
        tags.append("工具产品名")
    if re.search(r"别|不要|风险|坑|警惕|删掉|翻车|内讧|没人接盘|裁掉|出问题", probe):
        tags.append("风险冲突")
    if re.search(r"创始人|公司|团队|产品|品牌|打工人|开发者|普通人|老板|用户", title):
        tags.append("身份实体")
    if re.search(r"终于|突然|反而|却|没想到|不是|不再|原来", probe):
        tags.append("反常识翻转")
    return tags or ["实体事件解释"]


def detect_opening_mode(opening: str) -> str:
    condensed = opening.replace("\n", " ").strip()
    if re.search(r"问题不是|真正的问题|很多人以为|先说结论|说白了|别急着", condensed):
        return "判断先行"
    if re.search(r"为什么|凭什么|到底|怎么", condensed) and ("？" in condensed or "?" in condensed):
        return "问题钩子"
    if re.search(r"最近|上周|那天|凌晨|今天|前几天|刚刚|一个|有人|这两天", condensed) and re.search(r"看到|发现|试了|做了|收到|上线|发布|聊到|遇到|算了", condensed):
        return "场景切入"
    if re.search(r"赚到|拿到|做到|爆火|登顶|融资|翻倍|涨到|冲上", condensed):
        return "结果先抛"
    if re.search(r"如果你|先别|先看|先算|直接说", condensed):
        return "读者直入"
    return "现象判断"


def detect_author_posture(text: str, opening: str) -> str:
    opening_probe = f"{opening}\n{text[:1200]}"
    first_person = len(re.findall(r"我|我们|自己", opening_probe))
    didactic = len(re.findall(r"你要|你应该|必须|一定要|建议你|记住|不要|先别|最好|学会|需要你", opening_probe))
    if first_person >= 2 and re.search(r"实测|试了|跑了|做了|记录|复盘|踩坑|亲测", opening_probe):
        return "实测者"
    if re.search(r"案例|创始人|公司|团队|品牌|产品|业务", opening_probe):
        return "案例拆解者"
    if didactic >= 3 and first_person == 0:
        return "导师劝导者"
    return "分析解释者"


def detect_evidence_types(text: str, title: str) -> list[str]:
    tags = []
    if len(re.findall(r"\d+(?:\.\d+)?%?|[一二三四五六七八九十百千万亿]+", text)) >= 8:
        tags.append("数据数字")
    if re.search(r"案例|公司|品牌|产品|团队|创始人|业务|项目|用户", title + text[:1800]):
        tags.append("案例主体")
    if re.search(r"第一|第二|第三|步骤|流程|清单|先|再|最后", text[:2200]):
        tags.append("步骤方法")
    if text.count("“") >= 2:
        tags.append("原话引用")
    if re.search(r"AI|OpenAI|Claude|Cursor|GitHub|SaaS|Shopify|Stripe|微信|谷歌|小红书|抖音", title + text[:2200], re.I):
        tags.append("工具平台")
    if re.search(r"报告|榜单|图表|截图|数据集|实验|实测", title + text[:2200]):
        tags.append("数据佐证")
    return tags or ["经验观察"]


def detect_emotion_vectors(title: str, text: str, opening: str) -> list[str]:
    probe = f"{title}\n{opening}\n{text[:1800]}"
    tags = []
    if re.search(r"赚钱|变现|增长|机会|爆火|翻倍|赚美金|ARR|副业", probe):
        tags.append("机会感")
    if re.search(r"风险|裁员|焦虑|坑|没人接盘|出问题|封号|代价|删掉", probe):
        tags.append("风险感")
    if re.search(r"为什么|凭什么|没想到|突然|到底|原来", probe):
        tags.append("好奇心")
    if re.search(r"普通人|打工人|创始人|开发者|团队|老板|用户", probe):
        tags.append("身份代入")
    if re.search(r"工具|效率|自动化|工作流|省时|提效", probe):
        tags.append("效率冲动")
    return tags or ["认知刷新"]


def heuristic_article_analysis(sample: dict) -> dict:
    text = sample["text"]
    title = sample["matchedTitle"]
    paragraphs = [line.strip() for line in text.splitlines() if line.strip()]
    opening = "\n".join(paragraphs[:4])[:700]
    ending = "\n".join(paragraphs[-4:])[:700]
    number_count = len(re.findall(r"\d+(?:\.\d+)?%?|[一二三四五六七八九十百千万亿]+", text))
    question_count = text.count("？") + text.count("?")
    quote_count = text.count("“")
    first_person = len(re.findall(r"我|我们|作者|亲测|实测|体验", text[:1800]))
    second_person = len(re.findall(r"你|普通人|年轻人|打工人|父母|孩子|用户|读者", text[:1800]))
    mechanisms = []
    if re.search(r"\d|万|亿|%|TOP|第[一二三四五六七八九十]", title):
        mechanisms.append("数字锚点")
    if re.search(r"为什么|为何|吗|？|怎么|到底", title):
        mechanisms.append("问题悬念")
    if re.search(r"不是|不再|反而|却|没想到|突然|终于", title + opening):
        mechanisms.append("反常识翻转")
    if re.search(r"实测|体验|亲测|试了|现场|晒出", title + opening):
        mechanisms.append("场景实测")
    if re.search(r"别|不要|警惕|风险|小心|真相|坑", title + opening):
        mechanisms.append("风险提醒")
    if not mechanisms:
        mechanisms.append("实体事件解释")
    title_mechanisms = detect_title_mechanisms(title, opening)
    opening_mode = detect_opening_mode(opening)
    author_posture = detect_author_posture(text, opening)
    evidence_types = detect_evidence_types(text, title)
    emotion_vectors = detect_emotion_vectors(title, text, opening)
    didactic_signal = len(re.findall(r"你要|你应该|必须|一定要|建议你|记住|不要|先别|最好|学会|需要你", text[:2200]))
    return {
        "sampleNo": sample["sampleNo"],
        "category": sample["category"],
        "focusProfile": sample.get("focusProfile", DEFAULT_FOCUS_PROFILE),
        "title": title,
        "account": sample["account"],
        "url": sample["url"],
        "textLength": sample["textLength"],
        "openingDigest": opening,
        "endingDigest": ending,
        "mechanisms": mechanisms,
        "titleMechanisms": title_mechanisms,
        "openingMode": opening_mode,
        "authorPosture": author_posture,
        "evidenceTypes": evidence_types,
        "emotionVectors": emotion_vectors,
        "structureSignals": {
            "paragraphCount": len(paragraphs),
            "numberSignalCount": number_count,
            "questionCount": question_count,
            "quoteCount": quote_count,
            "firstPersonSignal": first_person,
            "readerAddressSignal": second_person,
            "didacticSignal": didactic_signal,
        },
        "imageSignals": sample.get("imageProfile")
        or {
            "imageCount": 0,
            "firstImageCharOffset": None,
            "firstImageTiming": "unknown",
            "firstScreenImageCount": 0,
            "imageDensityPerThousandChars": 0,
            "averageIntervalChars": None,
            "timingDistribution": {},
            "sourceTypeDistribution": {},
            "topDomains": [],
            "sampleUrls": [],
        },
    }


def build_report(analyses: list[dict], source_label: str, focus_profile: str = DEFAULT_FOCUS_PROFILE) -> str:
    category_counts = Counter(item["category"] for item in analyses)
    account_counts = Counter(item["account"] for item in analyses)
    mechanism_counts = Counter(mechanism for item in analyses for mechanism in item["mechanisms"])
    title_mechanism_counts = Counter(mechanism for item in analyses for mechanism in item.get("titleMechanisms", []))
    opening_mode_counts = Counter(item.get("openingMode", "未知") for item in analyses)
    author_posture_counts = Counter(item.get("authorPosture", "未知") for item in analyses)
    evidence_type_counts = Counter(tag for item in analyses for tag in item.get("evidenceTypes", []))
    emotion_vector_counts = Counter(tag for item in analyses for tag in item.get("emotionVectors", []))
    image_timing_counts = Counter(
        timing
        for item in analyses
        for timing, count in item.get("imageSignals", {}).get("timingDistribution", {}).items()
        for _ in range(count)
    )
    image_source_counts = Counter(
        source_type
        for item in analyses
        for source_type, count in item.get("imageSignals", {}).get("sourceTypeDistribution", {}).items()
        for _ in range(count)
    )
    image_domain_counts = Counter()
    for item in analyses:
        for domain_item in item.get("imageSignals", {}).get("topDomains", []):
            image_domain_counts[domain_item["domain"]] += domain_item["count"]
    avg_length = sum(item["textLength"] for item in analyses) // max(1, len(analyses))
    avg_images = round(
        sum(item.get("imageSignals", {}).get("imageCount", 0) for item in analyses) / max(1, len(analyses)),
        1,
    )
    avg_didactic = round(
        sum(item.get("structureSignals", {}).get("didacticSignal", 0) for item in analyses) / max(1, len(analyses)),
        1,
    )
    largest_category = category_counts.most_common(1)[0] if category_counts else ("", 0)
    largest_account = account_counts.most_common(1)[0] if account_counts else ("", 0)
    category_share = largest_category[1] / max(1, len(analyses))
    account_share = largest_account[1] / max(1, len(analyses))
    focus_code, focus_config = resolve_focus_profile(focus_profile)
    lines = [
        "# Plan 24 · 100 篇高质量爆款文章正文级细读分析",
        "",
        f"> 生成时间：{datetime.now(timezone.utc).isoformat()}",
        f"> 样本源：{source_label}",
        f"> 采样 profile：{focus_config.get('label', focus_code)}",
        "> 版权口径：本报告只保存结构化分析、短摘要和机制统计，不保存原文全文。",
        "",
        "## 样本口径",
        "",
        f"- 有效正文样本：{len(analyses)} 篇",
        f"- 题材覆盖：{len(category_counts)} 类，最大题材占比 {category_share:.0%}",
        f"- 账号覆盖：{len(account_counts)} 个，最大账号占比 {account_share:.0%}",
        f"- 平均正文长度：{avg_length} 字",
        f"- 平均配图数量：{avg_images} 张/篇",
        f"- 开头前 2200 字平均导师式指令信号：{avg_didactic}",
        "- 剔除题材：政治、军事、暴力、刑事、血腥、医疗恐吓、低俗猎奇、纯祝福/壁纸/公告/招聘等",
        "- 分析维度：标题机制、开头任务、正文结构信号、配图时机、图片来源、证据类型、作者视角、情绪曲线、转发理由和结尾动作",
        "",
        "## 题材分布",
        "",
        "| 题材 | 篇数 |",
        "|---|---:|",
    ]
    for category, count in category_counts.most_common():
        lines.append(f"| {category} | {count} |")
    lines.extend(["", "## 账号分布", "", "| 账号 | 篇数 |", "|---|---:|"])
    for account, count in account_counts.most_common():
        lines.append(f"| {account} | {count} |")
    lines.extend(["", "## 爆点机制分布", "", "| 机制 | 命中篇数 |", "|---|---:|"])
    for mechanism, count in mechanism_counts.most_common():
        lines.append(f"| {mechanism} | {count} |")
    lines.extend(["", "## 标题机制分布", "", "| 机制 | 命中篇数 |", "|---|---:|"])
    for mechanism, count in title_mechanism_counts.most_common():
        lines.append(f"| {mechanism} | {count} |")
    lines.extend(["", "## 开头模式分布", "", "| 模式 | 篇数 |", "|---|---:|"])
    for mode, count in opening_mode_counts.most_common():
        lines.append(f"| {mode} | {count} |")
    lines.extend(["", "## 作者姿态分布", "", "| 姿态 | 篇数 |", "|---|---:|"])
    for posture, count in author_posture_counts.most_common():
        lines.append(f"| {posture} | {count} |")
    lines.extend(["", "## 证据类型分布", "", "| 类型 | 命中篇数 |", "|---|---:|"])
    for evidence_type, count in evidence_type_counts.most_common():
        lines.append(f"| {evidence_type} | {count} |")
    lines.extend(["", "## 情绪向量分布", "", "| 向量 | 命中篇数 |", "|---|---:|"])
    for emotion, count in emotion_vector_counts.most_common():
        lines.append(f"| {emotion} | {count} |")
    lines.extend(["", "## 配图时机分布", "", "| 时机 | 图片数 |", "|---|---:|"])
    for timing, count in image_timing_counts.most_common():
        lines.append(f"| {timing} | {count} |")
    lines.extend(["", "## 图片来源分布", "", "| 来源类型 | 图片数 |", "|---|---:|"])
    for source_type, count in image_source_counts.most_common():
        lines.append(f"| {source_type} | {count} |")
    lines.extend(["", "## 图片域名 Top 10", "", "| 域名 | 图片数 |", "|---|---:|"])
    for domain, count in image_domain_counts.most_common(10):
        lines.append(f"| {domain} | {count} |")
    lines.extend(
        [
            "",
            "## 核心发现",
            "",
            "1. 爆款的第一动力不是观点，而是可见的处境变化：读者需要先看到一个人、一家公司、一个城市、一类身份或一个具体动作正在发生变化。",
            "2. 好开头通常不解释背景，而是先给状态、冲突或代价：第一屏必须让读者知道“这件事为什么现在和我有关”。",
            "3. 高转发文章很少只靠知识密度，更多靠替读者表达：委屈、警醒、羡慕、松弛、看懂变化、终于有人说清楚。",
            "4. 结构不是固定模板，而是承诺兑现顺序：标题承诺什么，前 200 字就先兑付一部分，正文再逐层补证据和反差。",
            "5. 作者视角越具体，文章越不像说教：实测者、旁观者、亲历者、替读者算账的人，比导师式口吻更容易成立。",
            "6. 配图不是装饰位，而是节奏位：第一屏图片通常负责降低理解成本，中段图片负责证据和换气，尾部图片负责情绪或行动回收。",
            f"7. 当前样本里最强的标题驱动是「{title_mechanism_counts.most_common(1)[0][0] if title_mechanism_counts else '实体事件解释'}」，最常见开头模式是「{opening_mode_counts.most_common(1)[0][0] if opening_mode_counts else '现象判断'}」。",
            f"8. 当前样本里导师式口吻的平均强度为 {avg_didactic}，说明高质量爆文更常见的是分析者、拆解者和实测者姿态，而不是直接对读者发号施令。",
            "",
            "## 逐篇分析索引",
            "",
            "| # | 题材 | 标题 | 机制 | 正文长度 | 图片数 | 首图时机 |",
            "|---:|---|---|---|---:|---:|---|",
        ]
    )
    for item in analyses:
        mechanisms = " / ".join(item["mechanisms"])
        title = item["title"].replace("|", "｜")
        image_signals = item.get("imageSignals", {})
        lines.append(
            f"| {item['sampleNo']} | {item['category']} | {title} | {mechanisms} | "
            f"{item['textLength']} | {image_signals.get('imageCount', 0)} | "
            f"{image_signals.get('firstImageTiming', 'unknown')} |"
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--overfetch", type=int, default=700)
    parser.add_argument("--collect-only", action="store_true")
    parser.add_argument("--source", choices=["ima-sogou", "wewe", "wewe-db"], default="ima-sogou")
    parser.add_argument("--focus-profile", default=DEFAULT_FOCUS_PROFILE)
    parser.add_argument("--wewe-base-url", default="http://localhost:4000")
    parser.add_argument("--wewe-feed", default="all")
    parser.add_argument("--wewe-pages", type=int, default=10)
    parser.add_argument("--wewe-page-size", type=int, default=30)
    parser.add_argument("--wewe-title-include", default="")
    parser.add_argument("--wewe-title-exclude", default="")
    parser.add_argument("--wewe-max-per-account", type=int, default=16)
    parser.add_argument("--wewe-db-path", default="data/wewe-rss/wewe-rss.db")
    parser.add_argument("--fetch-concurrency", type=int, default=DEFAULT_FETCH_CONCURRENCY)
    parser.add_argument("--min-categories", type=int)
    parser.add_argument("--min-accounts", type=int)
    parser.add_argument("--max-category-share", type=float)
    parser.add_argument("--max-account-share", type=float)
    parser.add_argument("--disable-diversity-gates", action="store_true")
    parser.add_argument("--check-wewe", action="store_true")
    args = parser.parse_args()
    focus_code, focus_profile_config = resolve_focus_profile(args.focus_profile)
    defaults = profile_defaults(args.focus_profile)
    min_categories = args.min_categories if args.min_categories is not None else defaults["min_categories"]
    min_accounts = args.min_accounts if args.min_accounts is not None else defaults["min_accounts"]
    max_category_share = args.max_category_share if args.max_category_share is not None else defaults["max_category_share"]
    max_account_share = args.max_account_share if args.max_account_share is not None else defaults["max_account_share"]
    paths = artifact_bundle_for_focus_profile(args.focus_profile)
    if args.check_wewe:
        status = check_wewe_readiness(args.wewe_base_url, args.wewe_feed, args.wewe_db_path, args.focus_profile)
        print(json.dumps(status, ensure_ascii=False, indent=2))
        if not status["ready"]:
            raise SystemExit(2)
        return
    if args.source == "wewe":
        samples = collect_wewe_samples(
            args.limit,
            args.wewe_base_url,
            args.wewe_feed,
            args.wewe_pages,
            args.wewe_page_size,
            args.wewe_title_include,
            args.wewe_title_exclude,
            args.wewe_max_per_account,
            args.focus_profile,
        )
        source_label = f"WeWe RSS JSON Feed fulltext mode + mp.weixin.qq.com 原文链接（{focus_profile_config.get('label', focus_code)}）"
    elif args.source == "wewe-db":
        samples = collect_wewe_db_samples(
            args.limit,
            args.wewe_db_path,
            args.wewe_max_per_account,
            args.overfetch,
            not args.disable_diversity_gates,
            args.focus_profile,
            args.fetch_concurrency,
        )
        source_label = f"WeWe RSS SQLite article index + mp.weixin.qq.com 单篇正文抽取（{focus_profile_config.get('label', focus_code)}）"
    else:
        samples = collect_fulltext_samples(args.limit, args.overfetch)
        source_label = f"IMA「{KB_NAME}」候选标题 + Sogou 微信定位原文 + mp.weixin.qq.com 正文抽取"
    if len(samples) < args.limit:
        raise RuntimeError(f"只收集到 {len(samples)} 篇有效正文样本，未达到 {args.limit} 篇")
    if not args.disable_diversity_gates:
        issues = diversity_issues(
            samples,
            args.limit,
            min_categories,
            min_accounts,
            max_category_share,
            max_account_share,
        )
        if issues:
            raise RuntimeError("样本多样性验收失败：" + "；".join(issues))
    if args.collect_only:
        return
    analyses = [heuristic_article_analysis(sample) for sample in samples]
    paths["analysis_path"].write_text(json.dumps(analyses, ensure_ascii=False, indent=2), encoding="utf-8")
    paths["report_path"].write_text(build_report(analyses, source_label, args.focus_profile), encoding="utf-8")
    print(f"[done] {paths['analysis_path']}")
    print(f"[done] {paths['report_path']}")


if __name__ == "__main__":
    main()
