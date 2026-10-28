from logging.config import fileConfig

from sqlalchemy import create_engine

from alembic import context
from archnemesis.settings import get_settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None


def run_migrations_online() -> None:
    """Run migrations in 'online' mode using a synchronous engine."""
    # Convert async sqlite URL to synchronous sqlite for reliable, instant migration execution
    sync_url = get_settings().database_url.replace("+aiosqlite", "")
    connectable = create_engine(sync_url)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    pass
else:
    run_migrations_online()
