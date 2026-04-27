import asyncio
import logging
from bullmq import Worker, Queue
from .config import settings
from .ocr import OcrEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

redis_url = f"redis://{settings.redis_host}:{settings.redis_port}"


async def main() -> None:
    logger.info("Loading Surya OCR models...")
    ocr_engine = OcrEngine()

    result_queue = Queue(settings.queue_out, {"connection": redis_url})

    async def process_job(job, job_token: str) -> None:  # type: ignore[type-arg]
        photo_id: str = job.data["photoId"]
        image_path: str = job.data["imagePath"]

        logger.info("Processing job %s — photoId=%s", job.id, photo_id)

        try:
            raw_text = ocr_engine.extract_text(image_path)
        except Exception as e:
            logger.exception("OCR failed for %s: %s", photo_id, e)
            raise

        logger.info("OCR done for %s — %d chars extracted", photo_id, len(raw_text))

        await result_queue.add(
            "ocr-result",
            {
                "photoId": photo_id,
                "source": "surya",
                "raw_text": raw_text,
                "data": {},
            },
        )
        logger.info("Result published for %s", photo_id)

    logger.info(
        "Starting Surya OCR worker — queue=%s redis=%s:%d",
        settings.queue_in,
        settings.redis_host,
        settings.redis_port,
    )

    worker = Worker(settings.queue_in, process_job, {
        "connection": redis_url,
        "lockDuration": 300000,
    })

    logger.info("Worker ready, waiting for jobs...")
    try:
        await asyncio.Future()
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        logger.info("Shutting down worker...")
        await worker.close()
        await result_queue.close()
        logger.info("Worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
