"""Password hashing (argon2id) and JWT access tokens."""

from datetime import UTC, datetime, timedelta
from enum import StrEnum

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from dadip.core.config import get_settings

_hasher = PasswordHasher()


class Role(StrEnum):
    citizen = "citizen"
    operator = "operator"
    approver = "approver"
    admin = "admin"


# Higher rank includes the permissions of lower ranks.
ROLE_RANK = {Role.citizen: 0, Role.operator: 1, Role.approver: 2, Role.admin: 3}


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_access_token(subject: str, role: Role) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    claims = {"sub": subject, "role": role.value, "iat": now, "exp": now + timedelta(minutes=s.access_token_minutes)}
    return jwt.encode(claims, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    s = get_settings()
    return jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
