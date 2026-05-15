"""
Security Middleware for FastAPI
================================
Comprehensive security measures including:
- Security headers (CSP, X-Frame-Options, etc.)
- XSS protection with input sanitization
- SQL injection pattern detection
- Request validation
"""

import re
import html
import logging
from typing import Callable, Optional, Set
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)


# =============================================================================
# SQL INJECTION PROTECTION
# =============================================================================

# Common SQL injection patterns
SQL_INJECTION_PATTERNS = [
    r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE|UNION|DECLARE)\b)",
    r"(--|#|/\*|\*/)",  # SQL comments
    r"(\bOR\b\s+\d+\s*=\s*\d+)",  # OR 1=1 patterns
    r"(\bAND\b\s+\d+\s*=\s*\d+)",  # AND 1=1 patterns
    r"(;\s*(SELECT|INSERT|UPDATE|DELETE|DROP))",  # Stacked queries
    r"(\bUNION\b\s+\bSELECT\b)",  # UNION SELECT
    r"(\bSLEEP\s*\()",  # Time-based injection
    r"(\bBENCHMARK\s*\()",  # MySQL benchmark
    r"(\bWAITFOR\b\s+\bDELAY\b)",  # SQL Server delay
    r"(CHAR\s*\(\d+\))",  # CHAR() function abuse
    r"(0x[0-9a-fA-F]+)",  # Hex encoded strings
    r"(\bLOAD_FILE\s*\()",  # File operations
    r"(\bINTO\s+(OUT|DUMP)FILE\b)",  # File output
    r"(@@\w+)",  # Server variables
    r"(\bINFORMATION_SCHEMA\b)",  # Schema enumeration
]

# Compiled patterns for performance
COMPILED_SQL_PATTERNS = [re.compile(pattern, re.IGNORECASE) for pattern in SQL_INJECTION_PATTERNS]

# Whitelist of safe field names that may contain SQL-like keywords
SAFE_FIELD_NAMES = {
    'email', 'first_name', 'last_name', 'company_name', 'description',
    'notes', 'remarks', 'address', 'position', 'department', 'status',
    'title', 'content', 'message', 'comment', 'name', 'full_name',
    'reason', 'deletion_reason', 'search', 'query', 'q',
}


def detect_sql_injection(value: str, field_name: Optional[str] = None) -> bool:
    """
    Detect potential SQL injection patterns in a string.
    Returns True if suspicious pattern detected.
    """
    if not value or not isinstance(value, str):
        return False

    # Skip checking safe fields that might contain SQL-like words naturally
    if field_name and field_name.lower() in SAFE_FIELD_NAMES:
        # Only check for the most dangerous patterns on safe fields
        dangerous_patterns = [
            r"(;\s*(SELECT|INSERT|UPDATE|DELETE|DROP))",  # Stacked queries
            r"(\bUNION\b\s+\bSELECT\b)",  # UNION SELECT
            r"(\bINTO\s+(OUT|DUMP)FILE\b)",  # File output
        ]
        for pattern in dangerous_patterns:
            if re.search(pattern, value, re.IGNORECASE):
                return True
        return False

    # Check all patterns for other fields
    for pattern in COMPILED_SQL_PATTERNS:
        if pattern.search(value):
            return True

    return False


def sanitize_sql_input(value: str) -> str:
    """
    Sanitize input to prevent SQL injection.
    Note: This is a defense-in-depth measure. Primary protection is via ORM.
    """
    if not value or not isinstance(value, str):
        return value

    # Remove null bytes
    value = value.replace('\x00', '')

    # Escape single quotes (primary SQL injection vector)
    value = value.replace("'", "''")

    # Remove semicolons at the end (prevents stacked queries)
    value = value.rstrip(';')

    return value


# =============================================================================
# XSS PROTECTION
# =============================================================================

# XSS attack patterns
XSS_PATTERNS = [
    r"<script[^>]*>.*?</script>",  # Script tags
    r"javascript\s*:",  # JavaScript protocol
    r"on\w+\s*=",  # Event handlers (onclick, onerror, etc.)
    r"<iframe[^>]*>",  # iframes
    r"<object[^>]*>",  # Object tags
    r"<embed[^>]*>",  # Embed tags
    r"<link[^>]*>",  # Link tags (can be malicious)
    r"<meta[^>]*>",  # Meta tags
    r"<base[^>]*>",  # Base tags
    r"<form[^>]*>",  # Form tags
    r"expression\s*\(",  # CSS expressions
    r"url\s*\(\s*['\"]?\s*javascript:",  # CSS url() with javascript
    r"data\s*:\s*text/html",  # Data URLs with HTML
    r"vbscript\s*:",  # VBScript protocol
    r"<svg[^>]*onload",  # SVG with onload
    r"<img[^>]*onerror",  # Image error handlers
    r"<!--.*-->",  # HTML comments (can hide malicious code)
]

# Compiled XSS patterns for performance
COMPILED_XSS_PATTERNS = [re.compile(pattern, re.IGNORECASE | re.DOTALL) for pattern in XSS_PATTERNS]


def detect_xss(value: str) -> bool:
    """
    Detect potential XSS patterns in a string.
    Returns True if suspicious pattern detected.
    """
    if not value or not isinstance(value, str):
        return False

    for pattern in COMPILED_XSS_PATTERNS:
        if pattern.search(value):
            return True

    return False


def sanitize_html(value: str) -> str:
    """
    Sanitize HTML content to prevent XSS attacks.
    Escapes HTML entities.
    """
    if not value or not isinstance(value, str):
        return value

    # Escape HTML entities
    return html.escape(value, quote=True)


def sanitize_input(value: str, allow_html: bool = False) -> str:
    """
    Comprehensive input sanitization.
    """
    if not value or not isinstance(value, str):
        return value

    # Remove null bytes
    value = value.replace('\x00', '')

    # Remove control characters (except newlines and tabs)
    value = ''.join(char for char in value if ord(char) >= 32 or char in '\n\r\t')

    # Strip excessive whitespace
    value = ' '.join(value.split())

    if not allow_html:
        # Escape HTML entities
        value = html.escape(value, quote=True)

    return value


# =============================================================================
# SECURITY HEADERS MIDDLEWARE
# =============================================================================

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add security headers to all responses.
    """

    def __init__(
        self,
        app: ASGIApp,
        content_security_policy: Optional[str] = None,
        x_frame_options: str = "DENY",
        x_content_type_options: str = "nosniff",
        x_xss_protection: str = "1; mode=block",
        referrer_policy: str = "strict-origin-when-cross-origin",
        permissions_policy: Optional[str] = None,
        hsts_max_age: int = 31536000,  # 1 year
        hsts_include_subdomains: bool = True,
        enable_hsts: bool = False,  # Disabled by default for dev
    ):
        super().__init__(app)
        self.content_security_policy = content_security_policy or self._default_csp()
        self.x_frame_options = x_frame_options
        self.x_content_type_options = x_content_type_options
        self.x_xss_protection = x_xss_protection
        self.referrer_policy = referrer_policy
        self.permissions_policy = permissions_policy or self._default_permissions_policy()
        self.hsts_max_age = hsts_max_age
        self.hsts_include_subdomains = hsts_include_subdomains
        self.enable_hsts = enable_hsts

    def _default_csp(self) -> str:
        """Default Content Security Policy."""
        return "; ".join([
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  # Required for React
            "style-src 'self' 'unsafe-inline'",  # Required for inline styles
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self' ws: wss: http: https:",  # API connections
            "frame-ancestors 'none'",
            "form-action 'self'",
            "base-uri 'self'",
            "object-src 'none'",
        ])

    def _default_permissions_policy(self) -> str:
        """Default Permissions Policy (formerly Feature Policy)."""
        return ", ".join([
            "accelerometer=()",
            "camera=()",
            "geolocation=()",
            "gyroscope=()",
            "magnetometer=()",
            "microphone=()",
            "payment=()",
            "usb=()",
        ])

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)

        # Add security headers
        response.headers["X-Frame-Options"] = self.x_frame_options
        response.headers["X-Content-Type-Options"] = self.x_content_type_options
        response.headers["X-XSS-Protection"] = self.x_xss_protection
        response.headers["Referrer-Policy"] = self.referrer_policy
        response.headers["Content-Security-Policy"] = self.content_security_policy
        response.headers["Permissions-Policy"] = self.permissions_policy

        # Cache control for sensitive pages
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            response.headers["Pragma"] = "no-cache"

        # HSTS (only enable for HTTPS in production)
        if self.enable_hsts:
            hsts_value = f"max-age={self.hsts_max_age}"
            if self.hsts_include_subdomains:
                hsts_value += "; includeSubDomains"
            response.headers["Strict-Transport-Security"] = hsts_value

        # Remove server header (information disclosure)
        if "server" in response.headers:
            del response.headers["server"]

        return response


# =============================================================================
# REQUEST VALIDATION MIDDLEWARE
# =============================================================================

class RequestValidationMiddleware(BaseHTTPMiddleware):
    """
    Middleware to validate and sanitize incoming requests.
    """

    # Paths that should skip validation (e.g., file uploads)
    SKIP_VALIDATION_PATHS: Set[str] = {
        "/api/v1/attendance/import",
        "/api/v1/employees/import",
    }

    # Maximum request body size (10MB)
    MAX_BODY_SIZE = 10 * 1024 * 1024

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip validation for certain paths
        if any(request.url.path.startswith(path) for path in self.SKIP_VALIDATION_PATHS):
            return await call_next(request)

        # Check content length
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.MAX_BODY_SIZE:
            logger.warning(f"Request body too large from {request.client.host}: {content_length} bytes")
            return JSONResponse(
                status_code=413,
                content={"detail": "Request body too large"}
            )

        # For JSON requests, validate the body
        if request.method in ["POST", "PUT", "PATCH"]:
            content_type = request.headers.get("content-type", "")

            if "application/json" in content_type:
                try:
                    body = await request.body()
                    body_str = body.decode("utf-8")

                    # Check for SQL injection patterns in JSON body
                    if detect_sql_injection(body_str):
                        logger.warning(f"Potential SQL injection detected from {request.client.host}")
                        return JSONResponse(
                            status_code=400,
                            content={"detail": "Invalid input detected"}
                        )

                    # Check for XSS patterns in JSON body
                    if detect_xss(body_str):
                        logger.warning(f"Potential XSS attack detected from {request.client.host}")
                        return JSONResponse(
                            status_code=400,
                            content={"detail": "Invalid input detected"}
                        )

                except Exception as e:
                    logger.error(f"Error validating request body: {e}")

        # Check query parameters for injection
        for key, value in request.query_params.items():
            if detect_sql_injection(value, key) or detect_xss(value):
                logger.warning(f"Potential injection in query params from {request.client.host}")
                return JSONResponse(
                    status_code=400,
                    content={"detail": "Invalid query parameter"}
                )

        return await call_next(request)


# =============================================================================
# TOKEN BLACKLIST (For Logout)
# =============================================================================

class TokenBlacklist:
    """
    In-memory token blacklist for logout functionality.
    In production, use Redis or database for persistence.
    """

    def __init__(self):
        self._blacklist: Set[str] = set()
        self._max_size = 10000  # Prevent memory bloat

    def add(self, token: str) -> None:
        """Add a token to the blacklist."""
        if len(self._blacklist) >= self._max_size:
            # Clear oldest entries (simple strategy)
            self._blacklist.clear()
            logger.warning("Token blacklist cleared due to size limit")
        self._blacklist.add(token)

    def is_blacklisted(self, token: str) -> bool:
        """Check if a token is blacklisted."""
        return token in self._blacklist

    def remove(self, token: str) -> None:
        """Remove a token from the blacklist."""
        self._blacklist.discard(token)

    def clear(self) -> None:
        """Clear the blacklist."""
        self._blacklist.clear()


# Global token blacklist instance
token_blacklist = TokenBlacklist()


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def validate_and_sanitize_input(value: str, field_name: Optional[str] = None, max_length: int = 1000) -> str:
    """
    Validate and sanitize user input.
    Raises ValueError if malicious input detected.
    """
    if not value:
        return value

    # Check length
    if len(value) > max_length:
        raise ValueError(f"Input exceeds maximum length of {max_length}")

    # Check for SQL injection
    if detect_sql_injection(value, field_name):
        raise ValueError("Invalid input: potential SQL injection detected")

    # Check for XSS
    if detect_xss(value):
        raise ValueError("Invalid input: potential XSS detected")

    # Sanitize
    return sanitize_input(value)


def get_client_ip(request: Request) -> str:
    """Get the real client IP address, considering proxies."""
    # Check for X-Forwarded-For header (when behind proxy)
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # Take the first IP in the chain (original client)
        return forwarded_for.split(",")[0].strip()

    # Check for X-Real-IP header
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip

    # Fall back to direct connection IP
    if request.client:
        return request.client.host

    return "unknown"
