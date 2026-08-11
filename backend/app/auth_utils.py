import os
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

AUTH_SECRET = os.getenv("AUTH_SECRET", "change-me-in-production")
AUTH_ALGORITHM = "HS256"
AUTH_TOKEN_HOURS = int(os.getenv("AUTH_TOKEN_HOURS", "168"))


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=AUTH_TOKEN_HOURS)
    payload = {"sub": user_id, "email": email, "exp": expire}
    return jwt.encode(payload, AUTH_SECRET, algorithm=AUTH_ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, AUTH_SECRET, algorithms=[AUTH_ALGORITHM])


def new_id() -> str:
    return str(uuid.uuid4())
