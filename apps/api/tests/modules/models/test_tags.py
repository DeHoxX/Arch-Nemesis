"""Tests for closed pipeline tags and keyword fallback (Stage 6A, D-401, D-403)."""

from archnemesis.modules.models.tags import (
    CLOSED_PIPELINE_TAGS,
    PipelineTag,
    fallback_pipeline_tag,
)


def test_closed_pipeline_tags_matches_modelfit_catalogue() -> None:
    expected_tags = {
        "text-generation",
        "text-to-speech",
        "automatic-speech-recognition",
        "text-to-image",
        "image-to-text",
        "feature-extraction",
        "sentence-similarity",
        "translation",
        "summarization",
        "question-answering",
    }
    assert CLOSED_PIPELINE_TAGS == expected_tags
    assert len(PipelineTag) == 10


def test_fallback_pipeline_tag_ai_role_agent() -> None:
    assert (
        fallback_pipeline_tag(role="Custom voice bot", ai_role="agent")
        == PipelineTag.TEXT_GENERATION
    )


def test_fallback_pipeline_tag_word_boundary_isolation_class() -> None:
    """Keywords inside longer words must not trigger false positive matches."""
    # 1. "voice" inside "invoice" should not trigger text-to-speech
    assert fallback_pipeline_tag("Process monthly invoice tables") == PipelineTag.TEXT_GENERATION

    # 2. "tts" inside "attributes" should not trigger text-to-speech
    assert (
        fallback_pipeline_tag("Filter customer records by profile attributes")
        == PipelineTag.TEXT_GENERATION
    )

    # 3. "qa" inside "squad" or "equal" should not trigger question-answering
    assert (
        fallback_pipeline_tag("Assign security squad to monitor equal access")
        == PipelineTag.TEXT_GENERATION
    )

    # 4. "embed" inside "disembedded" should match word stem, but "ember" should not
    assert fallback_pipeline_tag("Track fire ember alerts") == PipelineTag.TEXT_GENERATION

    # 5. "audio" inside "auditorium" should not trigger automatic-speech-recognition
    assert fallback_pipeline_tag("Manage auditorium event ticketing") == PipelineTag.TEXT_GENERATION


def test_fallback_pipeline_tag_positive_and_negative_for_each_tag() -> None:
    """Each tag has at least one positive and one negative case."""
    # 1. FEATURE_EXTRACTION
    assert (
        fallback_pipeline_tag("Embed document chunks into vector database")
        == PipelineTag.FEATURE_EXTRACTION
    )
    assert (
        fallback_pipeline_tag("Store documents in relational database")
        != PipelineTag.FEATURE_EXTRACTION
    )

    # 2. IMAGE_TO_TEXT
    assert (
        fallback_pipeline_tag("OCR invoice scanner and vision model") == PipelineTag.IMAGE_TO_TEXT
    )
    assert fallback_pipeline_tag("Log raw invoice metadata to ledger") != PipelineTag.IMAGE_TO_TEXT

    # 3. AUTOMATIC_SPEECH_RECOGNITION
    assert (
        fallback_pipeline_tag("Transcribe incoming audio calls")
        == PipelineTag.AUTOMATIC_SPEECH_RECOGNITION
    )
    assert (
        fallback_pipeline_tag("Route incoming calls to agents")
        != PipelineTag.AUTOMATIC_SPEECH_RECOGNITION
    )

    # 4. TEXT_TO_SPEECH
    assert (
        fallback_pipeline_tag("Text to speech generator for customer replies")
        == PipelineTag.TEXT_TO_SPEECH
    )
    assert fallback_pipeline_tag("Draft email replies for customers") != PipelineTag.TEXT_TO_SPEECH

    # 5. TEXT_TO_IMAGE
    assert (
        fallback_pipeline_tag("Generate image assets using diffusion") == PipelineTag.TEXT_TO_IMAGE
    )
    assert fallback_pipeline_tag("Compress image files before storage") != PipelineTag.TEXT_TO_IMAGE

    # 6. SUMMARIZATION
    assert (
        fallback_pipeline_tag("Summarize lengthy contracts into bullets")
        == PipelineTag.SUMMARIZATION
    )
    assert fallback_pipeline_tag("Store signed contracts in archive") != PipelineTag.SUMMARIZATION

    # 7. TRANSLATION
    assert fallback_pipeline_tag("Translate legal text to Spanish") == PipelineTag.TRANSLATION
    assert (
        fallback_pipeline_tag("Store legal text in document repository") != PipelineTag.TRANSLATION
    )

    # 8. QUESTION_ANSWERING
    assert fallback_pipeline_tag("Answer customer FAQ questions") == PipelineTag.QUESTION_ANSWERING
    assert (
        fallback_pipeline_tag("Forward customer inquiries to ticketing")
        != PipelineTag.QUESTION_ANSWERING
    )

    # 9. TEXT_GENERATION (default or explicit agent)
    assert fallback_pipeline_tag("Generic coordinator node") == PipelineTag.TEXT_GENERATION
    assert (
        fallback_pipeline_tag("Vision inspection service", ai_role="agent")
        == PipelineTag.TEXT_GENERATION
    )
