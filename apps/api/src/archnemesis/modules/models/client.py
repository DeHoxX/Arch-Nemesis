"""HTTP client for querying ModelFit catalogue and probing repo access (Stage 6A, D-401)."""

import time
from collections.abc import Callable
from typing import Any

import httpx
import structlog

from archnemesis.modules.models.schemas import ModelProbeDetail, ProbeResult

logger = structlog.get_logger(__name__)

DEFAULT_TIMEOUT_SECONDS: float = 10.0
DEFAULT_CACHE_TTL_SECONDS: float = 300.0  # 5 minutes


class ModelFitUnavailable(Exception):
    """Raised when ModelFit API is unconfigured, unreachable, rate-limited, or fails."""

    def __init__(self, message: str = "Model suggestions are not available right now.") -> None:
        super().__init__(message)
        self.message = message


class ModelFitClient:
    """Asynchronous client communicating server-to-server with ModelFit API."""

    def __init__(
        self,
        base_url: str,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        cache_ttl: float = DEFAULT_CACHE_TTL_SECONDS,
        clock: Callable[[], float] = time.monotonic,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._cache_ttl = cache_ttl
        self._clock = clock
        self._transport = transport
        # In-memory TTL cache: tag -> (expiry_timestamp, items)
        self._list_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}

    def _get_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._timeout,
            transport=self._transport,
        )

    async def list_models(self, tag: str) -> list[dict[str, Any]]:
        """Fetch models for a pipeline tag, with 5-minute in-memory caching.

        Empty base URL raises ModelFitUnavailable immediately without network calls.
        429, 5xx, timeouts, or network errors raise ModelFitUnavailable.
        """
        if not self._base_url.strip():
            raise ModelFitUnavailable("ModelFit base URL is not configured.")

        now = self._clock()
        cached = self._list_cache.get(tag)
        if cached is not None:
            cached_at, cached_items = cached
            if now - cached_at < self._cache_ttl:
                logger.info("modelfit_list_cache_hit", tag=tag, count=len(cached_items))
                return cached_items

        url = f"{self._base_url}/api/v1/models"
        params: dict[str, str | int] = {
            "pipeline_tag": tag,
            "sort": "downloads",
            "limit": 50,
        }

        try:
            async with self._get_client() as client:
                res = await client.get(url, params=params)
        except httpx.TimeoutException as exc:
            logger.warning("modelfit_list_timeout", tag=tag)
            raise ModelFitUnavailable("ModelFit request timed out.") from exc
        except httpx.RequestError as exc:
            logger.warning("modelfit_list_network_error", tag=tag)
            raise ModelFitUnavailable("ModelFit service is unreachable.") from exc

        if res.status_code == 429:
            logger.warning("modelfit_list_rate_limited", tag=tag)
            raise ModelFitUnavailable("ModelFit catalogue rate limit exceeded.")

        if res.status_code >= 500:
            logger.warning("modelfit_list_server_error", tag=tag, status_code=res.status_code)
            raise ModelFitUnavailable(f"ModelFit returned server error ({res.status_code}).")

        if res.status_code != 200:
            logger.warning("modelfit_list_unexpected_status", tag=tag, status_code=res.status_code)
            raise ModelFitUnavailable(f"ModelFit returned unexpected status ({res.status_code}).")

        try:
            data = res.json()
            if (
                not isinstance(data, dict)
                or "items" not in data
                or not isinstance(data["items"], list)
            ):
                raise ValueError("Malformed response envelope")
            items: list[dict[str, Any]] = data["items"]
        except (ValueError, KeyError, TypeError) as exc:
            logger.warning("modelfit_list_malformed_json", tag=tag)
            raise ModelFitUnavailable("ModelFit returned invalid JSON payload.") from exc

        self._list_cache[tag] = (now, items)
        logger.info("modelfit_list_success", tag=tag, count=len(items))
        return items

    async def probe_model_open(self, repo_id: str) -> ModelProbeDetail:
        """Probe detail endpoint to check whether a repository is accessible and non-gated,

        and extract normalized total parameters.

        - 200 with gated: False -> ProbeResult.OPEN + normalized_model.total_params (int or None)
        - 200 with gated: True -> ProbeResult.GATED + None
        - 403 (GATED_REPO) -> ProbeResult.GATED + None
        - Network error, 429, 5xx, timeout -> ProbeResult.UNKNOWN + None (never OPEN)
        """
        if not self._base_url.strip():
            return ModelProbeDetail(status=ProbeResult.UNKNOWN, total_params=None)

        url = f"{self._base_url}/api/v1/models/{repo_id}"

        try:
            async with self._get_client() as client:
                res = await client.get(url)
        except (httpx.TimeoutException, httpx.RequestError):
            logger.warning("modelfit_probe_network_error", repo_id=repo_id)
            return ModelProbeDetail(status=ProbeResult.UNKNOWN, total_params=None)

        if res.status_code == 403:
            logger.info("modelfit_probe_gated", repo_id=repo_id, status_code=403)
            return ModelProbeDetail(status=ProbeResult.GATED, total_params=None)

        if res.status_code == 200:
            try:
                data = res.json()
                if isinstance(data, dict):
                    gated_val = data.get("gated")
                    if gated_val is False:
                        # Extract total_params strictly from normalized_model.total_params
                        total_params: int | None = None
                        norm = data.get("normalized_model")
                        if isinstance(norm, dict):
                            raw_p = norm.get("total_params")
                            if isinstance(raw_p, int) and raw_p > 0:
                                total_params = raw_p

                        logger.info(
                            "modelfit_probe_open", repo_id=repo_id, total_params=total_params
                        )
                        return ModelProbeDetail(status=ProbeResult.OPEN, total_params=total_params)

                    logger.info("modelfit_probe_gated_flag", repo_id=repo_id, gated=gated_val)
                    return ModelProbeDetail(status=ProbeResult.GATED, total_params=None)
            except (ValueError, KeyError, TypeError):
                logger.warning("modelfit_probe_malformed_json", repo_id=repo_id)
                return ModelProbeDetail(status=ProbeResult.UNKNOWN, total_params=None)

        logger.warning(
            "modelfit_probe_unknown_status", repo_id=repo_id, status_code=res.status_code
        )
        return ModelProbeDetail(status=ProbeResult.UNKNOWN, total_params=None)
