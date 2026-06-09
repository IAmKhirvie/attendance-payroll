"""
Rate Limiting Module
====================
Sliding window rate limiting for API endpoints.
"""

import time
import logging
from collections import defaultdict
from dataclasses import dataclass
from threading import Lock
from typing import Callable, Dict, Optional, Tuple

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class RateLimitConfig:
    """Configuration for rate limiting."""
    max_requests: int = 100  # Maximum requests per window
    window_seconds: int = 60  # Window size in seconds
    block_seconds: int = 300  # Block duration after exceeding limit


class SlidingWindowRateLimiter:
    """
    Sliding window rate limiter implementation.
    More accurate than fixed window counters.
    """

    def __init__(self, config: Optional[RateLimitConfig] = None):
        self.config = config or RateLimitConfig()
        self._requests: Dict[str, list] = defaultdict(list)
        self._blocked: Dict[str, float] = {}
        self._lock = Lock()

    def _clean_old_requests(self, key: str, current_time: float) -> None:
        """Remove requests outside the current window."""
        cutoff = current_time - self.config.window_seconds
        self._requests[key] = [t for t in self._requests[key] if t > cutoff]

    def _is_blocked(self, key: str, current_time: float) -> bool:
        """Check if the key is currently blocked."""
        if key in self._blocked:
            block_end = self._blocked[key]
            if current_time < block_end:
                return True
            else:
                del self._blocked[key]
        return False

    def check_rate_limit(self, key: str) -> Tuple[bool, Optional[int]]:
        """
        Check if a request should be allowed.

        Args:
            key: Unique identifier (e.g., IP address, user ID)

        Returns:
            Tuple of (is_allowed, retry_after_seconds)
            - is_allowed: True if request should proceed
            - retry_after_seconds: Seconds until rate limit resets (None if allowed)
        """
        current_time = time.time()

        with self._lock:
            # Check if blocked
            if self._is_blocked(key, current_time):
                remaining = int(self._blocked[key] - current_time)
                return False, remaining

            # Clean old requests
            self._clean_old_requests(key, current_time)

            # Check request count
            request_count = len(self._requests[key])
            if request_count >= self.config.max_requests:
                # Block the key
                self._blocked[key] = current_time + self.config.block_seconds
                logger.warning(f"Rate limit exceeded for {key}, blocked for {self.config.block_seconds}s")
                return False, self.config.block_seconds

            # Record this request
            self._requests[key].append(current_time)
            return True, None

    def get_remaining(self, key: str) -> int:
        """Get remaining requests for a key in the current window."""
        current_time = time.time()

        with self._lock:
            self._clean_old_requests(key, current_time)
            return max(0, self.config.max_requests - len(self._requests[key]))

    def reset(self, key: str) -> None:
        """Reset rate limit for a specific key."""
        with self._lock:
            if key in self._requests:
                del self._requests[key]
            if key in self._blocked:
                del self._blocked[key]

    def clear_all(self) -> None:
        """Clear all rate limit data."""
        with self._lock:
            self._requests.clear()
            self._blocked.clear()


class LoginRateLimiter:
    """
    Specialized rate limiter for login attempts.
    Tracks both successful and failed attempts separately.
    """

    def __init__(
        self,
        max_failed_attempts: int = 5,
        window_seconds: int = 300,  # 5 minutes
        block_seconds: int = 900,   # 15 minutes
        max_total_attempts: int = 20
    ):
        self.max_failed_attempts = max_failed_attempts
        self.window_seconds = window_seconds
        self.block_seconds = block_seconds
        self.max_total_attempts = max_total_attempts

        self._attempts: Dict[str, list] = defaultdict(list)  # [(timestamp, success)]
        self._blocked: Dict[str, float] = {}
        self._lock = Lock()

    def _clean_old_attempts(self, key: str, current_time: float) -> None:
        """Remove attempts outside the current window."""
        cutoff = current_time - self.window_seconds
        self._attempts[key] = [(t, s) for t, s in self._attempts[key] if t > cutoff]

    def check_login_allowed(self, key: str) -> Tuple[bool, Optional[str]]:
        """
        Check if a login attempt should be allowed.

        Args:
            key: Unique identifier (usually IP address)

        Returns:
            Tuple of (is_allowed, error_message)
        """
        current_time = time.time()

        with self._lock:
            # Check if blocked
            if key in self._blocked:
                if current_time < self._blocked[key]:
                    remaining = int((self._blocked[key] - current_time) / 60) + 1
                    return False, f"Too many failed login attempts. Please try again in {remaining} minutes."
                else:
                    del self._blocked[key]

            # Clean old attempts
            self._clean_old_attempts(key, current_time)

            # Count attempts
            attempts = self._attempts[key]
            total_attempts = len(attempts)
            failed_attempts = sum(1 for _, success in attempts if not success)

            # Check limits
            if failed_attempts >= self.max_failed_attempts:
                self._blocked[key] = current_time + self.block_seconds
                remaining = int(self.block_seconds / 60)
                logger.warning(f"Login rate limit exceeded for {key}, blocked for {remaining} minutes")
                return False, f"Too many failed login attempts. Please try again in {remaining} minutes."

            if total_attempts >= self.max_total_attempts:
                return False, "Too many login attempts. Please wait a few minutes."

            return True, None

    def record_attempt(self, key: str, success: bool) -> None:
        """Record a login attempt."""
        current_time = time.time()

        with self._lock:
            self._attempts[key].append((current_time, success))

            # If successful, clear failed attempts (user proved they know password)
            if success:
                self._attempts[key] = [(t, s) for t, s in self._attempts[key] if s]
                if key in self._blocked:
                    del self._blocked[key]

    def get_failed_count(self, key: str) -> int:
        """Get the number of failed attempts for a key."""
        current_time = time.time()

        with self._lock:
            self._clean_old_attempts(key, current_time)
            return sum(1 for _, success in self._attempts[key] if not success)

    def reset(self, key: str) -> None:
        """Reset rate limit for a specific key."""
        with self._lock:
            if key in self._attempts:
                del self._attempts[key]
            if key in self._blocked:
                del self._blocked[key]


class APIRateLimiter:
    """
    General-purpose API rate limiter with different limits per endpoint.
    """

    def __init__(self):
        self._limiters: Dict[str, SlidingWindowRateLimiter] = {}
        self._configs: Dict[str, RateLimitConfig] = {
            # Endpoint pattern: config
            "default": RateLimitConfig(max_requests=100, window_seconds=60),
            "login": RateLimitConfig(max_requests=10, window_seconds=300, block_seconds=900),
            "register": RateLimitConfig(max_requests=5, window_seconds=300),
            "password_reset": RateLimitConfig(max_requests=3, window_seconds=300),
            "import": RateLimitConfig(max_requests=10, window_seconds=60),
            "export": RateLimitConfig(max_requests=20, window_seconds=60),
        }

    def get_limiter(self, endpoint_type: str = "default") -> SlidingWindowRateLimiter:
        """Get or create a rate limiter for an endpoint type."""
        if endpoint_type not in self._limiters:
            config = self._configs.get(endpoint_type, self._configs["default"])
            self._limiters[endpoint_type] = SlidingWindowRateLimiter(config)
        return self._limiters[endpoint_type]

    def check_rate_limit(
        self,
        key: str,
        endpoint_type: str = "default"
    ) -> Tuple[bool, Optional[int]]:
        """Check rate limit for a specific endpoint type."""
        limiter = self.get_limiter(endpoint_type)
        return limiter.check_rate_limit(key)


# Global instances
login_rate_limiter = LoginRateLimiter(
    max_failed_attempts=5,
    window_seconds=300,   # 5 minutes
    block_seconds=900,    # 15 minutes
    max_total_attempts=20
)

api_rate_limiter = APIRateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Global API rate limiter.

    This is intentionally in-process because the current deployment is one
    backend process. For multiple backend instances, replace this with Redis or
    an edge/WAF limiter so counters are shared across nodes.
    """

    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.enabled = settings.RATE_LIMIT_ENABLED
        self.default_limiter = SlidingWindowRateLimiter(
            RateLimitConfig(
                max_requests=settings.RATE_LIMIT_DEFAULT_MAX_REQUESTS,
                window_seconds=settings.RATE_LIMIT_DEFAULT_WINDOW_SECONDS,
                block_seconds=300,
            )
        )
        self.auth_limiter = SlidingWindowRateLimiter(
            RateLimitConfig(
                max_requests=settings.RATE_LIMIT_AUTH_MAX_REQUESTS,
                window_seconds=settings.RATE_LIMIT_AUTH_WINDOW_SECONDS,
                block_seconds=900,
            )
        )
        self.import_limiter = SlidingWindowRateLimiter(
            RateLimitConfig(
                max_requests=settings.RATE_LIMIT_IMPORT_MAX_REQUESTS,
                window_seconds=settings.RATE_LIMIT_IMPORT_WINDOW_SECONDS,
                block_seconds=300,
            )
        )

    def _client_key(self, request: Request) -> str:
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip
        return request.client.host if request.client else "unknown"

    def _limiter_for_path(self, path: str) -> SlidingWindowRateLimiter:
        if path.startswith("/api/v1/auth/"):
            return self.auth_limiter
        if "/import" in path or "/export" in path or "/download" in path:
            return self.import_limiter
        return self.default_limiter

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not self.enabled or not request.url.path.startswith("/api/"):
            return await call_next(request)

        limiter = self._limiter_for_path(request.url.path)
        key = f"{self._client_key(request)}:{request.url.path}"
        allowed, retry_after = limiter.check_rate_limit(key)

        if not allowed:
            logger.warning("Rate limit blocked %s %s", self._client_key(request), request.url.path)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again later."},
                headers={"Retry-After": str(retry_after or 60)},
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Remaining"] = str(limiter.get_remaining(key))
        return response
