"""FastAPI application factory. Run with: uvicorn dadip.main:app"""

import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from dadip import __version__
from dadip.api.routers import alerts, auth, incidents, messages, misc, reports
from dadip.core.config import get_settings
from dadip.core.logging import configure_logging

log = logging.getLogger("dadip.http")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    app = FastAPI(
        title="DADIP 2.0 API",
        version=__version__,
        description="Distributed AI-Driven Disaster Intelligence and Resilient Communication Platform.",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def request_log(request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            log.exception("unhandled error", extra={"request_id": rid, "path": request.url.path})
            response = JSONResponse({"detail": "Internal server error", "request_id": rid}, status_code=500)
        response.headers["x-request-id"] = rid
        log.info("request", extra={"request_id": rid, "method": request.method, "path": request.url.path,
                                   "status": response.status_code,
                                   "ms": round((time.perf_counter() - start) * 1000, 1)})
        return response

    for r in (misc.router, auth.router, incidents.router, reports.router, alerts.router, messages.router):
        app.include_router(r, prefix="/api/v1")
    return app


app = create_app()
