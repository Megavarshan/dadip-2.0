"""Request dependencies: database session, current user, role gates, rate limiting."""

import logging
import time
import uuid
from collections import defaultdict
from collections.abc import Callable
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from dadip.core.config import get_settings
from dadip.core.security import ROLE_RANK, Role, decode_access_token
from dadip.db.models import User
from dadip.db.session import get_db

log = logging.getLogger(__name__)
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user_optional(db: DbSession, token: Annotated[str | None, Depends(oauth2)]) -> User | None:
    if not token:
        return None
    try:
        claims = decode_access_token(token)
        user = db.get(User, uuid.UUID(claims["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from None
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    return user


def get_current_user(user: Annotated[User | None, Depends(get_current_user_optional)]) -> User:
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required",
                            headers={"WWW-Authenticate": "Bearer"})
    return user


def require_role(minimum: Role) -> Callable[[User], User]:
    def check(user: Annotated[User, Depends(get_current_user)]) -> User:
        if ROLE_RANK[Role(user.role)] < ROLE_RANK[minimum]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires role '{minimum.value}' or higher")
        return user

    return check


CurrentUser = Annotated[User, Depends(get_current_user)]
Operator = Annotated[User, Depends(require_role(Role.operator))]
Approver = Annotated[User, Depends(require_role(Role.approver))]
Admin = Annotated[User, Depends(require_role(Role.admin))]


class RateLimiter:
    """Fixed-window limiter. Uses Redis when reachable so limits hold across API replicas; falls back to
    process memory (and logs it) so a Redis outage never blocks emergency reporting entirely."""

    def __init__(self, redis_url: str | None):
        self._redis = None
        self._memory: dict[str, tuple[int, float]] = defaultdict(lambda: (0, 0.0))
        if redis_url:
            try:
                import redis

                self._redis = redis.Redis.from_url(redis_url, socket_timeout=0.2, socket_connect_timeout=0.2)
            except Exception:  # pragma: no cover - import or URL errors
                log.warning("rate limiter: redis unavailable, using memory")

    def hit(self, key: str, limit: int, window_s: int = 60) -> bool:
        bucket = f"rl:{key}:{int(time.time() // window_s)}"
        if self._redis is not None:
            try:
                pipe = self._redis.pipeline()
                pipe.incr(bucket)
                pipe.expire(bucket, window_s)
                count = pipe.execute()[0]
                return count <= limit
            except Exception:
                log.warning("rate limiter: redis error, using memory", extra={"key": key})
        count, _ = self._memory[bucket]
        self._memory[bucket] = (count + 1, time.time())
        return count + 1 <= limit


_limiter: RateLimiter | None = None


def get_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter(get_settings().redis_url)
    return _limiter


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def public_report_limit(request: Request, limiter: Annotated[RateLimiter, Depends(get_limiter)]) -> None:
    if not limiter.hit(f"report:{client_ip(request)}", get_settings().public_report_rate_per_minute):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many reports from this address; try again shortly")
