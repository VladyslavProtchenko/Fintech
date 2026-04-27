from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    redis_host: str = "localhost"
    redis_port: int = 6379
    queue_in: str = "ocr-paddle"
    queue_out: str = "ocr-results"
    ocr_device: str = "cpu"       # PaddlePaddle: cpu only on Mac
    llm_device: str = "auto"      # auto-detect: cuda > mps > cpu
    llm_model: str = "Qwen/Qwen2.5-0.5B-Instruct"

    class Config:
        env_file = ".env"


settings = Settings()
