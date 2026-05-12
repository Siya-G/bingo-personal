from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.database.config import database_settings


DATABASE_URL = database_settings.database_url

# SQLite needs this flag for local threaded FastAPI development. PostgreSQL
# URLs can reuse the same connection structure without SQLite-specific args.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


class Base(DeclarativeBase):
    """Base class for future SQLAlchemy ORM models."""


def get_db() -> Generator[Session, None, None]:
    """Provide a database session dependency for routes and services."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_database_tables() -> None:
    """Create tables automatically for local development.

    Importing models here registers them with SQLAlchemy metadata before
    create_all runs. Production deployments should use migrations instead.
    """
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    from app.database.sqlite_migrations import apply_sqlite_runtime_migrations

    apply_sqlite_runtime_migrations(engine)
