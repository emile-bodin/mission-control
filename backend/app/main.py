from collections.abc import Generator
from contextlib import asynccontextmanager
from enum import Enum
import os

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


@asynccontextmanager
async def lifespan(_: FastAPI):
    run_migrations()
    yield


app = FastAPI(title="Bodin Control Center API", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


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
