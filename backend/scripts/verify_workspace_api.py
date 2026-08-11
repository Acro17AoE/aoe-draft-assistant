"""Integration smoke test for workspace document sync API (in-process, no server)."""
from __future__ import annotations

import os
import sys
import tempfile
import uuid

# Must be set before app import creates DB engine
_test_dir = tempfile.mkdtemp(prefix="aoe-verify-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_test_dir, 'test.db')}"
os.environ["AUTH_SECRET"] = "verify-test-secret"

from fastapi.testclient import TestClient  # noqa: E402

from app.database import init_db  # noqa: E402
from app.main import app  # noqa: E402

init_db()
client = TestClient(app)


def register(label: str) -> str:
    email = f"{label}-{uuid.uuid4().hex[:8]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "test-pass-123", "display_name": label},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def main() -> None:
    assert client.get("/health").status_code == 200

    owner_token = register("owner")
    joiner_token = register("joiner")

    create = client.post(
        "/api/workspaces",
        headers=auth_headers(owner_token),
        json={"name": "Verify Session"},
    )
    assert create.status_code == 200, create.text
    workspace = create.json()
    slug = workspace["share_slug"]
    workspace_id = workspace["id"]

    host_map_session = {
        "mode": "single-map",
        "ownTeamName": "Team Host",
        "singleMap": "Arabia",
        "singleMapFormat": "PA3",
        "started": True,
    }
    put = client.put(
        f"/api/workspaces/{workspace_id}/documents/map-session",
        headers=auth_headers(owner_token),
        json={"content": host_map_session},
    )
    assert put.status_code == 200, put.text

    join = client.post(
        f"/api/workspaces/share/{slug}/join",
        headers=auth_headers(joiner_token),
    )
    assert join.status_code == 200, join.text

    docs = client.get(
        f"/api/workspaces/{workspace_id}/documents",
        headers=auth_headers(joiner_token),
    )
    assert docs.status_code == 200, docs.text
    by_key = {item["key"]: item["content"] for item in docs.json()["documents"]}
    assert by_key.get("map-session") == host_map_session

    civ_session = {"civDraftUrl": "https://aoe2cm.net/draft/civ123", "started": True}
    assert (
        client.put(
            f"/api/workspaces/{workspace_id}/documents/civ-session",
            headers=auth_headers(owner_token),
            json={"content": civ_session},
        ).status_code
        == 200
    )

    assignments = {"draft-civ123": {"own": {"civ-1": "Arabia"}, "opponent": {}}}
    assert (
        client.put(
            f"/api/workspaces/{workspace_id}/documents/civ-map-assignments",
            headers=auth_headers(owner_token),
            json={"content": assignments},
        ).status_code
        == 200
    )

    shared_presets = {
        "version": 2,
        "activeTournamentId": "t1",
        "tournaments": [
            {
                "id": "t1",
                "name": "Shared",
                "format": "1v1",
                "presets": [],
                "customMaps": ["Arabia"],
                "createdAt": "2026-01-01T00:00:00.000Z",
            }
        ],
    }
    assert (
        client.put(
            f"/api/workspaces/{workspace_id}/documents/shared-preset-tournaments",
            headers=auth_headers(owner_token),
            json={"content": shared_presets},
        ).status_code
        == 200
    )

    all_docs = client.get(
        f"/api/workspaces/{workspace_id}/documents",
        headers=auth_headers(joiner_token),
    ).json()["documents"]
    keys = {d["key"] for d in all_docs}
    for expected in (
        "map-session",
        "civ-session",
        "civ-map-assignments",
        "shared-preset-tournaments",
    ):
        assert expected in keys, f"missing workspace doc: {expected}"

    members = client.get(
        f"/api/workspaces/{workspace_id}/members",
        headers=auth_headers(owner_token),
    )
    assert members.status_code == 200
    assert len(members.json()["members"]) >= 2

    user_docs = client.get("/api/user/documents", headers=auth_headers(owner_token))
    assert user_docs.status_code == 200

    print("verify_workspace_api: all checks passed")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"verify_workspace_api FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
