"""Estimator module: pure memory estimation calculator, constants, and schemas."""

from archnemesis.modules.modelfit.estimator.calculator import estimate_memory
from archnemesis.modules.modelfit.estimator.schemas import (
    ArchitectureCategory,
    AttentionVariant,
    ConfidenceLevel,
    EstimationConfig,
    EstimationResult,
    HardwareKind,
    HardwareProfileInput,
    InferenceRuntime,
    KVCacheDtype,
    NormalizedModel,
    QuantizationFormat,
    ResolvedHardware,
    Verdict,
)

__all__ = [
    "ArchitectureCategory",
    "AttentionVariant",
    "ConfidenceLevel",
    "EstimationConfig",
    "EstimationResult",
    "HardwareKind",
    "HardwareProfileInput",
    "InferenceRuntime",
    "KVCacheDtype",
    "NormalizedModel",
    "QuantizationFormat",
    "ResolvedHardware",
    "Verdict",
    "estimate_memory",
]
