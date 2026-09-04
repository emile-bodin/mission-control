import json
import socket
from datetime import datetime, time
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, ValidationError


PRODUCT_TIMEZONE = ZoneInfo("Europe/Amsterdam")
BRIEFING_TIME = time(7, 0)


class BriefingProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=280)
    rationale: str = Field(min_length=1, max_length=1000)
    record_type: Literal["action", "routine"]
    record_id: str = Field(min_length=1, max_length=128)
    expected_updated_at: datetime
    changes: dict[str, Any] = Field(min_length=1, max_length=10)
    source_context: list[str] = Field(min_length=1, max_length=5)
    expected_impact: str = Field(min_length=1, max_length=1000)


class BriefingOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(min_length=1, max_length=4000)
    facts: list[str] = Field(default_factory=list, max_length=12)
    proposals: list[BriefingProposal] = Field(default_factory=list, max_length=8)
    unknowns: list[str] = Field(default_factory=list, max_length=12)


class BriefingRuntimeError(Exception):
    pass


class BriefingRuntimeTimeout(BriefingRuntimeError):
    pass


def schedule_due(now: datetime, last_completed_at: datetime | None) -> bool:
    local_now = now.astimezone(PRODUCT_TIMEZONE)
    if local_now.timetz().replace(tzinfo=None) < BRIEFING_TIME:
        return False
    return last_completed_at is None or last_completed_at.astimezone(PRODUCT_TIMEZONE).date() != local_now.date()


def briefing_prompt(context: dict) -> str:
    return (
        "Maak een persoonlijke dagbriefing uitsluitend op basis van deze JSON-context. "
        "Presenteer onbekende waarden expliciet als Unknown; verzin geen feiten. "
        "Doe alleen voorstellen, voer niets uit en wijzig geen externe systemen. "
        "Gebruik maximaal 12 facts, 8 proposals en 12 unknowns. Ieder voorstel wijzigt exact één bestaand "
        "action- of routine-record uit de context, met diens id en updated_at als expected_updated_at. "
        "Antwoord uitsluitend met valide JSON volgens dit schema: "
        '{"summary":"tekst","facts":["feit"],"proposals":[{"title":"voorstel","rationale":"waarom","record_type":"action","record_id":"id","expected_updated_at":"ISO-8601","changes":{"status":"Klaar"},"source_context":["feit uit context"],"expected_impact":"verwacht effect"}],"unknowns":["onbekend veld"]}.\n\n'
        + json.dumps(context, default=str, ensure_ascii=False)
    )


class CodexRuntime:
    def __init__(self, url: str, token: str, timeout_seconds: int = 120):
        self.url = url.rstrip("/")
        self.token = token
        self.timeout_seconds = timeout_seconds

    def run(self, context: dict) -> BriefingOutput:
        if not self.url or not self.token:
            raise BriefingRuntimeError("Codex runtime is not configured.")
        request = Request(
            f"{self.url}/run",
            data=json.dumps({"prompt": briefing_prompt(context)}).encode(),
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds + 5) as response:
                payload = json.loads(response.read())
        except HTTPError as error:
            if error.code == 504:
                raise BriefingRuntimeTimeout("Codex runtime timed out.") from error
            raise BriefingRuntimeError("Codex runtime is unavailable.") from error
        except (URLError, TimeoutError, socket.timeout, ValueError) as error:
            if isinstance(error, (TimeoutError, socket.timeout)):
                raise BriefingRuntimeTimeout("Codex runtime timed out.") from error
            raise BriefingRuntimeError("Codex runtime is unavailable.") from error
        if payload.get("state") != "completed" or not isinstance(payload.get("output"), str):
            raise BriefingRuntimeError("Codex runtime did not complete.")
        try:
            return BriefingOutput.model_validate_json(payload["output"])
        except ValidationError as error:
            raise BriefingRuntimeError(f"Invalid briefing output: {error.errors()[0]['msg']}") from error
