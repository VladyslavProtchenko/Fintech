import logging
from paddleocr import PaddleOCRVL
from .config import settings

logger = logging.getLogger(__name__)


class OcrEngine:
    def __init__(self) -> None:
        logger.info("Loading PaddleOCR-VL model (device=%s)...", settings.ocr_device)
        self._pipeline = PaddleOCRVL(device=settings.ocr_device)
        logger.info("PaddleOCR-VL loaded")

    def extract_text(self, image_path: str) -> str:
        """Run OCR on image, return full text output."""
        results = self._pipeline.predict(image_path)
        blocks: list[str] = []
        for result in results:
            for item in result.get("parsing_res_list", []):
                content = getattr(item, "content", "") or ""
                content = content.strip()
                if content:
                    blocks.append(content)
            # If no blocks found, try str representation
            if not blocks:
                text = str(result)
                if text:
                    blocks.append(text)
        return "\n".join(blocks)


ocr_engine = OcrEngine()
