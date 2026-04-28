import logging
import os
from .config import settings

# Must be set before surya imports so the library reads correct batch sizes
os.environ.setdefault("DETECTOR_BATCH_SIZE", str(settings.detector_batch_size))
os.environ.setdefault("RECOGNITION_BATCH_SIZE", str(settings.recognition_batch_size))

from PIL import Image  # noqa: E402
from surya.foundation import FoundationPredictor  # noqa: E402
from surya.recognition import RecognitionPredictor  # noqa: E402
from surya.detection import DetectionPredictor  # noqa: E402

logger = logging.getLogger(__name__)


class OcrEngine:
    def __init__(self) -> None:
        logger.info("Loading Surya OCR models (v0.17)...")
        self._foundation = FoundationPredictor()
        self._recognition = RecognitionPredictor(self._foundation)
        self._detection = DetectionPredictor()
        logger.info("Surya OCR models loaded")

    def extract_text(self, image_path: str) -> str:
        """Run Surya OCR on image, return all text lines joined."""
        image = Image.open(image_path).convert("RGB")

        # Use high-res original for better recognition accuracy
        highres = image.copy()
        lowres = image.copy()
        lowres.thumbnail((1536, 1536))

        predictions = self._recognition(
            [lowres],
            det_predictor=self._detection,
            highres_images=[highres],
            sort_lines=True,
        )

        lines: list[str] = []
        for result in predictions:
            for line in result.text_lines:
                text = line.text.strip()
                if text:
                    lines.append(text)
        return "\n".join(lines)
