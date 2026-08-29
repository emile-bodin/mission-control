from collections.abc import Generator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime
from enum import Enum
import os
from urllib.error import URLError
from urllib.request import urlopen
from uuid import uuid4

import psycopg
from fastapi import Depends, FastAPI, HTTPException, status
from psycopg.rows import dict_row
from pydantic import BaseModel, ConfigDict, Field


class ProjectStatus(str, Enum):
    ACTIVE = "Active"
    MAINTENANCE = "Maintenance"
    PLANNED = "Planned"
    BACKLOG = "Backlog"
    PAUSED = "Paused"
    DONE = "Done"
    CANCELED = "Canceled"
    UNKNOWN = "Unknown"


class StatusCardStatus(str, Enum):
    OK = "OK"
    ATTENTION = "Let op"
    ACTION_NEEDED = "Actie nodig"
    BLOCKED = "Geblokkeerd"
    UNKNOWN = "Onbekend"


class ActionStatus(str, Enum):
    OPEN = "Open"
    IN_PROGRESS = "Bezig"
    DONE = "Klaar"
    LATER = "Later"


class AssetStatus(str, Enum):
    UNKNOWN = "Onbekend"
    OK = "OK"
    ATTENTION = "Let op"
    ERROR = "Fout"


def parse_ics_events(content: str, now: datetime | None = None) -> list[dict[str, str]]:
    if "BEGIN:VCALENDAR" not in content:
        raise ValueError("Invalid ICS calendar")

    unfolded: list[str] = []
    for line in content.replace("\r\n", "\n").split("\n"):
        if line.startswith((" ", "\t")) and unfolded:
            unfolded[-1] += line[1:]
        else:
            unfolded.append(line)

    events: list[dict[str, str]] = []
    fields: dict[str, str] = {}
    in_event = False
    for line in unfolded:
        if line == "BEGIN:VEVENT":
            fields = {}
            in_event = True
            continue
        if line == "END:VEVENT" and in_event:
            starts_at = fields.get("DTSTART")
            summary = fields.get("SUMMARY")
            if starts_at and summary:
                try:
                    value = starts_at.rstrip("Z")
                    pattern = "%Y%m%d" if len(value) == 8 else "%Y%m%dT%H%M%S" if len(value) == 15 else "%Y%m%dT%H%M"
                    start = datetime.strptime(value, pattern)
                    if starts_at.endswith("Z"):
                        start = start.replace(tzinfo=UTC).astimezone().replace(tzinfo=None)
                    if start >= (now or datetime.now()):
                        events.append({"starts_at": start.isoformat(timespec="minutes"), "summary": summary})
                except ValueError:
                    pass
            in_event = False
            continue
        if in_event and ":" in line:
            key, value = line.split(":", 1)
            fields[key.split(";", 1)[0]] = value.replace("\\,", ",").replace("\\n", " ")

    return sorted(events, key=lambda event: event["starts_at"])


class ProjectInput(BaseModel):
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    display_name: str | None = None
    product_key: str = "Unknown"
    source_type: str = "Unknown"
    linear_project_name: str | None = None
    linear_project_url: str | None = None
    linear_team_key: str | None = None
    product_label: str | None = None
    visible_issue_prefix: str | None = None
    technical_issue_prefix: str | None = None
    status: ProjectStatus = ProjectStatus.UNKNOWN
    personal_status: ProjectStatus = ProjectStatus.UNKNOWN
    activity_source: str = "Unknown"
    notes: str = ""


class ProjectPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1)
    display_name: str | None = None
    product_key: str | None = None
    source_type: str | None = None
    linear_project_name: str | None = None
    linear_project_url: str | None = None
    linear_team_key: str | None = None
    product_label: str | None = None
    visible_issue_prefix: str | None = None
    technical_issue_prefix: str | None = None
    status: ProjectStatus | None = None
    personal_status: ProjectStatus | None = None
    activity_source: str | None = None
    notes: str | None = None


class StatusCardInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: str | None = None
    title: str = Field(min_length=1)
    status: StatusCardStatus = StatusCardStatus.UNKNOWN
    facts: str = Field(min_length=1)
    interpretation: str = Field(min_length=1)
    next_safe_step: str = Field(min_length=1)
    source_type: str = "Unknown"
    source_reference: str = "Unknown"
    last_checked_at: datetime | None = None


class StatusCardPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: str | None = None
    title: str | None = Field(default=None, min_length=1)
    status: StatusCardStatus | None = None
    facts: str | None = Field(default=None, min_length=1)
    interpretation: str | None = Field(default=None, min_length=1)
    next_safe_step: str | None = Field(default=None, min_length=1)
    source_type: str | None = None
    source_reference: str | None = None
    last_checked_at: datetime | None = None
    resolved: bool | None = None


class CodexRunInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: str = Field(min_length=1)
    linear_issue: str = "Unknown"
    repo: str = "Unknown"
    branch: str = "Unknown"
    start_sha: str = "Unknown"
    end_sha: str = "Unknown"
    commit_sha: str = "Unknown"
    model: str = "Unknown"
    profile: str = "Unknown"
    reasoning_level: str = "Unknown"
    session_type: str = "Unknown"
    status: str = "Unknown"
    summary: str = "Unknown"
    verification: str = "Unknown"
    changed_files: str = "Unknown"
    risks: str = "Unknown"
    next_step: str = "Unknown"


class ActionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    type: str = "Unknown"
    status: ActionStatus = ActionStatus.OPEN
    priority: str = "Unknown"
    project_id: str | None = None
    status_card_id: str | None = None
    due_date: date | None = None


class ActionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1)
    type: str | None = None
    status: ActionStatus | None = None
    priority: str | None = None
    project_id: str | None = None
    status_card_id: str | None = None
    due_date: date | None = None


class AssetInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    type: str = "Unknown"
    host: str = "Unknown"
    address: str = "Unknown"
    environment: str = "Unknown"
    status: AssetStatus = AssetStatus.UNKNOWN
    notes: str = ""


class AssetPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1)
    type: str | None = None
    host: str | None = None
    address: str | None = None
    environment: str | None = None
    status: AssetStatus | None = None
    notes: str | None = None


ASSET_COLUMNS = """
    id, name, type, host, address, environment, status, notes, created_at, updated_at
"""


ACTION_COLUMNS = """
    id, title, type, status, priority, project_id, status_card_id, due_date, created_at, updated_at
"""


STATUS_CARD_COLUMNS = """
    id, project_id, title, status, facts, interpretation, next_safe_step,
    source_type, source_reference, last_checked_at, created_at, updated_at, resolved_at
"""


CODEX_RUN_COLUMNS = """
    id, project_id, linear_issue, repo, branch, start_sha, end_sha, commit_sha,
    model, profile, reasoning_level, session_type, status, summary, verification,
    changed_files, risks, next_step, created_at
"""


PROJECT_COLUMNS = """
    name, slug, display_name, product_key, source_type, linear_project_name,
    linear_project_url, linear_team_key, product_label, visible_issue_prefix,
    technical_issue_prefix, status, personal_status, activity_source, notes
"""

PROJECT_SEEDS = [
    {
        "name": "00 — Hydra Command Center",
        "slug": "hydra-command-center",
        "display_name": "Hydra Command Center",
        "product_key": "HYD",
        "source_type": "Linear",
        "linear_project_name": "00 — Hydra Command Center",
        "linear_project_url": "https://linear.app/hydra-agent/project/00-hydra-command-center-00a4945e0284",
        "linear_team_key": "HYD",
        "product_label": "project:HYD",
        "visible_issue_prefix": "HYD",
        "technical_issue_prefix": "HYD",
        "status": "Active",
        "personal_status": "Unknown",
        "activity_source": "Linear",
        "notes": "Central visual overview and governance hub for Project Hydra.",
    },
    {
        "name": "Bodin Control Center",
        "slug": "bodin-control-center",
        "display_name": "Bodin Control Center",
        "product_key": "BCC",
        "source_type": "Linear",
        "linear_project_name": "Bodin Control Center",
        "linear_project_url": "https://linear.app/hydra-agent/project/bodin-control-center-20a64c85c4b6",
        "linear_team_key": "HYD",
        "product_label": "project:BCC",
        "visible_issue_prefix": "BCC",
        "technical_issue_prefix": "HYD",
        "status": "Active",
        "personal_status": "Unknown",
        "activity_source": "Linear",
        "notes": "Self-hosted persoonlijke cockpit voor feitelijke projectstatus.",
    },
    {
        "name": "Homelab Unified Console (HUC)",
        "slug": "homelab-unified-console",
        "display_name": "Homelab Unified Console (HUC)",
        "product_key": "HUC",
        "source_type": "Linear",
        "linear_project_name": "Homelab Unified Console (HUC)",
        "linear_project_url": "https://linear.app/hydra-agent/project/homelab-unified-console-huc-a005f9c8a2d8",
        "linear_team_key": "HYD",
        "product_label": "project:HUC",
        "visible_issue_prefix": "HUC",
        "technical_issue_prefix": "HYD",
        "status": "Active",
        "personal_status": "Unknown",
        "activity_source": "Linear",
        "notes": "Local-first unified console for homelab inventory and bounded actions.",
    },
    {
        "name": "HydraWiki",
        "slug": "hydrawiki",
        "display_name": "HydraWiki",
        "product_key": "HYDWIK",
        "source_type": "Linear",
        "linear_project_name": "hydrawiki",
        "linear_project_url": "https://linear.app/hydra-agent/project/hydrawiki-900f7ab24518",
        "linear_team_key": "HYDWIK",
        "product_label": "project:HYDWIK",
        "visible_issue_prefix": "HYDWIK",
        "technical_issue_prefix": "HYDWIK",
        "status": "Backlog",
        "personal_status": "Unknown",
        "activity_source": "Linear",
        "notes": "Self-hosted AI documentation platform for local and private repositories.",
    },
    {
        "name": "Streaming Media Tracker",
        "slug": "streaming-media-tracker",
        "display_name": "Streaming Media Tracker",
        "product_key": "SMT",
        "source_type": "Linear",
        "linear_project_name": "Streaming Media Tracker",
        "linear_project_url": "https://linear.app/hydra-agent/project/streaming-media-tracker-1b8f75ab57b0",
        "linear_team_key": "HYD",
        "product_label": "project:SMT",
        "visible_issue_prefix": "SMT",
        "technical_issue_prefix": "HYD",
        "status": "Active",
        "personal_status": "Unknown",
        "activity_source": "Linear",
        "notes": "Docker-first persoonlijke streaming-library.",
    },
    {
        "name": "Homelab Mail",
        "slug": "homelab-mail",
        "display_name": "Homelab Mail",
        "product_key": "Unknown",
        "source_type": "Unknown",
        "linear_project_name": None,
        "linear_project_url": None,
        "linear_team_key": None,
        "product_label": None,
        "visible_issue_prefix": None,
        "technical_issue_prefix": None,
        "status": "Unknown",
        "personal_status": "Unknown",
        "activity_source": "Unknown",
        "notes": "Unknown",
    },
    {
        "name": "Proxmox/PBS",
        "slug": "proxmox-pbs",
        "display_name": "Proxmox/PBS",
        "product_key": "Unknown",
        "source_type": "Unknown",
        "linear_project_name": None,
        "linear_project_url": None,
        "linear_team_key": None,
        "product_label": None,
        "visible_issue_prefix": None,
        "technical_issue_prefix": None,
        "status": "Unknown",
        "personal_status": "Unknown",
        "activity_source": "Unknown",
        "notes": "Unknown",
    },
    {
        "name": "ConfigQA",
        "slug": "configqa",
        "display_name": "ConfigQA",
        "product_key": "CFGQA",
        "source_type": "Linear",
        "linear_project_name": "ConfigQA — Configuration Assurance",
        "linear_project_url": "https://linear.app/hydra-agent/project/configqa-configuration-assurance-40b73111c6bf",
        "linear_team_key": "HYD",
        "product_label": "project:CFGQA",
        "visible_issue_prefix": "CFGQA",
        "technical_issue_prefix": "HYD",
        "status": "Backlog",
        "personal_status": "Unknown",
        "activity_source": "Linear",
        "notes": "EU-first, local-first configuration release gate.",
    },
    {
        "name": "Codex Efficiency Dashboard",
        "slug": "codex-efficiency-dashboard",
        "display_name": "Codex Efficiency Dashboard",
        "product_key": "CED",
        "source_type": "Linear",
        "linear_project_name": "Codex Efficiency Dashboard",
        "linear_project_url": "https://linear.app/hydra-agent/project/codex-efficiency-dashboard-71f683293d7f",
        "linear_team_key": "HYD",
        "product_label": "project:CED",
        "visible_issue_prefix": "CED",
        "technical_issue_prefix": "HYD",
        "status": "Active",
        "personal_status": "Unknown",
        "activity_source": "Linear",
        "notes": "Local observability dashboard for Codex usage and optimization impact.",
    },
]


STATUS_CARD_SEEDS = [
    {
        "id": "seed-bodin-control-center",
        "project_id": "bodin-control-center",
        "title": "Lokale BCC-basis",
        "status": "OK",
        "facts": "HYD-152 en HYD-153 zijn lokaal gecommit; geen push.",
        "interpretation": "Lokale basis is aanwezig.",
        "next_safe_step": "Controleer lokale wijzigingen voordat nieuw werk start.",
        "source_type": "Handmatig bevestigd",
        "source_reference": "Lokale git-status",
        "last_checked_at": None,
    },
    {
        "id": "seed-huc",
        "project_id": "homelab-unified-console",
        "title": "HUC-runtime",
        "status": "Onbekend",
        "facts": "Project geregistreerd; actuele externe runtime niet gecontroleerd door BCC.",
        "interpretation": "Actuele status is onbekend.",
        "next_safe_step": "Bevestig actuele status handmatig voordat een conclusie wordt getrokken.",
        "source_type": "Projectregistratie",
        "source_reference": "BCC-projectrecord",
        "last_checked_at": None,
    },
    {
        "id": "seed-hydra",
        "project_id": "hydra-command-center",
        "title": "Hydra-fasehistorie",
        "status": "Onbekend",
        "facts": "Project geregistreerd; Hydra fasehistorie loopt via 00 — Hydra Command Center milestones.",
        "interpretation": "Actuele status is onbekend.",
        "next_safe_step": "Bevestig actuele status handmatig voordat een conclusie wordt getrokken.",
        "source_type": "Projectregistratie",
        "source_reference": "BCC-projectrecord",
        "last_checked_at": None,
    },
    {
        "id": "seed-homelab-mail",
        "project_id": "homelab-mail",
        "title": "Homelab Mail-runtime",
        "status": "Onbekend",
        "facts": "Project geregistreerd; actuele status niet gecontroleerd door BCC.",
        "interpretation": "Actuele status is onbekend.",
        "next_safe_step": "Bevestig actuele status handmatig voordat een conclusie wordt getrokken.",
        "source_type": "Projectregistratie",
        "source_reference": "BCC-projectrecord",
        "last_checked_at": None,
    },
    {
        "id": "seed-proxmox-pbs",
        "project_id": "proxmox-pbs",
        "title": "Proxmox/PBS-runtime",
        "status": "Onbekend",
        "facts": "Project geregistreerd; actuele status niet gecontroleerd door BCC.",
        "interpretation": "Actuele status is onbekend.",
        "next_safe_step": "Bevestig actuele status handmatig voordat een conclusie wordt getrokken.",
        "source_type": "Projectregistratie",
        "source_reference": "BCC-projectrecord",
        "last_checked_at": None,
    },
]


ASSET_SEEDS = [
    {
        "id": "seed-pulse",
        "name": "Pulse",
        "type": "Pulse status source",
        "host": "Unknown",
        "address": "https://pulse-2jfb7nxdj.connect2home.nl/",
        "environment": "Homelab",
        "status": "Onbekend",
        "notes": "Bekende statusbron; geen API-integratie of externe check uitgevoerd.",
    },
]


def get_connection() -> Generator[psycopg.Connection, None, None]:
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as connection:
        yield connection


def run_migrations() -> None:
    with psycopg.connect(os.environ["DATABASE_URL"]) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    slug TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    product_key TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    linear_project_name TEXT,
                    linear_project_url TEXT,
                    linear_team_key TEXT,
                    product_label TEXT,
                    visible_issue_prefix TEXT,
                    technical_issue_prefix TEXT,
                    status TEXT NOT NULL CHECK (status IN ('Active', 'Maintenance', 'Planned', 'Backlog', 'Paused', 'Done', 'Canceled', 'Unknown')),
                    personal_status TEXT NOT NULL CHECK (personal_status IN ('Active', 'Maintenance', 'Planned', 'Backlog', 'Paused', 'Done', 'Canceled', 'Unknown')),
                    activity_source TEXT NOT NULL,
                    notes TEXT NOT NULL
                )
                """
            )
            cursor.executemany(
                f"""
                INSERT INTO projects ({PROJECT_COLUMNS})
                VALUES (%(name)s, %(slug)s, %(display_name)s, %(product_key)s, %(source_type)s,
                        %(linear_project_name)s, %(linear_project_url)s, %(linear_team_key)s,
                        %(product_label)s, %(visible_issue_prefix)s, %(technical_issue_prefix)s,
                        %(status)s, %(personal_status)s, %(activity_source)s, %(notes)s)
                ON CONFLICT (slug) DO NOTHING
                """,
                PROJECT_SEEDS,
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS status_cards (
                    id TEXT PRIMARY KEY,
                    project_id TEXT REFERENCES projects(slug) ON DELETE SET NULL,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL CHECK (status IN ('OK', 'Let op', 'Actie nodig', 'Geblokkeerd', 'Onbekend')),
                    facts TEXT NOT NULL,
                    interpretation TEXT NOT NULL,
                    next_safe_step TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_reference TEXT NOT NULL,
                    last_checked_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    resolved_at TIMESTAMPTZ
                )
                """
            )
            cursor.executemany(
                """
                INSERT INTO status_cards (
                    id, project_id, title, status, facts, interpretation, next_safe_step,
                    source_type, source_reference, last_checked_at
                ) VALUES (
                    %(id)s, %(project_id)s, %(title)s, %(status)s, %(facts)s, %(interpretation)s, %(next_safe_step)s,
                    %(source_type)s, %(source_reference)s, %(last_checked_at)s
                ) ON CONFLICT (id) DO NOTHING
                """,
                STATUS_CARD_SEEDS,
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS actions (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    type TEXT NOT NULL,
                    status TEXT NOT NULL CHECK (status IN ('Open', 'Bezig', 'Klaar', 'Later')),
                    priority TEXT NOT NULL,
                    project_id TEXT REFERENCES projects(slug) ON DELETE SET NULL,
                    status_card_id TEXT REFERENCES status_cards(id) ON DELETE SET NULL,
                    due_date DATE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS codex_runs (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(slug) ON DELETE RESTRICT,
                    linear_issue TEXT NOT NULL DEFAULT 'Unknown',
                    repo TEXT NOT NULL DEFAULT 'Unknown',
                    branch TEXT NOT NULL DEFAULT 'Unknown',
                    start_sha TEXT NOT NULL DEFAULT 'Unknown',
                    end_sha TEXT NOT NULL DEFAULT 'Unknown',
                    commit_sha TEXT NOT NULL DEFAULT 'Unknown',
                    model TEXT NOT NULL DEFAULT 'Unknown',
                    profile TEXT NOT NULL DEFAULT 'Unknown',
                    reasoning_level TEXT NOT NULL DEFAULT 'Unknown',
                    session_type TEXT NOT NULL DEFAULT 'Unknown',
                    status TEXT NOT NULL DEFAULT 'Unknown',
                    summary TEXT NOT NULL DEFAULT 'Unknown',
                    verification TEXT NOT NULL DEFAULT 'Unknown',
                    changed_files TEXT NOT NULL DEFAULT 'Unknown',
                    risks TEXT NOT NULL DEFAULT 'Unknown',
                    next_step TEXT NOT NULL DEFAULT 'Unknown',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS assets (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    host TEXT NOT NULL,
                    address TEXT NOT NULL,
                    environment TEXT NOT NULL,
                    status TEXT NOT NULL CHECK (status IN ('Onbekend', 'OK', 'Let op', 'Fout')),
                    notes TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.executemany(
                """
                INSERT INTO assets (id, name, type, host, address, environment, status, notes)
                VALUES (%(id)s, %(name)s, %(type)s, %(host)s, %(address)s, %(environment)s, %(status)s, %(notes)s)
                ON CONFLICT (id) DO NOTHING
                """,
                ASSET_SEEDS,
            )


@asynccontextmanager
async def lifespan(_: FastAPI):
    run_migrations()
    yield


app = FastAPI(title="Bodin Control Center API", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/calendar/schedule")
def calendar_schedule() -> dict[str, str | list[dict[str, str]]]:
    url = os.environ.get("GOOGLE_CALENDAR_ICS_URL")
    if not url:
        return {"status": "Onbekend", "events": []}
    try:
        with urlopen(url, timeout=5) as response:
            content = response.read().decode("utf-8")
        return {"status": "Beschikbaar", "events": parse_ics_events(content)}
    except (OSError, UnicodeDecodeError, URLError, ValueError):
        return {"status": "Onbekend", "events": []}


@app.get("/api/projects")
def list_projects(connection: psycopg.Connection = Depends(get_connection)) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT {PROJECT_COLUMNS} FROM projects WHERE name NOT LIKE 'ARCHIVE —%' ORDER BY name"
        )
        return cursor.fetchall()


@app.get("/api/projects/{slug}")
def get_project(slug: str, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {PROJECT_COLUMNS} FROM projects WHERE slug = %s", (slug,))
        project = cursor.fetchone()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@app.post("/api/projects", status_code=status.HTTP_201_CREATED)
def create_project(project: ProjectInput, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    values = project.model_dump()
    values["display_name"] = values["display_name"] or values["name"]
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                INSERT INTO projects ({PROJECT_COLUMNS})
                VALUES (%(name)s, %(slug)s, %(display_name)s, %(product_key)s, %(source_type)s,
                        %(linear_project_name)s, %(linear_project_url)s, %(linear_team_key)s,
                        %(product_label)s, %(visible_issue_prefix)s, %(technical_issue_prefix)s,
                        %(status)s, %(personal_status)s, %(activity_source)s, %(notes)s)
                RETURNING {PROJECT_COLUMNS}
                """,
                values,
            )
            return cursor.fetchone()
    except psycopg.errors.UniqueViolation as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project slug already exists") from error


@app.patch("/api/projects/{slug}")
def update_project(
    slug: str, project: ProjectPatch, connection: psycopg.Connection = Depends(get_connection)
) -> dict:
    changes = project.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No project fields supplied")
    columns = ", ".join(f"{column} = %({column})s" for column in changes)
    changes["slug"] = slug
    with connection.cursor() as cursor:
        cursor.execute(
            f"UPDATE projects SET {columns} WHERE slug = %(slug)s RETURNING {PROJECT_COLUMNS}", changes
        )
        updated = cursor.fetchone()
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return updated


@app.get("/api/codex-runs")
def list_codex_runs(connection: psycopg.Connection = Depends(get_connection)) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {CODEX_RUN_COLUMNS} FROM codex_runs ORDER BY created_at DESC")
        return cursor.fetchall()


@app.get("/api/projects/{slug}/codex-runs")
def list_project_codex_runs(slug: str, connection: psycopg.Connection = Depends(get_connection)) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT slug FROM projects WHERE slug = %s", (slug,))
        if cursor.fetchone() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        cursor.execute(
            f"SELECT {CODEX_RUN_COLUMNS} FROM codex_runs WHERE project_id = %s ORDER BY created_at DESC",
            (slug,),
        )
        return cursor.fetchall()


@app.post("/api/codex-runs", status_code=status.HTTP_201_CREATED)
def create_codex_run(run: CodexRunInput, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    values = run.model_dump()
    values["id"] = str(uuid4())
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            INSERT INTO codex_runs (
                id, project_id, linear_issue, repo, branch, start_sha, end_sha, commit_sha,
                model, profile, reasoning_level, session_type, status, summary, verification,
                changed_files, risks, next_step
            ) VALUES (
                %(id)s, %(project_id)s, %(linear_issue)s, %(repo)s, %(branch)s, %(start_sha)s, %(end_sha)s, %(commit_sha)s,
                %(model)s, %(profile)s, %(reasoning_level)s, %(session_type)s, %(status)s, %(summary)s, %(verification)s,
                %(changed_files)s, %(risks)s, %(next_step)s
            ) RETURNING {CODEX_RUN_COLUMNS}
            """,
            values,
        )
        return cursor.fetchone()


@app.get("/api/status-cards")
def list_status_cards(connection: psycopg.Connection = Depends(get_connection)) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT {STATUS_CARD_COLUMNS} FROM status_cards ORDER BY resolved_at NULLS FIRST, updated_at DESC"
        )
        return cursor.fetchall()


@app.get("/api/projects/{slug}/status-cards")
def list_project_status_cards(slug: str, connection: psycopg.Connection = Depends(get_connection)) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT slug FROM projects WHERE slug = %s", (slug,))
        if cursor.fetchone() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        cursor.execute(
            f"SELECT {STATUS_CARD_COLUMNS} FROM status_cards WHERE project_id = %s "
            "ORDER BY resolved_at NULLS FIRST, updated_at DESC",
            (slug,),
        )
        return cursor.fetchall()


@app.get("/api/status-cards/{card_id}")
def get_status_card(card_id: str, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {STATUS_CARD_COLUMNS} FROM status_cards WHERE id = %s", (card_id,))
        card = cursor.fetchone()
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Status card not found")
    return card


@app.post("/api/status-cards", status_code=status.HTTP_201_CREATED)
def create_status_card(card: StatusCardInput, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    values = card.model_dump()
    values["id"] = str(uuid4())
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            INSERT INTO status_cards (
                id, project_id, title, status, facts, interpretation, next_safe_step,
                source_type, source_reference, last_checked_at
            ) VALUES (
                %(id)s, %(project_id)s, %(title)s, %(status)s, %(facts)s, %(interpretation)s, %(next_safe_step)s,
                %(source_type)s, %(source_reference)s, %(last_checked_at)s
            ) RETURNING {STATUS_CARD_COLUMNS}
            """,
            values,
        )
        return cursor.fetchone()


@app.patch("/api/status-cards/{card_id}")
def update_status_card(
    card_id: str, card: StatusCardPatch, connection: psycopg.Connection = Depends(get_connection)
) -> dict:
    changes = card.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No status card fields supplied")
    resolved = changes.pop("resolved", None)
    if resolved is not None:
        changes["resolved_at"] = datetime.now().astimezone() if resolved else None
    columns = ", ".join([*(f"{column} = %({column})s" for column in changes), "updated_at = CURRENT_TIMESTAMP"])
    changes["id"] = card_id
    with connection.cursor() as cursor:
        cursor.execute(
            f"UPDATE status_cards SET {columns} WHERE id = %(id)s RETURNING {STATUS_CARD_COLUMNS}", changes
        )
        updated = cursor.fetchone()
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Status card not found")
    return updated


@app.get("/api/actions")
def list_actions(connection: psycopg.Connection = Depends(get_connection)) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT {ACTION_COLUMNS} FROM actions "
            "ORDER BY CASE status WHEN 'Open' THEN 0 WHEN 'Bezig' THEN 1 WHEN 'Later' THEN 2 ELSE 3 END, "
            "due_date NULLS LAST, updated_at DESC"
        )
        return cursor.fetchall()


@app.get("/api/actions/{action_id}")
def get_action(action_id: str, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {ACTION_COLUMNS} FROM actions WHERE id = %s", (action_id,))
        action = cursor.fetchone()
    if action is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
    return action


@app.post("/api/actions", status_code=status.HTTP_201_CREATED)
def create_action(action: ActionInput, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    values = action.model_dump()
    values["id"] = str(uuid4())
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            INSERT INTO actions (id, title, type, status, priority, project_id, status_card_id, due_date)
            VALUES (%(id)s, %(title)s, %(type)s, %(status)s, %(priority)s, %(project_id)s, %(status_card_id)s, %(due_date)s)
            RETURNING {ACTION_COLUMNS}
            """,
            values,
        )
        return cursor.fetchone()


@app.patch("/api/actions/{action_id}")
def update_action(action_id: str, action: ActionPatch, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    changes = action.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No action fields supplied")
    columns = ", ".join([*(f"{column} = %({column})s" for column in changes), "updated_at = CURRENT_TIMESTAMP"])
    changes["id"] = action_id
    with connection.cursor() as cursor:
        cursor.execute(f"UPDATE actions SET {columns} WHERE id = %(id)s RETURNING {ACTION_COLUMNS}", changes)
        updated = cursor.fetchone()
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
    return updated


@app.get("/api/assets")
def list_assets(connection: psycopg.Connection = Depends(get_connection)) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {ASSET_COLUMNS} FROM assets ORDER BY name")
        return cursor.fetchall()


@app.get("/api/assets/{asset_id}")
def get_asset(asset_id: str, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {ASSET_COLUMNS} FROM assets WHERE id = %s", (asset_id,))
        asset = cursor.fetchone()
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return asset


@app.post("/api/assets", status_code=status.HTTP_201_CREATED)
def create_asset(asset: AssetInput, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    values = asset.model_dump()
    values["id"] = str(uuid4())
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            INSERT INTO assets (id, name, type, host, address, environment, status, notes)
            VALUES (%(id)s, %(name)s, %(type)s, %(host)s, %(address)s, %(environment)s, %(status)s, %(notes)s)
            RETURNING {ASSET_COLUMNS}
            """,
            values,
        )
        return cursor.fetchone()


@app.patch("/api/assets/{asset_id}")
def update_asset(asset_id: str, asset: AssetPatch, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    changes = asset.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No asset fields supplied")
    columns = ", ".join([*(f"{column} = %({column})s" for column in changes), "updated_at = CURRENT_TIMESTAMP"])
    changes["id"] = asset_id
    with connection.cursor() as cursor:
        cursor.execute(f"UPDATE assets SET {columns} WHERE id = %(id)s RETURNING {ASSET_COLUMNS}", changes)
        updated = cursor.fetchone()
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return updated
