from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from ..replay_parser import get_replay_parser_info, parse_replay_bytes

router = APIRouter(prefix="/api/replay", tags=["replay"])

MAX_FILES_PER_SET = 9


def _invalid_upload_result(filename: str, error: str) -> dict:
    return {
        "fileName": filename,
        "error": error,
        "map": "",
        "playersPerSide": 0,
        "teams": [],
        "bytesReceived": 0,
        "expectedBytes": None,
    }


@router.get("/health")
async def replay_health() -> dict:
    return {"status": "ok", "parser": get_replay_parser_info()}


@router.post("/parse-set")
async def parse_replay_set(
    files: list[UploadFile] = File(...),
    players_per_side: int | None = Query(
        default=None,
        ge=1,
        le=4,
        description="Expected players per side (1–4), from tournament format",
    ),
) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="No replay files uploaded")
    if len(files) > MAX_FILES_PER_SET:
        raise HTTPException(status_code=400, detail=f"At most {MAX_FILES_PER_SET} replays per set")

    games: list[dict] = []
    for upload in files:
        filename = upload.filename or "replay.aoe2record"
        expected_bytes = upload.size if upload.size and upload.size > 0 else None
        content = await upload.read()
        if not content:
            games.append(
                _invalid_upload_result(
                    filename,
                    "Upload arrived empty — redeploy the API container and retry the upload",
                ),
            )
            continue
        games.append(
            parse_replay_bytes(
                content,
                filename,
                expected_per_side=players_per_side,
                expected_bytes=expected_bytes,
            ),
        )

    return {"games": games, "parser": get_replay_parser_info()}
