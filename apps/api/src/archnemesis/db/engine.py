"""Asynchronous database engine and session factory."""

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from archnemesis.settings import get_settings


def create_engine_and_session(
    database_url: str | None = None,
) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    """Create async SQLAlchemy engine and session factory with SQLite foreign keys enabled."""
    url = database_url or get_settings().database_url
    engine = create_async_engine(url, echo=False)

    # Enable SQLite foreign key constraints
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection: Any, connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    return engine, session_factory


# Module-level instances
engine, async_session_factory = create_engine_and_session()


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that yields an async database session."""
    async with async_session_factory() as session:
        yield session
