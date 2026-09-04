import base64
import binascii
import asyncio
from collections.abc import Generator
from contextlib import asynccontextmanager, suppress
from datetime import UTC, date, datetime, time, timedelta
from enum import Enum
import hmac
import json
import os
import secrets
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen
from uuid import uuid4
from zoneinfo import ZoneInfo

import psycopg
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from app.briefings import BriefingProposal, BriefingRuntimeError, BriefingRuntimeTimeout, CodexRuntime, schedule_due


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


class ActionDomain(str, Enum):
    ADMINISTRATION = "administratie"
    HOUSEHOLD = "huis_gezin"
    PROJECT = "project"


class RoutineFrequency(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    SELECTED_WEEKDAYS = "selected_weekdays"


class AssetStatus(str, Enum):
    UNKNOWN = "Onbekend"
    OK = "OK"
    ATTENTION = "Let op"
    ERROR = "Fout"


PRODUCT_TIMEZONE = ZoneInfo("Europe/Amsterdam")


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
                        start = start.replace(tzinfo=UTC).astimezone(PRODUCT_TIMEZONE).replace(tzinfo=None)
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


def product_local_date(now: datetime | None = None) -> date:
    current = now or datetime.now(UTC)
    if current.tzinfo is None:
        raise ValueError("Routine scheduling requires an aware datetime")
    return current.astimezone(PRODUCT_TIMEZONE).date()


def routine_is_scheduled_on(routine: dict, occurrence_date: date) -> bool:
    frequency = RoutineFrequency(routine["frequency"])
    if frequency is RoutineFrequency.DAILY:
        return True
    weekdays = routine["weekdays"]
    if isinstance(weekdays, str):
        weekdays = json.loads(weekdays)
    return occurrence_date.isoweekday() in weekdays


def due_routines_for_date(connection: psycopg.Connection, occurrence_date: date) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT {ROUTINE_COLUMNS}
            FROM routines
            WHERE active
              AND NOT EXISTS (
                  SELECT 1
                  FROM routine_completions
                  WHERE routine_completions.routine_id = routines.id
                    AND routine_completions.occurrence_date = %s
              )
            ORDER BY reminder_time, title, id
            """,
            (occurrence_date,),
        )
        routines = cursor.fetchall()
    return [routine for routine in routines if routine_is_scheduled_on(routine, occurrence_date)]


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


class ActionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    type: str = "Unknown"
    status: ActionStatus = ActionStatus.OPEN
    priority: str = "Unknown"
    project_id: str | None = None
    status_card_id: str | None = None
    due_date: date | None = None
    domain: ActionDomain = ActionDomain.PROJECT
    owner_id: str | None = None


class ActionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1)
    type: str | None = None
    status: ActionStatus | None = None
    priority: str | None = None
    project_id: str | None = None
    status_card_id: str | None = None
    due_date: date | None = None
    domain: ActionDomain = Field(default=None)
    owner_id: str | None = None


class RoutineInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    active: bool = True
    frequency: RoutineFrequency
    weekdays: list[int] = Field(default_factory=list)
    reminder_time: time
    owner_id: str | None = None

    @field_validator("weekdays")
    @classmethod
    def validate_weekdays(cls, weekdays: list[int]) -> list[int]:
        if any(weekday < 1 or weekday > 7 for weekday in weekdays):
            raise ValueError("Weekdays must use ISO values 1 through 7")
        if len(set(weekdays)) != len(weekdays):
            raise ValueError("Weekdays must not contain duplicates")
        return sorted(weekdays)

    @model_validator(mode="after")
    def validate_schedule(self):
        if self.frequency is RoutineFrequency.DAILY and self.weekdays:
            raise ValueError("Daily routines must not set weekdays")
        if self.frequency is RoutineFrequency.WEEKLY and len(self.weekdays) != 1:
            raise ValueError("Weekly routines require exactly one weekday")
        if self.frequency is RoutineFrequency.SELECTED_WEEKDAYS and not self.weekdays:
            raise ValueError("Selected-weekday routines require weekdays")
        return self


class RoutinePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(default=None, min_length=1)
    active: bool = Field(default=None)
    frequency: RoutineFrequency = Field(default=None)
    weekdays: list[int] = Field(default=None)
    reminder_time: time = Field(default=None)
    owner_id: str | None = None


class ProposalAcceptInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirmed: bool


class RoutineOccurrenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    occurrence_date: date | None = None


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


class WeightUnit(str, Enum):
    KILOGRAM = "kg"
    POUND = "lb"


class DistanceUnit(str, Enum):
    METER = "m"
    KILOMETER = "km"


class EnergyUnit(str, Enum):
    KILOCALORIE = "kcal"
    KILOJOULE = "kj"


def normalize_health_timestamp(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Timestamp must include a timezone")
    return value.astimezone(UTC)


class WeightInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    measured_at: datetime
    value: float = Field(gt=0)
    unit: WeightUnit
    source: str = Field(min_length=1, max_length=100)
    external_record_id: str | None = Field(default=None, min_length=1, max_length=200)

    @field_validator("measured_at")
    @classmethod
    def normalize_measured_at(cls, value: datetime) -> datetime:
        return normalize_health_timestamp(value)


class WeightPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    measured_at: datetime | None = None
    value: float | None = Field(default=None, gt=0)
    unit: WeightUnit | None = None
    source: str | None = Field(default=None, min_length=1, max_length=100)
    external_record_id: str | None = Field(default=None, min_length=1, max_length=200)

    @field_validator("measured_at")
    @classmethod
    def normalize_measured_at(cls, value: datetime | None) -> datetime | None:
        return normalize_health_timestamp(value) if value is not None else value


class ActivityInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    activity_type: str = Field(min_length=1, max_length=100)
    started_at: datetime
    ended_at: datetime
    duration_seconds: int = Field(gt=0)
    distance_value: float | None = Field(default=None, ge=0)
    distance_unit: DistanceUnit | None = None
    energy_value: float | None = Field(default=None, ge=0)
    energy_unit: EnergyUnit | None = None
    source: str = Field(min_length=1, max_length=100)
    external_record_id: str | None = Field(default=None, min_length=1, max_length=200)
    source_metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("started_at", "ended_at")
    @classmethod
    def normalize_activity_time(cls, value: datetime) -> datetime:
        return normalize_health_timestamp(value)

    @model_validator(mode="after")
    def validate_activity(self) -> "ActivityInput":
        if self.ended_at <= self.started_at:
            raise ValueError("Activity end must be after start")
        if self.duration_seconds != (self.ended_at - self.started_at).total_seconds():
            raise ValueError("Activity duration must equal the interval between start and end")
        if (self.distance_value is None) != (self.distance_unit is None):
            raise ValueError("Distance value and unit must be supplied together")
        if (self.energy_value is None) != (self.energy_unit is None):
            raise ValueError("Energy value and unit must be supplied together")
        return self


class ActivityPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    activity_type: str | None = Field(default=None, min_length=1, max_length=100)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_seconds: int | None = Field(default=None, gt=0)
    distance_value: float | None = Field(default=None, ge=0)
    distance_unit: DistanceUnit | None = None
    energy_value: float | None = Field(default=None, ge=0)
    energy_unit: EnergyUnit | None = None
    source: str | None = Field(default=None, min_length=1, max_length=100)
    external_record_id: str | None = Field(default=None, min_length=1, max_length=200)
    source_metadata: dict[str, Any] | None = None

    @field_validator("started_at", "ended_at")
    @classmethod
    def normalize_activity_time(cls, value: datetime | None) -> datetime | None:
        return normalize_health_timestamp(value) if value is not None else value


class SyncWeightInput(WeightInput):
    external_record_id: str = Field(min_length=1, max_length=200)


class SyncActivityInput(ActivityInput):
    external_record_id: str = Field(min_length=1, max_length=200)


class HealthSyncBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    records: list[dict[str, Any]] = Field(min_length=1, max_length=100)


class PairingChallengeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    device_name: str = Field(min_length=1, max_length=120)


class PairingChallengeResponse(BaseModel):
    pairing_code: str
    expires_at: datetime


class PairingExchangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pairing_code: str = Field(min_length=1, max_length=512)


class DeviceStatus(BaseModel):
    id: str
    device_name: str
    paired_at: datetime
    last_seen_at: datetime | None
    revoked_at: datetime | None


class PairingExchangeResponse(BaseModel):
    device_token: str
    device: DeviceStatus


class DeviceListResponse(BaseModel):
    devices: list[DeviceStatus]


ASSET_COLUMNS = """
    id, name, type, host, address, environment, status, notes, created_at, updated_at
"""


ACTION_COLUMNS = """
    id, title, type, status, priority, project_id, status_card_id, due_date, domain, owner_id, created_at, updated_at
"""

ROUTINE_COLUMNS = """
    id, title, active, frequency, weekdays, reminder_time, owner_id, created_at, updated_at
"""

ROUTINE_COMPLETION_COLUMNS = """
    id, routine_id, occurrence_date, completed_at, created_at
"""

HEALTH_WEIGHT_COLUMNS = """
    id, measured_at, normalized_kg, source_value, source_unit, source, external_record_id, created_at, updated_at
"""

HEALTH_ACTIVITY_COLUMNS = """
    id, activity_type, started_at, ended_at, duration_seconds, distance_meters, source_distance_value,
    source_distance_unit, energy_kilocalories, source_energy_value, source_energy_unit, source,
    external_record_id, source_metadata, created_at, updated_at
"""


STATUS_CARD_COLUMNS = """
    id, project_id, title, status, facts, interpretation, next_safe_step,
    source_type, source_reference, last_checked_at, created_at, updated_at, resolved_at
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


PAIRING_CODE_TTL = timedelta(minutes=10)
PAIRING_RATE_LIMIT = 5
PAIRING_RATE_WINDOW = timedelta(minutes=10)
LAST_SEEN_UPDATE_INTERVAL = timedelta(minutes=5)
HEALTH_SYNC_MAX_PAYLOAD_BYTES = 1_048_576


def device_secret(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} must be configured")
    return value


def secret_hash(value: str) -> str:
    return hmac.new(device_secret("DEVICE_TOKEN_PEPPER").encode(), value.encode(), "sha256").hexdigest()


def generic_unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_admin_token(x_device_admin_token: str | None = Header(default=None)) -> None:
    expected = device_secret("DEVICE_ADMIN_TOKEN")
    if x_device_admin_token is None or not hmac.compare_digest(x_device_admin_token, expected):
        raise generic_unauthorized()


def bearer_token(authorization: str | None) -> str:
    if authorization is None:
        raise generic_unauthorized()
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token or token.strip() != token:
        raise generic_unauthorized()
    return token


def trusted_client_ip(request: Request) -> str:
    # HYD-181 strips this header unless its TCP peer is a configured reverse proxy.
    forwarded = request.headers.get("x-mission-control-client-ip")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def require_paired_device(authorization: str | None, connection: psycopg.Connection) -> dict:
    token_hash = secret_hash(bearer_token(authorization))
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, device_name, paired_at, last_seen_at, revoked_at
            FROM paired_devices
            WHERE token_hash = %s AND revoked_at IS NULL
            """,
            (token_hash,),
        )
        device = cursor.fetchone()
        if device is None:
            raise generic_unauthorized()
        cursor.execute(
            """
            UPDATE paired_devices
            SET last_seen_at = CURRENT_TIMESTAMP
            WHERE id = %s
              AND (last_seen_at IS NULL OR last_seen_at <= CURRENT_TIMESTAMP - INTERVAL '5 minutes')
            """,
            (device["id"],),
        )
    return device


def create_pairing_challenge(connection: psycopg.Connection, device_name: str) -> dict:
    pairing_code = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + PAIRING_CODE_TTL
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO pairing_challenges (id, pairing_code_hash, device_name, expires_at)
            VALUES (%s, %s, %s, %s)
            """,
            (str(uuid4()), secret_hash(pairing_code), device_name, expires_at),
        )
    return {"pairing_code": pairing_code, "expires_at": expires_at}


def record_pairing_failure(cursor: psycopg.Cursor, pairing_code_hash: str, client_ip_hash: str) -> bool:
    cursor.execute(
        """
        INSERT INTO pairing_rate_limits (
            pairing_code_hash, client_ip_hash, failed_attempts, window_started_at, last_failed_at, blocked_until
        ) VALUES (%s, %s, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
        ON CONFLICT (pairing_code_hash, client_ip_hash) DO UPDATE SET
            failed_attempts = CASE
                WHEN pairing_rate_limits.window_started_at <= CURRENT_TIMESTAMP - INTERVAL '10 minutes' THEN 1
                ELSE pairing_rate_limits.failed_attempts + 1
            END,
            window_started_at = CASE
                WHEN pairing_rate_limits.window_started_at <= CURRENT_TIMESTAMP - INTERVAL '10 minutes' THEN CURRENT_TIMESTAMP
                ELSE pairing_rate_limits.window_started_at
            END,
            last_failed_at = CURRENT_TIMESTAMP,
            blocked_until = CASE
                WHEN pairing_rate_limits.window_started_at <= CURRENT_TIMESTAMP - INTERVAL '10 minutes' THEN NULL
                WHEN pairing_rate_limits.failed_attempts + 1 >= %s THEN CURRENT_TIMESTAMP + INTERVAL '10 minutes'
                ELSE pairing_rate_limits.blocked_until
            END
        RETURNING blocked_until IS NOT NULL AND blocked_until > CURRENT_TIMESTAMP AS blocked
        """,
        (pairing_code_hash, client_ip_hash, PAIRING_RATE_LIMIT),
    )
    row = cursor.fetchone()
    return row["blocked"] if isinstance(row, dict) else row[0]


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
                    domain TEXT NOT NULL DEFAULT 'project' CONSTRAINT actions_domain_check CHECK (domain IN ('administratie', 'huis_gezin', 'project')),
                    owner_id TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute("ALTER TABLE actions ADD COLUMN IF NOT EXISTS domain TEXT")
            cursor.execute("ALTER TABLE actions ADD COLUMN IF NOT EXISTS owner_id TEXT")
            cursor.execute("UPDATE actions SET domain = 'project' WHERE domain IS NULL")
            cursor.execute("ALTER TABLE actions ALTER COLUMN domain SET DEFAULT 'project'")
            cursor.execute("ALTER TABLE actions ALTER COLUMN domain SET NOT NULL")
            cursor.execute(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'actions_domain_check'
                    ) THEN
                        ALTER TABLE actions ADD CONSTRAINT actions_domain_check
                        CHECK (domain IN ('administratie', 'huis_gezin', 'project'));
                    END IF;
                END $$
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS routines (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    active BOOLEAN NOT NULL DEFAULT TRUE,
                    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'selected_weekdays')),
                    weekdays JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(weekdays) = 'array'),
                    reminder_time TIME NOT NULL,
                    owner_id TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS routine_completions (
                    id TEXT PRIMARY KEY,
                    routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
                    occurrence_date DATE NOT NULL,
                    completed_at TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (routine_id, occurrence_date)
                )
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS routine_completions_routine_occurrence_idx
                ON routine_completions (routine_id, occurrence_date)
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
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS pairing_challenges (
                    id TEXT PRIMARY KEY,
                    pairing_code_hash TEXT NOT NULL UNIQUE,
                    device_name TEXT NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL,
                    used_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS paired_devices (
                    id TEXT PRIMARY KEY,
                    device_name TEXT NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    paired_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_seen_at TIMESTAMPTZ,
                    revoked_at TIMESTAMPTZ
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS pairing_rate_limits (
                    pairing_code_hash TEXT NOT NULL,
                    client_ip_hash TEXT NOT NULL,
                    failed_attempts INTEGER NOT NULL DEFAULT 0,
                    window_started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_failed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    blocked_until TIMESTAMPTZ,
                    PRIMARY KEY (pairing_code_hash, client_ip_hash)
                )
                """
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS pairing_challenges_expires_at_idx ON pairing_challenges (expires_at)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS paired_devices_active_token_idx ON paired_devices (token_hash) WHERE revoked_at IS NULL"
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS health_weights (
                    id TEXT PRIMARY KEY,
                    measured_at TIMESTAMPTZ NOT NULL,
                    normalized_kg DOUBLE PRECISION NOT NULL CHECK (normalized_kg > 0),
                    source_value DOUBLE PRECISION NOT NULL CHECK (source_value > 0),
                    source_unit TEXT NOT NULL CHECK (source_unit IN ('kg', 'lb')),
                    source TEXT NOT NULL,
                    external_record_id TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS health_activities (
                    id TEXT PRIMARY KEY,
                    activity_type TEXT NOT NULL,
                    started_at TIMESTAMPTZ NOT NULL,
                    ended_at TIMESTAMPTZ NOT NULL,
                    duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
                    distance_meters DOUBLE PRECISION CHECK (distance_meters >= 0),
                    source_distance_value DOUBLE PRECISION CHECK (source_distance_value >= 0),
                    source_distance_unit TEXT CHECK (source_distance_unit IN ('m', 'km')),
                    energy_kilocalories DOUBLE PRECISION CHECK (energy_kilocalories >= 0),
                    source_energy_value DOUBLE PRECISION CHECK (source_energy_value >= 0),
                    source_energy_unit TEXT CHECK (source_energy_unit IN ('kcal', 'kj')),
                    source TEXT NOT NULL,
                    external_record_id TEXT,
                    source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CHECK (ended_at > started_at),
                    CHECK (duration_seconds = EXTRACT(EPOCH FROM ended_at - started_at)::INTEGER),
                    CHECK ((distance_meters IS NULL) = (source_distance_value IS NULL)),
                    CHECK ((distance_meters IS NULL) = (source_distance_unit IS NULL)),
                    CHECK ((energy_kilocalories IS NULL) = (source_energy_value IS NULL)),
                    CHECK ((energy_kilocalories IS NULL) = (source_energy_unit IS NULL))
                )
                """
            )
            cursor.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS health_weights_source_external_record_id_idx
                ON health_weights (source, external_record_id)
                WHERE external_record_id IS NOT NULL
                """
            )
            cursor.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS health_activities_source_external_record_id_idx
                ON health_activities (source, external_record_id)
                WHERE external_record_id IS NOT NULL
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS briefing_runs (
                    id TEXT PRIMARY KEY,
                    trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'scheduled')),
                    status TEXT NOT NULL CHECK (status IN ('Running', 'Completed', 'Failed', 'Timed out')),
                    scheduled_for DATE,
                    briefing JSONB,
                    validation_error TEXT,
                    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    finished_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS briefing_runs_one_active_idx
                ON briefing_runs ((true))
                WHERE status = 'Running'
                """
            )
            cursor.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS briefing_runs_scheduled_day_idx
                ON briefing_runs (scheduled_for)
                WHERE trigger = 'scheduled' AND status IN ('Running', 'Completed')
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS briefing_proposals (
                    id TEXT PRIMARY KEY,
                    briefing_id TEXT NOT NULL REFERENCES briefing_runs(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    rationale TEXT NOT NULL,
                    record_type TEXT NOT NULL CHECK (record_type IN ('action', 'routine')),
                    record_id TEXT NOT NULL,
                    expected_updated_at TIMESTAMPTZ NOT NULL,
                    changes JSONB NOT NULL,
                    source_context JSONB NOT NULL,
                    expected_impact TEXT NOT NULL,
                    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'failed')) DEFAULT 'pending',
                    result JSONB,
                    decided_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS briefing_proposal_audits (
                    id TEXT PRIMARY KEY,
                    briefing_id TEXT NOT NULL REFERENCES briefing_runs(id) ON DELETE CASCADE,
                    proposal_id TEXT NOT NULL REFERENCES briefing_proposals(id) ON DELETE CASCADE,
                    decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected', 'failed')),
                    result JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS briefing_proposals_briefing_idx
                ON briefing_proposals (briefing_id, created_at)
                """
            )


@asynccontextmanager
async def lifespan(_: FastAPI):
    run_migrations()
    stop = asyncio.Event()
    task = (
        asyncio.create_task(briefing_scheduler(stop))
        if os.environ.get("BRIEFING_SCHEDULER_ENABLED", "true").lower() == "true"
        else None
    )
    try:
        yield
    finally:
        stop.set()
        if task is not None:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


app = FastAPI(title="Bodin Control Center API", lifespan=lifespan)


@app.middleware("http")
async def limit_health_sync_payload(request: Request, call_next):
    if request.method == "POST" and request.url.path == "/api/v1/health/sync":
        body = await request.body()
        if len(body) > HEALTH_SYNC_MAX_PAYLOAD_BYTES:
            return JSONResponse(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, content={"detail": "Sync payload too large"})
    return await call_next(request)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/api/devices/pairing-challenges",
    status_code=status.HTTP_201_CREATED,
    response_model=PairingChallengeResponse,
)
def create_device_pairing_challenge(
    payload: PairingChallengeCreate,
    _: None = Depends(require_admin_token),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict:
    return create_pairing_challenge(connection, payload.device_name)


@app.post(
    "/api/devices/pair",
    status_code=status.HTTP_201_CREATED,
    response_model=PairingExchangeResponse,
)
def exchange_pairing_challenge(
    payload: PairingExchangeRequest,
    request: Request,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict:
    pairing_code_hash = secret_hash(payload.pairing_code)
    client_ip_hash = secret_hash(trusted_client_ip(request))
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT blocked_until > CURRENT_TIMESTAMP AS blocked
            FROM pairing_rate_limits
            WHERE pairing_code_hash = %s AND client_ip_hash = %s
            FOR UPDATE
            """,
            (pairing_code_hash, client_ip_hash),
        )
        rate_limit = cursor.fetchone()
        blocked = rate_limit["blocked"] if isinstance(rate_limit, dict) else rate_limit[0] if rate_limit else False
        if blocked:
            connection.commit()
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Pairing unavailable")

        cursor.execute(
            "SELECT id, device_name, expires_at, used_at FROM pairing_challenges WHERE pairing_code_hash = %s FOR UPDATE",
            (pairing_code_hash,),
        )
        challenge = cursor.fetchone()
        if challenge is None or challenge["used_at"] is not None or challenge["expires_at"] <= datetime.now(UTC):
            now_blocked = record_pairing_failure(cursor, pairing_code_hash, client_ip_hash)
            connection.commit()
            if now_blocked:
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Pairing unavailable")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Pairing failed")

        device_token = secrets.token_urlsafe(32)
        device_id = str(uuid4())
        cursor.execute("UPDATE pairing_challenges SET used_at = CURRENT_TIMESTAMP WHERE id = %s", (challenge["id"],))
        cursor.execute(
            """
            INSERT INTO paired_devices (id, device_name, token_hash, last_seen_at)
            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
            RETURNING id, device_name, paired_at, last_seen_at, revoked_at
            """,
            (device_id, challenge["device_name"], secret_hash(device_token)),
        )
        device = cursor.fetchone()
        cursor.execute(
            "DELETE FROM pairing_rate_limits WHERE pairing_code_hash = %s AND client_ip_hash = %s",
            (pairing_code_hash, client_ip_hash),
        )
    return {"device_token": device_token, "device": device}


@app.get("/api/devices/me", response_model=DeviceStatus)
def get_device_status(
    authorization: str | None = Header(default=None),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict:
    return require_paired_device(authorization, connection)


@app.get("/api/devices", response_model=DeviceListResponse)
def list_devices(
    _: None = Depends(require_admin_token),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, device_name, paired_at, last_seen_at, revoked_at
            FROM paired_devices
            ORDER BY paired_at DESC
            """
        )
        return {"devices": cursor.fetchall()}


@app.post("/api/devices/{device_id}/revoke", status_code=status.HTTP_204_NO_CONTENT)
def revoke_device(
    device_id: str,
    _: None = Depends(require_admin_token),
    connection: psycopg.Connection = Depends(get_connection),
) -> Response:
    with connection.cursor() as cursor:
        cursor.execute(
            "UPDATE paired_devices SET revoked_at = CURRENT_TIMESTAMP WHERE id = %s AND revoked_at IS NULL",
            (device_id,),
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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


def weight_values(weight: WeightInput) -> dict[str, Any]:
    values = weight.model_dump()
    values["source_value"] = values.pop("value")
    values["source_unit"] = values.pop("unit").value
    values["normalized_kg"] = round(
        values["source_value"] if values["source_unit"] == "kg" else values["source_value"] * 0.45359237,
        6,
    )
    return values


def activity_values(activity: ActivityInput) -> dict[str, Any]:
    values = activity.model_dump()
    distance_unit = values.pop("distance_unit")
    energy_unit = values.pop("energy_unit")
    values["source_distance_value"] = values.pop("distance_value")
    values["source_distance_unit"] = distance_unit.value if distance_unit else None
    values["distance_meters"] = (
        values["source_distance_value"] * (1000 if values["source_distance_unit"] == "km" else 1)
        if values["source_distance_value"] is not None
        else None
    )
    values["source_energy_value"] = values.pop("energy_value")
    values["source_energy_unit"] = energy_unit.value if energy_unit else None
    values["energy_kilocalories"] = (
        values["source_energy_value"] * 0.239005736 if values["source_energy_unit"] == "kj" else values["source_energy_value"]
    )
    values["source_metadata"] = json.dumps(values["source_metadata"])
    return values


def upsert_health_weight(cursor: psycopg.Cursor, weight: WeightInput) -> tuple[dict, str]:
    values = weight_values(weight)
    values["id"] = str(uuid4())
    cursor.execute(
        f"""
        INSERT INTO health_weights (
            id, measured_at, normalized_kg, source_value, source_unit, source, external_record_id
        ) VALUES (
            %(id)s, %(measured_at)s, %(normalized_kg)s, %(source_value)s, %(source_unit)s, %(source)s,
            %(external_record_id)s
        ) ON CONFLICT (source, external_record_id) WHERE external_record_id IS NOT NULL DO UPDATE SET
            measured_at = EXCLUDED.measured_at,
            normalized_kg = EXCLUDED.normalized_kg,
            source_value = EXCLUDED.source_value,
            source_unit = EXCLUDED.source_unit,
            updated_at = CURRENT_TIMESTAMP
        WHERE (health_weights.measured_at, health_weights.normalized_kg, health_weights.source_value,
               health_weights.source_unit) IS DISTINCT FROM
              (EXCLUDED.measured_at, EXCLUDED.normalized_kg, EXCLUDED.source_value, EXCLUDED.source_unit)
        RETURNING {HEALTH_WEIGHT_COLUMNS}, (xmax = 0) AS inserted
        """,
        values,
    )
    record = cursor.fetchone()
    if record is not None:
        return record, "created" if record.pop("inserted") else "updated"
    cursor.execute(
        f"SELECT {HEALTH_WEIGHT_COLUMNS} FROM health_weights WHERE source = %s AND external_record_id = %s",
        (weight.source, weight.external_record_id),
    )
    return cursor.fetchone(), "unchanged"


def upsert_health_activity(cursor: psycopg.Cursor, activity: ActivityInput) -> tuple[dict, str]:
    values = activity_values(activity)
    values["id"] = str(uuid4())
    cursor.execute(
        f"""
        INSERT INTO health_activities (
            id, activity_type, started_at, ended_at, duration_seconds, distance_meters, source_distance_value,
            source_distance_unit, energy_kilocalories, source_energy_value, source_energy_unit, source,
            external_record_id, source_metadata
        ) VALUES (
            %(id)s, %(activity_type)s, %(started_at)s, %(ended_at)s, %(duration_seconds)s, %(distance_meters)s,
            %(source_distance_value)s, %(source_distance_unit)s, %(energy_kilocalories)s, %(source_energy_value)s,
            %(source_energy_unit)s, %(source)s, %(external_record_id)s, %(source_metadata)s::jsonb
        ) ON CONFLICT (source, external_record_id) WHERE external_record_id IS NOT NULL DO UPDATE SET
            activity_type = EXCLUDED.activity_type,
            started_at = EXCLUDED.started_at,
            ended_at = EXCLUDED.ended_at,
            duration_seconds = EXCLUDED.duration_seconds,
            distance_meters = EXCLUDED.distance_meters,
            source_distance_value = EXCLUDED.source_distance_value,
            source_distance_unit = EXCLUDED.source_distance_unit,
            energy_kilocalories = EXCLUDED.energy_kilocalories,
            source_energy_value = EXCLUDED.source_energy_value,
            source_energy_unit = EXCLUDED.source_energy_unit,
            source_metadata = EXCLUDED.source_metadata,
            updated_at = CURRENT_TIMESTAMP
        WHERE (health_activities.activity_type, health_activities.started_at, health_activities.ended_at,
               health_activities.duration_seconds, health_activities.distance_meters,
               health_activities.source_distance_value, health_activities.source_distance_unit,
               health_activities.energy_kilocalories, health_activities.source_energy_value,
               health_activities.source_energy_unit, health_activities.source_metadata) IS DISTINCT FROM
              (EXCLUDED.activity_type, EXCLUDED.started_at, EXCLUDED.ended_at, EXCLUDED.duration_seconds,
               EXCLUDED.distance_meters, EXCLUDED.source_distance_value, EXCLUDED.source_distance_unit,
               EXCLUDED.energy_kilocalories, EXCLUDED.source_energy_value, EXCLUDED.source_energy_unit,
               EXCLUDED.source_metadata)
        RETURNING {HEALTH_ACTIVITY_COLUMNS}, (xmax = 0) AS inserted
        """,
        values,
    )
    record = cursor.fetchone()
    if record is not None:
        return record, "created" if record.pop("inserted") else "updated"
    cursor.execute(
        f"SELECT {HEALTH_ACTIVITY_COLUMNS} FROM health_activities WHERE source = %s AND external_record_id = %s",
        (activity.source, activity.external_record_id),
    )
    return cursor.fetchone(), "unchanged"


def encode_health_sync_cursor(updated_at: datetime, record_type: str, record_id: str) -> str:
    payload = json.dumps(
        {"v": 1, "updated_at": updated_at.astimezone(UTC).isoformat(), "type": record_type, "id": record_id},
        separators=(",", ":"),
    ).encode()
    return base64.urlsafe_b64encode(payload).decode().rstrip("=")


def decode_health_sync_cursor(cursor: str) -> tuple[datetime, str, str]:
    try:
        payload = json.loads(base64.b64decode(cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True))
        if set(payload) != {"v", "updated_at", "type", "id"} or payload["v"] != 1 or payload["type"] not in {
            "weight",
            "activity",
        }:
            raise ValueError
        updated_at = normalize_health_timestamp(datetime.fromisoformat(payload["updated_at"].replace("Z", "+00:00")))
        if not isinstance(payload["id"], str) or not payload["id"]:
            raise ValueError
        return updated_at, payload["type"], payload["id"]
    except (ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError, binascii.Error) as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid sync cursor") from error


def sync_validation_result(index: int, record_type: str, error: ValidationError | ValueError) -> dict:
    if isinstance(error, ValidationError):
        details = [{"loc": list(item["loc"]), "message": item["msg"], "type": item["type"]} for item in error.errors()]
    else:
        details = [{"loc": [], "message": str(error), "type": "value_error"}]
    return {"index": index, "type": record_type, "status": "invalid", "error": {"code": "validation_error", "details": details}}


@app.post("/api/v1/health/sync")
def sync_health_records(
    batch: HealthSyncBatch,
    authorization: str | None = Header(default=None),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict:
    require_paired_device(authorization, connection)
    connection.commit()
    results: list[dict] = []
    for index, raw_record in enumerate(batch.records):
        record = dict(raw_record)
        record_type = record.pop("type", "unknown")
        if record_type not in {"weight", "activity"}:
            results.append(sync_validation_result(index, "unknown", ValueError("Record type must be weight or activity")))
            continue
        try:
            health_record = (
                SyncWeightInput.model_validate(record)
                if record_type == "weight"
                else SyncActivityInput.model_validate(record)
            )
        except ValidationError as error:
            results.append(sync_validation_result(index, record_type, error))
            continue
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    stored, outcome = (
                        upsert_health_weight(cursor, health_record)
                        if record_type == "weight"
                        else upsert_health_activity(cursor, health_record)
                    )
            results.append(
                {
                    "index": index,
                    "type": record_type,
                    "status": outcome,
                    "id": stored["id"],
                    "source": stored["source"],
                    "external_record_id": stored["external_record_id"],
                }
            )
        except psycopg.Error:
            results.append(
                {"index": index, "type": record_type, "status": "failed", "error": {"code": "storage_error"}}
            )
    accepted = sum(result["status"] in {"created", "updated", "unchanged"} for result in results)
    return {"api_version": "v1", "accepted": accepted, "rejected": len(results) - accepted, "results": results}


@app.get("/api/v1/health/sync")
def list_health_sync_changes(
    cursor: str | None = None,
    limit: int = Query(default=100, ge=1, le=100),
    authorization: str | None = Header(default=None),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict:
    require_paired_device(authorization, connection)
    cursor_values = decode_health_sync_cursor(cursor) if cursor else None
    query = """
        WITH changes AS (
            SELECT 'weight' AS record_type, id, updated_at FROM health_weights
            UNION ALL
            SELECT 'activity' AS record_type, id, updated_at FROM health_activities
        )
        SELECT record_type, id, updated_at
        FROM changes
    """
    parameters: tuple[Any, ...] = ()
    if cursor_values:
        query += " WHERE (updated_at, record_type, id) > (%s, %s, %s)"
        parameters = cursor_values
    query += " ORDER BY updated_at, record_type, id LIMIT %s"
    with connection.cursor() as db_cursor:
        db_cursor.execute(query, (*parameters, limit + 1))
        changes = db_cursor.fetchall()
        records: list[dict] = []
        for change in changes[:limit]:
            columns = HEALTH_WEIGHT_COLUMNS if change["record_type"] == "weight" else HEALTH_ACTIVITY_COLUMNS
            table = "health_weights" if change["record_type"] == "weight" else "health_activities"
            db_cursor.execute(f"SELECT {columns} FROM {table} WHERE id = %s", (change["id"],))
            record = db_cursor.fetchone()
            record["type"] = change["record_type"]
            records.append(record)
    next_cursor = (
        encode_health_sync_cursor(changes[min(len(changes), limit) - 1]["updated_at"], changes[min(len(changes), limit) - 1]["record_type"], changes[min(len(changes), limit) - 1]["id"])
        if records
        else cursor
    )
    return {"api_version": "v1", "records": records, "next_cursor": next_cursor, "has_more": len(changes) > limit}


def weight_input_from_record(record: dict) -> dict[str, Any]:
    return {
        "measured_at": record["measured_at"],
        "value": record["source_value"],
        "unit": record["source_unit"],
        "source": record["source"],
        "external_record_id": record["external_record_id"],
    }


def activity_input_from_record(record: dict) -> dict[str, Any]:
    return {
        "activity_type": record["activity_type"],
        "started_at": record["started_at"],
        "ended_at": record["ended_at"],
        "duration_seconds": record["duration_seconds"],
        "distance_value": record["source_distance_value"],
        "distance_unit": record["source_distance_unit"],
        "energy_value": record["source_energy_value"],
        "energy_unit": record["source_energy_unit"],
        "source": record["source"],
        "external_record_id": record["external_record_id"],
        "source_metadata": record["source_metadata"],
    }


@app.get("/api/health/weights")
def list_health_weights(connection: psycopg.Connection = Depends(get_connection)) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {HEALTH_WEIGHT_COLUMNS} FROM health_weights ORDER BY measured_at DESC, id")
        return cursor.fetchall()


@app.get("/api/health/weights/{weight_id}")
def get_health_weight(weight_id: str, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {HEALTH_WEIGHT_COLUMNS} FROM health_weights WHERE id = %s", (weight_id,))
        record = cursor.fetchone()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weight not found")
    return record


@app.post("/api/health/weights", status_code=status.HTTP_201_CREATED)
def create_health_weight(
    weight: WeightInput,
    response: Response,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict:
    with connection.cursor() as cursor:
        record, outcome = upsert_health_weight(cursor, weight)
    if outcome != "created":
        response.status_code = status.HTTP_200_OK
    return record


@app.patch("/api/health/weights/{weight_id}")
def update_health_weight(
    weight_id: str,
    weight: WeightPatch,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict:
    changes = weight.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No weight fields supplied")
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {HEALTH_WEIGHT_COLUMNS} FROM health_weights WHERE id = %s", (weight_id,))
        record = cursor.fetchone()
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weight not found")
        payload = weight_input_from_record(record)
        payload.update(changes)
        values = weight_values(WeightInput.model_validate(payload))
        values["id"] = weight_id
        try:
            cursor.execute(
                f"""
                UPDATE health_weights SET
                    measured_at = %(measured_at)s,
                    normalized_kg = %(normalized_kg)s,
                    source_value = %(source_value)s,
                    source_unit = %(source_unit)s,
                    source = %(source)s,
                    external_record_id = %(external_record_id)s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %(id)s
                RETURNING {HEALTH_WEIGHT_COLUMNS}
                """,
                values,
            )
            return cursor.fetchone()
        except psycopg.errors.UniqueViolation as error:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Weight external record already exists") from error


@app.get("/api/health/activities")
def list_health_activities(connection: psycopg.Connection = Depends(get_connection)) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {HEALTH_ACTIVITY_COLUMNS} FROM health_activities ORDER BY started_at DESC, id")
        return cursor.fetchall()


@app.get("/api/health/activities/{activity_id}")
def get_health_activity(activity_id: str, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {HEALTH_ACTIVITY_COLUMNS} FROM health_activities WHERE id = %s", (activity_id,))
        record = cursor.fetchone()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    return record


@app.post("/api/health/activities", status_code=status.HTTP_201_CREATED)
def create_health_activity(
    activity: ActivityInput,
    response: Response,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict:
    with connection.cursor() as cursor:
        record, outcome = upsert_health_activity(cursor, activity)
    if outcome != "created":
        response.status_code = status.HTTP_200_OK
    return record


@app.patch("/api/health/activities/{activity_id}")
def update_health_activity(
    activity_id: str,
    activity: ActivityPatch,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict:
    changes = activity.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No activity fields supplied")
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {HEALTH_ACTIVITY_COLUMNS} FROM health_activities WHERE id = %s", (activity_id,))
        record = cursor.fetchone()
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
        payload = activity_input_from_record(record)
        payload.update(changes)
        values = activity_values(ActivityInput.model_validate(payload))
        values["id"] = activity_id
        try:
            cursor.execute(
                f"""
                UPDATE health_activities SET
                    activity_type = %(activity_type)s,
                    started_at = %(started_at)s,
                    ended_at = %(ended_at)s,
                    duration_seconds = %(duration_seconds)s,
                    distance_meters = %(distance_meters)s,
                    source_distance_value = %(source_distance_value)s,
                    source_distance_unit = %(source_distance_unit)s,
                    energy_kilocalories = %(energy_kilocalories)s,
                    source_energy_value = %(source_energy_value)s,
                    source_energy_unit = %(source_energy_unit)s,
                    source = %(source)s,
                    external_record_id = %(external_record_id)s,
                    source_metadata = %(source_metadata)s::jsonb,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %(id)s
                RETURNING {HEALTH_ACTIVITY_COLUMNS}
                """,
                values,
            )
            return cursor.fetchone()
        except psycopg.errors.UniqueViolation as error:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Activity external record already exists") from error


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


@app.get("/api/routines")
def list_routines(connection: psycopg.Connection = Depends(get_connection)) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {ROUTINE_COLUMNS} FROM routines ORDER BY active DESC, reminder_time, title, id")
        return cursor.fetchall()


@app.get("/api/routines/due")
def list_due_routines(connection: psycopg.Connection = Depends(get_connection)) -> list[dict]:
    return due_routines_for_date(connection, product_local_date())


@app.get("/api/routines/{routine_id}")
def get_routine(routine_id: str, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {ROUTINE_COLUMNS} FROM routines WHERE id = %s", (routine_id,))
        routine = cursor.fetchone()
    if routine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routine not found")
    return routine


@app.post("/api/routines", status_code=status.HTTP_201_CREATED)
def create_routine(routine: RoutineInput, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    values = routine.model_dump()
    values["id"] = str(uuid4())
    values["weekdays"] = json.dumps(values["weekdays"])
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            INSERT INTO routines (id, title, active, frequency, weekdays, reminder_time, owner_id)
            VALUES (%(id)s, %(title)s, %(active)s, %(frequency)s, %(weekdays)s::jsonb, %(reminder_time)s, %(owner_id)s)
            RETURNING {ROUTINE_COLUMNS}
            """,
            values,
        )
        return cursor.fetchone()


@app.patch("/api/routines/{routine_id}")
def update_routine(
    routine_id: str, routine: RoutinePatch, connection: psycopg.Connection = Depends(get_connection)
) -> dict:
    changes = routine.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No routine fields supplied")
    existing = get_routine(routine_id, connection)
    candidate = RoutineInput.model_validate(
        {
            "title": existing["title"],
            "active": existing["active"],
            "frequency": existing["frequency"],
            "weekdays": existing["weekdays"],
            "reminder_time": existing["reminder_time"],
            "owner_id": existing["owner_id"],
            **changes,
        }
    )
    values = candidate.model_dump(include=set(changes))
    columns = []
    for column in values:
        columns.append(f"{column} = %({column})s::jsonb" if column == "weekdays" else f"{column} = %({column})s")
    if "weekdays" in values:
        values["weekdays"] = json.dumps(values["weekdays"])
    values["id"] = routine_id
    with connection.cursor() as cursor:
        cursor.execute(
            f"UPDATE routines SET {', '.join(columns)}, updated_at = CURRENT_TIMESTAMP "
            f"WHERE id = %(id)s RETURNING {ROUTINE_COLUMNS}",
            values,
        )
        return cursor.fetchone()


@app.get("/api/routines/{routine_id}/completions")
def list_routine_completions(
    routine_id: str, connection: psycopg.Connection = Depends(get_connection)
) -> list[dict]:
    get_routine(routine_id, connection)
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT {ROUTINE_COMPLETION_COLUMNS} FROM routine_completions "
            "WHERE routine_id = %s ORDER BY occurrence_date DESC, completed_at DESC",
            (routine_id,),
        )
        return cursor.fetchall()


@app.post("/api/routines/{routine_id}/complete")
def complete_routine(
    routine_id: str,
    occurrence: RoutineOccurrenceInput,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict:
    get_routine(routine_id, connection)
    occurrence_date = occurrence.occurrence_date or product_local_date()
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            INSERT INTO routine_completions (id, routine_id, occurrence_date, completed_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (routine_id, occurrence_date) DO NOTHING
            RETURNING {ROUTINE_COMPLETION_COLUMNS}
            """,
            (str(uuid4()), routine_id, occurrence_date, datetime.now(UTC)),
        )
        completion = cursor.fetchone()
        if completion is None:
            cursor.execute(
                f"SELECT {ROUTINE_COMPLETION_COLUMNS} FROM routine_completions "
                "WHERE routine_id = %s AND occurrence_date = %s",
                (routine_id, occurrence_date),
            )
            completion = cursor.fetchone()
        return completion


@app.post("/api/routines/{routine_id}/uncomplete")
def uncomplete_routine(
    routine_id: str,
    occurrence: RoutineOccurrenceInput,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict:
    get_routine(routine_id, connection)
    occurrence_date = occurrence.occurrence_date or product_local_date()
    with connection.cursor() as cursor:
        cursor.execute(
            "DELETE FROM routine_completions WHERE routine_id = %s AND occurrence_date = %s RETURNING id",
            (routine_id, occurrence_date),
        )
        removed = cursor.fetchone() is not None
    return {"routine_id": routine_id, "occurrence_date": occurrence_date, "removed": removed}


@app.get("/api/actions")
def list_actions(
    domain: ActionDomain | None = Query(default=None),
    connection: psycopg.Connection = Depends(get_connection),
) -> list[dict]:
    with connection.cursor() as cursor:
        query = f"SELECT {ACTION_COLUMNS} FROM actions"
        parameters: tuple[str, ...] = ()
        if domain is not None:
            query += " WHERE domain = %s"
            parameters = (domain.value,)
        query += (
            " ORDER BY CASE status WHEN 'Open' THEN 0 WHEN 'Bezig' THEN 1 WHEN 'Later' THEN 2 ELSE 3 END, "
            "due_date NULLS LAST, updated_at DESC"
        )
        cursor.execute(
            query,
            parameters,
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
            INSERT INTO actions (id, title, type, status, priority, project_id, status_card_id, due_date, domain, owner_id)
            VALUES (%(id)s, %(title)s, %(type)s, %(status)s, %(priority)s, %(project_id)s, %(status_card_id)s, %(due_date)s, %(domain)s, %(owner_id)s)
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


BRIEFING_RUN_COLUMNS = """
    id, trigger, status, scheduled_for, briefing, validation_error, started_at, finished_at, created_at
"""
BRIEFING_PROPOSAL_COLUMNS = """
    id, briefing_id, title, rationale, record_type, record_id, expected_updated_at, changes,
    source_context, expected_impact, status, result, decided_at, created_at
"""


def briefing_context(connection: psycopg.Connection, now: datetime) -> dict:
    local_now = now.astimezone(PRODUCT_TIMEZONE)
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT id, title, status, priority, due_date, domain, updated_at FROM actions "
            "WHERE status != 'Klaar' ORDER BY due_date NULLS LAST, updated_at DESC LIMIT 20"
        )
        actions = cursor.fetchall()
        cursor.execute("SELECT slug, display_name, status, personal_status FROM projects ORDER BY display_name")
        projects = cursor.fetchall()
        cursor.execute(
            "SELECT title, status, facts, next_safe_step FROM status_cards "
            "WHERE resolved_at IS NULL ORDER BY updated_at DESC LIMIT 12"
        )
        cards = cursor.fetchall()
        cursor.execute(f"SELECT name, status, type FROM assets ORDER BY name")
        assets = cursor.fetchall()
        cursor.execute(
            "SELECT measured_at, normalized_kg, source FROM health_weights "
            "ORDER BY measured_at DESC LIMIT 7"
        )
        weights = cursor.fetchall()
        cursor.execute(
            "SELECT activity_type, started_at, duration_seconds, source FROM health_activities "
            "ORDER BY started_at DESC LIMIT 10"
        )
        activities = cursor.fetchall()

    schedule = calendar_schedule()
    routines = due_routines_for_date(connection, local_now.date())
    return {
        "generated_at": now,
        "agenda": {"status": schedule["status"], "events": schedule["events"][:8]},
        "actions": actions,
        "routines_due": [
            {"id": routine["id"], "title": routine["title"], "reminder_time": routine["reminder_time"], "updated_at": routine["updated_at"]}
            for routine in routines
        ],
        "projects": projects,
        "status_cards": cards,
        "pulse": assets,
        "health": {"weights": weights, "activities": activities},
    }


def persist_briefing_proposals(
    connection: psycopg.Connection, briefing_id: str, proposals: list[BriefingProposal]
) -> None:
    if not proposals:
        return
    values = []
    for proposal in proposals:
        item = proposal.model_dump(mode="json")
        values.append(
            {
                "id": str(uuid4()),
                "briefing_id": briefing_id,
                **item,
                "changes": json.dumps(item["changes"]),
                "source_context": json.dumps(item["source_context"]),
            }
        )
    with connection.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO briefing_proposals (
                id, briefing_id, title, rationale, record_type, record_id, expected_updated_at,
                changes, source_context, expected_impact
            ) VALUES (
                %(id)s, %(briefing_id)s, %(title)s, %(rationale)s, %(record_type)s, %(record_id)s,
                %(expected_updated_at)s, %(changes)s::jsonb, %(source_context)s::jsonb, %(expected_impact)s
            )
            """,
            values,
        )


def record_proposal_audit(
    connection: psycopg.Connection, proposal: dict, decision: str, result: dict
) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO briefing_proposal_audits (id, briefing_id, proposal_id, decision, result)
            VALUES (%s, %s, %s, %s, %s::jsonb)
            """,
            (str(uuid4()), proposal["briefing_id"], proposal["id"], decision, json.dumps(result, default=str)),
        )


def decide_briefing_proposal(connection: psycopg.Connection, proposal_id: str, decision: str) -> dict | None:
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT {BRIEFING_PROPOSAL_COLUMNS} FROM briefing_proposals WHERE id = %s FOR UPDATE",
            (proposal_id,),
        )
        proposal = cursor.fetchone()
    if proposal is None:
        return None
    if proposal["status"] != "pending":
        return proposal
    if decision == "rejected":
        result = {"message": "Proposal rejected; no domain record changed."}
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE briefing_proposals SET status = 'rejected', result = %s::jsonb, decided_at = CURRENT_TIMESTAMP WHERE id = %s",
                (json.dumps(result), proposal_id),
            )
        proposal["status"], proposal["result"] = "rejected", result
        record_proposal_audit(connection, proposal, "rejected", result)
        return proposal

    try:
        columns = ACTION_COLUMNS if proposal["record_type"] == "action" else ROUTINE_COLUMNS
        table = "actions" if proposal["record_type"] == "action" else "routines"
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT {columns} FROM {table} WHERE id = %s FOR UPDATE", (proposal["record_id"],))
            target = cursor.fetchone()
        if target is None:
            result = {"message": "Proposal target no longer exists."}
            proposal["status"], proposal["result"] = "failed", result
        elif target["updated_at"] != proposal["expected_updated_at"]:
            result = {"message": "Proposal target changed after the briefing."}
            proposal["status"], proposal["result"] = "failed", result
        else:
            updated = (
                update_action(proposal["record_id"], ActionPatch.model_validate(proposal["changes"]), connection)
                if proposal["record_type"] == "action"
                else update_routine(proposal["record_id"], RoutinePatch.model_validate(proposal["changes"]), connection)
            )
            result = {"record_id": updated["id"], "updated_at": updated["updated_at"]}
            proposal["status"], proposal["result"] = "accepted", result
    except (ValidationError, HTTPException) as error:
        result = {"message": "Proposal target or changes are no longer valid.", "detail": str(error)}
        proposal["status"], proposal["result"] = "failed", result

    with connection.cursor() as cursor:
        cursor.execute(
            "UPDATE briefing_proposals SET status = %s, result = %s::jsonb, decided_at = CURRENT_TIMESTAMP WHERE id = %s",
            (proposal["status"], json.dumps(proposal["result"], default=str), proposal_id),
        )
    record_proposal_audit(connection, proposal, proposal["status"], proposal["result"])
    return proposal


def create_briefing_run(
    connection: psycopg.Connection,
    trigger: str,
    scheduled_for: date | None = None,
) -> dict | None:
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            INSERT INTO briefing_runs (id, trigger, status, scheduled_for)
            VALUES (%s, %s, 'Running', %s)
            ON CONFLICT DO NOTHING
            RETURNING {BRIEFING_RUN_COLUMNS}
            """,
            (str(uuid4()), trigger, scheduled_for),
        )
        return cursor.fetchone()


def execute_briefing_run(run_id: str) -> None:
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM briefing_runs WHERE id = %s AND status = 'Running'", (run_id,))
            if cursor.fetchone() is None:
                return
        try:
            context = briefing_context(connection, datetime.now(UTC))
            output = CodexRuntime(
                os.environ.get("CODEX_RUNTIME_URL", ""),
                os.environ.get("CODEX_RUNTIME_TOKEN", ""),
            ).run(context)
        except BriefingRuntimeError as error:
            briefing_status = "Timed out" if isinstance(error, BriefingRuntimeTimeout) else "Failed"
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE briefing_runs
                    SET status = %s, validation_error = %s, finished_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND status = 'Running'
                    """,
                    (briefing_status, str(error), run_id),
                )
        else:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE briefing_runs
                    SET status = 'Completed', briefing = %s::jsonb, finished_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND status = 'Running'
                    """,
                    (json.dumps(output.model_dump(mode="json")), run_id),
                )
            persist_briefing_proposals(connection, run_id, output.proposals)


def schedule_briefing_if_due() -> None:
    now = datetime.now(UTC)
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT finished_at FROM briefing_runs WHERE status = 'Completed' "
                "ORDER BY finished_at DESC LIMIT 1"
            )
            previous = cursor.fetchone()
        last_completed_at = previous["finished_at"] if previous else None
        if not schedule_due(now, last_completed_at):
            return
        run = create_briefing_run(connection, "scheduled", now.astimezone(PRODUCT_TIMEZONE).date())
        if run is None:
            return
        run_id = run["id"]
    execute_briefing_run(run_id)


async def briefing_scheduler(stop: asyncio.Event) -> None:
    while not stop.is_set():
        await asyncio.to_thread(schedule_briefing_if_due)
        try:
            await asyncio.wait_for(stop.wait(), timeout=60)
        except TimeoutError:
            pass


@app.get("/api/briefings")
def list_briefings(connection: psycopg.Connection = Depends(get_connection)) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT {BRIEFING_RUN_COLUMNS} FROM briefing_runs ORDER BY created_at DESC LIMIT 20")
        return cursor.fetchall()


@app.get("/api/briefing-proposals")
def list_briefing_proposals(
    briefing_id: str | None = Query(default=None), connection: psycopg.Connection = Depends(get_connection)
) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT {BRIEFING_PROPOSAL_COLUMNS} FROM briefing_proposals "
            "WHERE (%s IS NULL OR briefing_id = %s) ORDER BY created_at DESC LIMIT 50",
            (briefing_id, briefing_id),
        )
        return cursor.fetchall()


@app.post("/api/briefing-proposals/{proposal_id}/accept")
def accept_briefing_proposal(
    proposal_id: str, confirmation: ProposalAcceptInput, connection: psycopg.Connection = Depends(get_connection)
) -> dict:
    if not confirmation.confirmed:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Explicit confirmation is required")
    proposal = decide_briefing_proposal(connection, proposal_id, "accepted")
    if proposal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Briefing proposal not found")
    return proposal


@app.post("/api/briefing-proposals/{proposal_id}/reject")
def reject_briefing_proposal(proposal_id: str, connection: psycopg.Connection = Depends(get_connection)) -> dict:
    proposal = decide_briefing_proposal(connection, proposal_id, "rejected")
    if proposal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Briefing proposal not found")
    return proposal


@app.post("/api/briefings/refresh", status_code=status.HTTP_202_ACCEPTED)
def refresh_briefing(
    background_tasks: BackgroundTasks,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict:
    run = create_briefing_run(connection, "manual")
    if run is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A briefing run is already active.")
    background_tasks.add_task(execute_briefing_run, run["id"])
    return run
