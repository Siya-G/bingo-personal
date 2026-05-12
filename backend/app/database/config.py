from app.config import settings


class DatabaseSettings:
    """Database settings facade for the persistence layer."""

    database_url: str = settings.database_url


database_settings = DatabaseSettings()
