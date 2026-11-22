"""Unit tests for the pure memory estimation engine."""

import pytest

from archnemesis.modules.modelfit.estimator.calculator import (
    calculate_activation_bytes,
    calculate_kv_cache_bytes,
    calculate_weights_bytes,
    estimate_memory,
)
from archnemesis.modules.modelfit.estimator.schemas import (
    ArchitectureCategory,
    AttentionVariant,
    ConfidenceLevel,
    EstimationConfig,
    HardwareKind,
    HardwareProfileInput,
    InferenceRuntime,
    KVCacheDtype,
    NormalizedModel,
    QuantizationFormat,
    Verdict,
)


@pytest.fixture
def llama3_8b_model() -> NormalizedModel:
    return NormalizedModel(
        id="meta-llama/Meta-Llama-3-8B",
        architecture_name="LlamaForCausalLM",
        architecture_category=ArchitectureCategory.STANDARD_TRANSFORMER,
        total_params=8_030_000_000,
        active_params=8_030_000_000,
        num_layers=32,
        hidden_size=4096,
        num_attention_heads=32,
        num_kv_heads=8,
        head_dim=128,
        vocab_size=128256,
        max_context_length=8192,
        attention_variant=AttentionVariant.GROUPED_QUERY,
    )


@pytest.fixture
def rtx_4090_hardware() -> HardwareProfileInput:
    return HardwareProfileInput(
        name="NVIDIA GeForce RTX 4090",
        memory_bytes=25_769_803_776,  # 24 GiB
        reserved_memory_bytes=1_073_741_824,  # 1 GiB
        kind=HardwareKind.GPU,
        is_preset=True,
    )


def test_calculate_weights_bytes(llama3_8b_model: NormalizedModel) -> None:
    # 8.03B params * 16 bits / 8 = 16.06 GB
    cfg_fp16 = EstimationConfig(quantization=QuantizationFormat.FP16, context_length=2048)
    w_fp16 = calculate_weights_bytes(llama3_8b_model, cfg_fp16)
    assert w_fp16 == int((8_030_000_000 * 16.0) / 8)

    # 8.03B params * 4.85 bits / 8 for Q4_K_M
    cfg_q4 = EstimationConfig(quantization=QuantizationFormat.Q4_K_M, context_length=2048)
    w_q4 = calculate_weights_bytes(llama3_8b_model, cfg_q4)
    assert w_q4 == int((8_030_000_000 * 4.85) / 8)


def test_calculate_kv_cache_bytes(llama3_8b_model: NormalizedModel) -> None:
    # 2 * 32 layers * 8 kv_heads * 128 head_dim * 4096 tokens * 1 batch * 2 bytes (FP16)
    cfg = EstimationConfig(
        quantization=QuantizationFormat.Q4_K_M,
        context_length=4096,
        batch_size=1,
        kv_cache_dtype=KVCacheDtype.FP16,
    )
    assumptions: list[str] = []
    kv_bytes = calculate_kv_cache_bytes(llama3_8b_model, cfg, assumptions)
    expected = 2 * 32 * 8 * 128 * 4096 * 1 * 2
    assert kv_bytes == expected
    assert len(assumptions) == 0


def test_calculate_activation_bytes(llama3_8b_model: NormalizedModel) -> None:
    cfg = EstimationConfig(
        quantization=QuantizationFormat.Q4_K_M,
        context_length=2048,
        runtime=InferenceRuntime.LLAMA_CPP,
    )
    acts = calculate_activation_bytes(llama3_8b_model, cfg)
    base = 128 * 1024 * 1024
    dynamic = 1 * 2048 * 4096 * 2
    assert acts == base + dynamic


def test_estimate_memory_fits_rtx4090(
    llama3_8b_model: NormalizedModel, rtx_4090_hardware: HardwareProfileInput
) -> None:
    cfg = EstimationConfig(
        quantization=QuantizationFormat.Q4_K_M,
        context_length=4096,
        runtime=InferenceRuntime.LLAMA_CPP,
    )
    res = estimate_memory(llama3_8b_model, cfg, rtx_4090_hardware)

    assert res.verdict == Verdict.FITS
    assert res.total_bytes < (
        rtx_4090_hardware.memory_bytes - rtx_4090_hardware.reserved_memory_bytes
    )
    assert res.confidence == ConfidenceLevel.HIGH
    assert res.headroom_bytes > 0
    assert res.resolved_hardware is not None
    assert res.resolved_hardware.name == "NVIDIA GeForce RTX 4090"


def test_estimate_memory_unsupported_category() -> None:
    mla_model = NormalizedModel(
        id="deepseek-ai/DeepSeek-V2",
        architecture_name="DeepseekV2ForCausalLM",
        architecture_category=ArchitectureCategory.MLA,
        total_params=236_000_000_000,
        num_layers=60,
        hidden_size=5120,
        num_attention_heads=128,
    )
    hw = HardwareProfileInput(name="GPU", memory_bytes=80 * (1024**3))
    cfg = EstimationConfig(quantization=QuantizationFormat.Q4_K_M, context_length=4096)
    res = estimate_memory(mla_model, cfg, hw)

    assert res.verdict == Verdict.CANNOT_ESTIMATE
    assert any("MLA" in reason for reason in res.unsupported_reasons)
