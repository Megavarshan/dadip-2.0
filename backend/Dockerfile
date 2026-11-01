FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY pyproject.toml ./
COPY dadip ./dadip
RUN pip install --no-cache-dir .

COPY alembic.ini ./
COPY migrations ./migrations

RUN useradd --create-home --uid 10001 dadip
USER dadip

EXPOSE 8000
# Migrations run explicitly (compose `migrate` service / deploy step), never implicitly on API start.
CMD ["uvicorn", "dadip.main:app", "--host", "0.0.0.0", "--port", "8000"]
