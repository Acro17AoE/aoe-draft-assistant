import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth_utils import new_id
from ..database import get_db
from ..deps import get_current_user
from ..models import User, UserDocument

router = APIRouter(prefix="/api/user/documents", tags=["user-documents"])

ALLOWED_DOC_KEYS = {
    "preset-tournaments",
    "results",
    "civ-draft-settings",
    "ui-preferences",
    "map-session",
    "civ-session",
    "civ-map-assignments",
}


class DocumentPayload(BaseModel):
    content: dict | list | str | int | float | bool | None = Field(default_factory=dict)


class DocumentResponse(BaseModel):
    key: str
    content: dict | list | str | int | float | bool | None
    updated_at: str


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]


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


def _to_response(doc: UserDocument) -> DocumentResponse:
    return DocumentResponse(
        key=doc.doc_key,
        content=_parse_content(doc.content),
        updated_at=doc.updated_at.isoformat(),
    )


@router.get("", response_model=DocumentListResponse)
def list_documents(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DocumentListResponse:
    docs = db.query(UserDocument).filter(UserDocument.user_id == user.id).all()
    return DocumentListResponse(documents=[_to_response(doc) for doc in docs])


@router.get("/{key}", response_model=DocumentResponse)
def get_document(
    key: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    key = _validate_key(key)
    doc = (
        db.query(UserDocument)
        .filter(UserDocument.user_id == user.id, UserDocument.doc_key == key)
        .first()
    )
    if doc is None:
        return DocumentResponse(key=key, content=None, updated_at=datetime.min.isoformat())
    return _to_response(doc)


@router.put("/{key}", response_model=DocumentResponse)
def put_document(
    key: str,
    body: DocumentPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    key = _validate_key(key)
    doc = (
        db.query(UserDocument)
        .filter(UserDocument.user_id == user.id, UserDocument.doc_key == key)
        .first()
    )
    serialized = _serialize_content(body.content)
    if doc is None:
        doc = UserDocument(id=new_id(), user_id=user.id, doc_key=key, content=serialized)
        db.add(doc)
    else:
        doc.content = serialized
    db.commit()
    db.refresh(doc)
    return _to_response(doc)
