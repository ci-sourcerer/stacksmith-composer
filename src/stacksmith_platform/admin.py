import argparse

from .database import Database
from .settings import Settings


def main() -> None:
    """Initialize the version-one PostgreSQL schema before API/worker startup.

    Returns:
        None.

    Raises:
        ValueError: No PostgreSQL database is configured.
    """
    settings = Settings()
    if not settings.database_url.startswith("postgresql+psycopg://"):
        raise ValueError("Schema initialization requires PostgreSQL")
    parser = argparse.ArgumentParser(
        description="Initialize Stacksmith Platform storage"
    )
    parser.add_argument("--grant-roles", action="store_true")
    args = parser.parse_args()
    database = Database(settings.database_url, settings.secret_key)
    database.initialize()
    if args.grant_roles:
        with database.transaction() as connection:
            connection.exec_driver_sql(
                "GRANT USAGE ON SCHEMA public TO platform_api, platform_worker"
            )
            connection.exec_driver_sql(
                "GRANT SELECT, INSERT, UPDATE, DELETE ON sessions, repositories, environments, role_assignments, secrets, tokens, runs, deployment_locks, webhooks, phase_claims, configuration TO platform_api"
            )
            connection.exec_driver_sql(
                "GRANT SELECT ON artifacts, workers, scheduler_health TO platform_api"
            )
            connection.exec_driver_sql(
                "GRANT SELECT ON repositories, environments, role_assignments, secrets, phase_claims, configuration TO platform_worker"
            )
            connection.exec_driver_sql(
                "GRANT SELECT, INSERT, UPDATE, DELETE ON runs, deployment_locks, workers, artifacts, scheduler_health TO platform_worker"
            )
            connection.exec_driver_sql(
                "GRANT INSERT ON audits TO platform_api, platform_worker"
            )
            connection.exec_driver_sql("GRANT SELECT ON audits TO platform_api")
