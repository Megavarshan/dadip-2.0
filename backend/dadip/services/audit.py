import uuid
from typing import Any

from sqlalchemy.orm import Session

from dadip.db.models import AuditEvent


def record(
    db: Session,
    action: str,
    actor_id: uuid.UUID | None = None,
    resource_type: str | None = None,
    resource_id: Any = None,
    details: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """Add an audit row to the caller's transaction, so the audit entry commits or rolls back with the
    change it describes."""
    db.add(
        AuditEvent(
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            details=details,
            ip_address=ip_address,
        )
    )
