from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    redis_host: str = "localhost"
    redis_port: int = 6379
    queue_in: str = "ocr-surya"
    queue_out: str = "ocr-results"
    detector_batch_size: int = 2
    recognition_batch_size: int = 8


settings = Settings()
