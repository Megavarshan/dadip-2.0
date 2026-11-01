import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from dadip.api.deps import Admin, CurrentUser, DbSession, client_ip
from dadip.api.schemas import LoginIn, RegisterIn, RoleUpdateIn, TokenOut, UserOut
from dadip.core.security import Role, create_access_token, hash_password, verify_password
from dadip.db.models import User
from dadip.services import audit

router = APIRouter(prefix="/auth", tags=["auth"])

# Verifying against a fixed hash when the user does not exist keeps response time similar for unknown emails.
_DUMMY_HASH = hash_password("timing-equaliser-not-a-password")


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: DbSession, request: Request) -> TokenOut:
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok or not user.is_active:
        audit.record(db, "LOGIN_FAILED", details={"email": body.email.lower()}, ip_address=client_ip(request))
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    audit.record(db, "LOGIN", actor_id=user.id, ip_address=client_ip(request))
    db.commit()
    return TokenOut(access_token=create_access_token(str(user.id), Role(user.role)), user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, db: DbSession) -> TokenOut:
    """Self-registration always creates a citizen. Elevated roles are granted by an admin."""
    if db.scalar(select(User.id).where(func.lower(User.email) == body.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=body.email.lower(), name=body.name, password_hash=hash_password(body.password),
                role=Role.citizen.value, language=body.language)
    db.add(user)
    db.flush()
    audit.record(db, "REGISTER", actor_id=user.id, resource_type="user", resource_id=user.id)
    db.commit()
    return TokenOut(access_token=create_access_token(str(user.id), Role.citizen), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.patch("/users/{user_id}/role", response_model=UserOut)
def set_role(user_id: uuid.UUID, body: RoleUpdateIn, db: DbSession, admin: Admin) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    old = user.role
    user.role = body.role
    audit.record(db, "SET_ROLE", actor_id=admin.id, resource_type="user", resource_id=user.id,
                 details={"from": old, "to": body.role})
    db.commit()
    return user
