import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth_utils import new_id
from ..database import get_db
from ..deps import get_current_user, get_workspace_by_slug, get_workspace_member
from ..models import User, Workspace, WorkspaceDocument, WorkspaceMember, utcnow
from ..workspace_stream import broadcast_document_update

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])

ALLOWED_DOC_KEYS = {
    "shared-preset-tournaments",
    "map-session",
    "civ-session",
    "civ-map-assignments",
}


class WorkspaceCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class WorkspaceSummary(BaseModel):
    id: str
    name: str
    share_slug: str
    role: str
    owner_id: str
    updated_at: str


class WorkspaceListResponse(BaseModel):
    workspaces: list[WorkspaceSummary]


class WorkspaceDetailResponse(BaseModel):
    id: str
    name: str
    share_slug: str
    owner_id: str
    role: str
    updated_at: str


class DocumentPayload(BaseModel):
    content: dict | list | str | int | float | bool | None = Field(default_factory=dict)


class DocumentResponse(BaseModel):
    key: str
    content: dict | list | str | int | float | bool | None
    updated_at: str


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]


class WorkspaceMemberInfo(BaseModel):
    user_id: str
    display_name: str
    email: str
    role: str


class WorkspaceMembersResponse(BaseModel):
    members: list[WorkspaceMemberInfo]


def _validate_key(key: str) -> str:
    if key not in ALLOWED_DOC_KEYS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid document key")
    return key


def _serialize_content(content: object) -> str:
    return json.dumps(content, separators=(",", ":"), ensure_ascii=False)


def _parse_content(raw: str) -> object:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _merge_civ_map_assignments(current: object, incoming: object) -> object:
    if not isinstance(current, dict) or not isinstance(incoming, dict):
        return incoming

    merged: dict[str, Any] = {**current}
    for draft_key, incoming_entry in incoming.items():
        if not isinstance(incoming_entry, dict):
            merged[draft_key] = incoming_entry
            continue

        current_entry = merged.get(draft_key)
        if not isinstance(current_entry, dict):
            current_entry = {}

        next_entry: dict[str, Any] = {**current_entry}
        for side_key in ("own", "opponent"):
            incoming_side = incoming_entry.get(side_key)
            if incoming_side is None:
                continue
            if isinstance(incoming_side, dict):
                current_side = current_entry.get(side_key)
                if not isinstance(current_side, dict):
                    current_side = {}
                next_entry[side_key] = {**current_side, **incoming_side}
            else:
                next_entry[side_key] = incoming_side

        for key, value in incoming_entry.items():
            if key in ("own", "opponent"):
                continue
            next_entry[key] = value

        merged[draft_key] = next_entry

    return merged


def _merge_workspace_doc_content(key: str, current_raw: str, incoming: object) -> object:
    if key != "civ-map-assignments":
        return incoming
    current = _parse_content(current_raw)
    return _merge_civ_map_assignments(current, incoming)


def _member_role(workspace: Workspace, user: User, db: Session) -> str | None:
    if workspace.owner_id == user.id:
        return "owner"
    member = (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace.id, WorkspaceMember.user_id == user.id)
        .first()
    )
    return member.role if member else None


def _workspace_summary(workspace: Workspace, role: str) -> WorkspaceSummary:
    return WorkspaceSummary(
        id=workspace.id,
        name=workspace.name,
        share_slug=workspace.share_slug,
        role=role,
        owner_id=workspace.owner_id,
        updated_at=workspace.updated_at.isoformat(),
    )


@router.get("", response_model=WorkspaceListResponse)
def list_workspaces(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> WorkspaceListResponse:
    owned = db.query(Workspace).filter(Workspace.owner_id == user.id).all()
    memberships = db.query(WorkspaceMember).filter(WorkspaceMember.user_id == user.id).all()
    member_workspace_ids = {member.workspace_id for member in memberships}
    member_workspaces = (
        db.query(Workspace).filter(Workspace.id.in_(member_workspace_ids)).all() if member_workspace_ids else []
    )

    seen: set[str] = set()
    summaries: list[WorkspaceSummary] = []
    for workspace in owned:
        seen.add(workspace.id)
        summaries.append(_workspace_summary(workspace, "owner"))
    for workspace in member_workspaces:
        if workspace.id in seen:
            continue
        role = _member_role(workspace, user, db) or "editor"
        summaries.append(_workspace_summary(workspace, role))
    return WorkspaceListResponse(workspaces=summaries)


@router.post("", response_model=WorkspaceDetailResponse)
def create_workspace(
    body: WorkspaceCreateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkspaceDetailResponse:
    workspace = Workspace(id=new_id(), owner_id=user.id, name=body.name.strip())
    db.add(workspace)
    db.add(
        WorkspaceMember(
            id=new_id(),
            workspace_id=workspace.id,
            user_id=user.id,
            role="owner",
        ),
    )
    db.commit()
    db.refresh(workspace)
    return WorkspaceDetailResponse(
        id=workspace.id,
        name=workspace.name,
        share_slug=workspace.share_slug,
        owner_id=workspace.owner_id,
        role="owner",
        updated_at=workspace.updated_at.isoformat(),
    )


@router.get("/share/{slug}", response_model=WorkspaceDetailResponse)
def preview_share(
    workspace: Workspace = Depends(get_workspace_by_slug),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkspaceDetailResponse:
    role = _member_role(workspace, user, db)
    if role is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this workspace")
    return WorkspaceDetailResponse(
        id=workspace.id,
        name=workspace.name,
        share_slug=workspace.share_slug,
        owner_id=workspace.owner_id,
        role=role,
        updated_at=workspace.updated_at.isoformat(),
    )


@router.get("/{workspace_id}/members", response_model=WorkspaceMembersResponse)
def list_workspace_members(
    workspace_id: str,
    _member: WorkspaceMember = Depends(get_workspace_member),
    db: Session = Depends(get_db),
) -> WorkspaceMembersResponse:
    workspace = db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    members: list[WorkspaceMemberInfo] = []
    owner = db.get(User, workspace.owner_id)
    if owner:
        members.append(
            WorkspaceMemberInfo(
                user_id=owner.id,
                display_name=owner.display_name,
                email=owner.email,
                role="owner",
            ),
        )

    for membership in db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id).all():
        if membership.user_id == workspace.owner_id:
            continue
        user = db.get(User, membership.user_id)
        if user is None:
            continue
        members.append(
            WorkspaceMemberInfo(
                user_id=user.id,
                display_name=user.display_name,
                email=user.email,
                role=membership.role,
            ),
        )

    members.sort(key=lambda item: (0 if item.role == "owner" else 1, item.display_name.lower()))
    return WorkspaceMembersResponse(members=members)


@router.post("/{workspace_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_workspace(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    workspace = db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    if workspace.owner_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session owner cannot leave — end the session instead",
        )

    member = (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user.id)
        .first()
    )
    if member:
        db.delete(member)
        db.commit()


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    workspace = db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    if workspace.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the session owner can end it")
    db.delete(workspace)
    db.commit()


@router.post("/share/{slug}/join", response_model=WorkspaceDetailResponse)
def join_share(
    workspace: Workspace = Depends(get_workspace_by_slug),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkspaceDetailResponse:
    role = _member_role(workspace, user, db)
    if role is None:
        db.add(
            WorkspaceMember(
                id=new_id(),
                workspace_id=workspace.id,
                user_id=user.id,
                role="editor",
            ),
        )
        db.commit()
        role = "editor"
    return WorkspaceDetailResponse(
        id=workspace.id,
        name=workspace.name,
        share_slug=workspace.share_slug,
        owner_id=workspace.owner_id,
        role=role,
        updated_at=workspace.updated_at.isoformat(),
    )


@router.get("/{workspace_id}/documents", response_model=DocumentListResponse)
def list_workspace_documents(
    workspace_id: str,
    _member: WorkspaceMember = Depends(get_workspace_member),
    db: Session = Depends(get_db),
) -> DocumentListResponse:
    docs = db.query(WorkspaceDocument).filter(WorkspaceDocument.workspace_id == workspace_id).all()
    return DocumentListResponse(
        documents=[
            DocumentResponse(
                key=doc.doc_key,
                content=_parse_content(doc.content),
                updated_at=doc.updated_at.isoformat(),
            )
            for doc in docs
        ],
    )


@router.get("/{workspace_id}/documents/{key}", response_model=DocumentResponse)
def get_workspace_document(
    workspace_id: str,
    key: str,
    _member: WorkspaceMember = Depends(get_workspace_member),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    key = _validate_key(key)
    doc = (
        db.query(WorkspaceDocument)
        .filter(WorkspaceDocument.workspace_id == workspace_id, WorkspaceDocument.doc_key == key)
        .first()
    )
    if doc is None:
        return DocumentResponse(key=key, content=None, updated_at=datetime.min.isoformat())
    return DocumentResponse(
        key=doc.doc_key,
        content=_parse_content(doc.content),
        updated_at=doc.updated_at.isoformat(),
    )


@router.put("/{workspace_id}/documents/{key}", response_model=DocumentResponse)
def put_workspace_document(
    workspace_id: str,
    key: str,
    body: DocumentPayload,
    member: WorkspaceMember = Depends(get_workspace_member),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    if member.role == "viewer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Read-only workspace access")
    key = _validate_key(key)
    doc = (
        db.query(WorkspaceDocument)
        .filter(WorkspaceDocument.workspace_id == workspace_id, WorkspaceDocument.doc_key == key)
        .first()
    )
    content: object = body.content
    if doc is not None:
        content = _merge_workspace_doc_content(key, doc.content, body.content)
    serialized = _serialize_content(content)
    if doc is None:
        doc = WorkspaceDocument(
            id=new_id(),
            workspace_id=workspace_id,
            doc_key=key,
            content=serialized,
            updated_by_user_id=user.id,
        )
        db.add(doc)
    else:
        doc.content = serialized
        doc.updated_by_user_id = user.id
    workspace = db.get(Workspace, workspace_id)
    if workspace:
        workspace.updated_at = utcnow()
    db.commit()
    db.refresh(doc)
    parsed = _parse_content(doc.content)
    updated_at = doc.updated_at.isoformat()
    broadcast_document_update(workspace_id, doc.doc_key, parsed, updated_at, user.id)
    return DocumentResponse(
        key=doc.doc_key,
        content=parsed,
        updated_at=updated_at,
    )
