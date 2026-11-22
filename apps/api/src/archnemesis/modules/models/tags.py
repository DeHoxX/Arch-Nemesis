"""Closed pipeline tag definitions and deterministic keyword fallback (Stage 6A, D-401, D-403)."""

import re
from enum import StrEnum


class PipelineTag(StrEnum):
    """Closed set of Hugging Face pipeline tags supported by ModelFit catalogue."""

    TEXT_GENERATION = "text-generation"
    TEXT_TO_SPEECH = "text-to-speech"
    AUTOMATIC_SPEECH_RECOGNITION = "automatic-speech-recognition"
    TEXT_TO_IMAGE = "text-to-image"
    IMAGE_TO_TEXT = "image-to-text"
    FEATURE_EXTRACTION = "feature-extraction"
    SENTENCE_SIMILARITY = "sentence-similarity"
    TRANSLATION = "translation"
    SUMMARIZATION = "summarization"
    QUESTION_ANSWERING = "question-answering"


CLOSED_PIPELINE_TAGS: frozenset[str] = frozenset(tag.value for tag in PipelineTag)

# Precompiled regular expressions using word boundaries (\b) to avoid matching inside unrelated words
# (e.g. "voice" matching inside "invoice", "tts" matching inside "attributes", "qa" inside "squad")
_FEATURE_EXTRACTION_RE = re.compile(
    r"\b(?:embed(?:s|ded|ding|dings)?|vector(?:s)?|retriev(?:e|al|ed|ing|er)?|semantic)\b",
    re.IGNORECASE,
)
_SPEECH_RECOGNITION_RE = re.compile(
    r"\b(?:speech\s+to\s+text|transcrib(?:e|ed|ing|tion)?|audio|listen(?:ing)?|asr)\b",
    re.IGNORECASE,
)
_IMAGE_TO_TEXT_RE = re.compile(
    r"\b(?:ocr|vision|image\s+recognition|caption(?:s|ing|ed)?)\b",
    re.IGNORECASE,
)
_TEXT_TO_IMAGE_RE = re.compile(
    r"\b(?:generate\s+image|diffusion|text\s+to\s+image)\b",
    re.IGNORECASE,
)
_TEXT_TO_SPEECH_RE = re.compile(
    r"\b(?:text\s+to\s+speech|voice|speak(?:ing|er|s)?|tts)\b",
    re.IGNORECASE,
)
_SUMMARIZATION_RE = re.compile(
    r"\b(?:summariz(?:e|ed|ing|ation|er)?)\b",
    re.IGNORECASE,
)
_TRANSLATION_RE = re.compile(
    r"\b(?:translat(?:e|ed|ing|ion|or)?)\b",
    re.IGNORECASE,
)
_QUESTION_ANSWERING_RE = re.compile(
    r"\b(?:answer(?:s|ing|ed)?|faq|qa)\b",
    re.IGNORECASE,
)


def fallback_pipeline_tag(role: str, ai_role: str | None = None) -> PipelineTag:
    """Deterministically map node role and ai_role to a closed catalogue pipeline tag.

    Used when LLM selection is unavailable or fails schema validation.
    Word boundaries ensure keywords inside longer words do not trigger false positive matches.
    """
    if ai_role == "agent":
        return PipelineTag.TEXT_GENERATION

    # 1. Feature extraction (embeddings, vector search, semantic indexing)
    if _FEATURE_EXTRACTION_RE.search(role):
        return PipelineTag.FEATURE_EXTRACTION

    # 2. Image-to-text (OCR, vision inspection, image captioning)
    if _IMAGE_TO_TEXT_RE.search(role):
        return PipelineTag.IMAGE_TO_TEXT

    # 3. Automatic speech recognition (speech-to-text, audio transcription)
    if _SPEECH_RECOGNITION_RE.search(role):
        return PipelineTag.AUTOMATIC_SPEECH_RECOGNITION

    # 4. Text-to-speech (audio generation, voice synthesis)
    if _TEXT_TO_SPEECH_RE.search(role):
        return PipelineTag.TEXT_TO_SPEECH

    # 5. Text-to-image (image generation, diffusion models)
    if _TEXT_TO_IMAGE_RE.search(role):
        return PipelineTag.TEXT_TO_IMAGE

    # 6. Summarization
    if _SUMMARIZATION_RE.search(role):
        return PipelineTag.SUMMARIZATION

    # 7. Translation
    if _TRANSLATION_RE.search(role):
        return PipelineTag.TRANSLATION

    # 8. Question answering
    if _QUESTION_ANSWERING_RE.search(role):
        return PipelineTag.QUESTION_ANSWERING

    # Default fallback
    return PipelineTag.TEXT_GENERATION
