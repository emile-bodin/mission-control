import json
import os
from urllib.error import URLError
from urllib.request import Request, urlopen


PULSE_VISIBLE_RESOURCE_TYPES = {"agent", "app-container", "pbs", "pmg", "system-container", "vm"}


def pulse_value(value: object) -> str:
    return value if isinstance(value, str) and value else "Unknown"


def pulse_homelab() -> dict:
    base_url = os.environ.get("PULSE_BASE_URL", "").rstrip("/")
    if not base_url:
        return {
            "available": False,
            "status": "Unknown",
            "resources": [],
            "docker_hosts": [],
            "last_updated_at": "Unknown",
        }

    token = os.environ.get("PULSE_API_TOKEN", "")
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    def get_json(path: str) -> dict:
        with urlopen(Request(f"{base_url}{path}", headers=headers), timeout=5) as response:
            return json.loads(response.read().decode("utf-8"))

    try:
        first_page = get_json("/api/resources?page=1&limit=100")
        pages = [first_page]
        total_pages = first_page.get("meta", {}).get("totalPages", 1)
        for page in range(2, total_pages + 1):
            pages.append(get_json(f"/api/resources?page={page}&limit=100"))
        summary = get_json("/api/state/summary")
    except (OSError, ValueError, UnicodeDecodeError, URLError):
        return {
            "available": False,
            "status": "Unknown",
            "resources": [],
            "docker_hosts": [],
            "last_updated_at": "Unknown",
        }

    resources = []
    for page in pages:
        for resource in page.get("data", []):
            if resource.get("type") not in PULSE_VISIBLE_RESOURCE_TYPES:
                continue
            docker = resource.get("docker") or {}
            resources.append(
                {
                    "id": pulse_value(resource.get("id")),
                    "name": pulse_value(resource.get("name")),
                    "type": pulse_value(resource.get("type")),
                    "status": pulse_value(resource.get("status")),
                    "parent_name": pulse_value(resource.get("parentName")),
                    "last_seen": pulse_value(resource.get("lastSeen")),
                    "updated_at": pulse_value(resource.get("updatedAt")),
                    "runtime": pulse_value(docker.get("runtime")),
                    "runtime_version": pulse_value(docker.get("runtimeVersion")),
                }
            )

    docker_hosts = [
        {
            "name": pulse_value(host.get("name")),
            "containers": host.get("containers") if isinstance(host.get("containers"), int) else "Unknown",
            "uptime_seconds": host.get("uptimeSeconds") if isinstance(host.get("uptimeSeconds"), int) else "Unknown",
            "cpu_usage_percent": host.get("cpuUsagePercent")
            if isinstance(host.get("cpuUsagePercent"), (int, float))
            else "Unknown",
        }
        for host in summary.get("dockerHosts", [])
        if isinstance(host, dict)
    ]

    return {
        "available": True,
        "status": pulse_value(summary.get("lastUpdate")),
        "resources": sorted(resources, key=lambda resource: (resource["type"], resource["name"])),
        "docker_hosts": docker_hosts,
        "last_updated_at": pulse_value(summary.get("lastUpdate")),
    }
