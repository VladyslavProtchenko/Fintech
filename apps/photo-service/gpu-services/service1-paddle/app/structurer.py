import json
import logging
from pathlib import Path
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from .config import settings
from .schema import ReceiptData

logger = logging.getLogger(__name__)

PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "receipt.txt"
SYSTEM_PROMPT = PROMPT_PATH.read_text(encoding="utf-8")


def _resolve_device() -> str:
    if settings.llm_device != "auto":
        return settings.llm_device
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class Structurer:
    def __init__(self) -> None:
        device = _resolve_device()
        logger.info("Loading %s on %s...", settings.llm_model, device)
        self._tokenizer = AutoTokenizer.from_pretrained(settings.llm_model)
        self._model = AutoModelForCausalLM.from_pretrained(
            settings.llm_model,
            dtype=torch.float16 if device != "cpu" else torch.float32,
            device_map=device,
        )
        self._device = device
        logger.info("Structurer loaded on %s", device)

    def structure_receipt(self, raw_text: str) -> ReceiptData:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": raw_text},
        ]
        text = self._tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = self._tokenizer([text], return_tensors="pt").to(self._device)

        with torch.no_grad():
            output_ids = self._model.generate(
                **inputs,
                max_new_tokens=1024,
                do_sample=False,
                pad_token_id=self._tokenizer.eos_token_id,
            )

        # Strip input tokens from output
        generated = output_ids[0][inputs["input_ids"].shape[1]:]
        response = self._tokenizer.decode(generated, skip_special_tokens=True).strip()

        try:
            # Strip markdown code block if present
            if "```" in response:
                response = response.split("```")[1]
                if response.startswith("json"):
                    response = response[4:]
                response = response.strip()
            data = json.loads(response)
            return ReceiptData(**data)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning("Failed to parse LLM response: %s — raw: %.200s", e, response)
            return ReceiptData()


structurer = Structurer()
