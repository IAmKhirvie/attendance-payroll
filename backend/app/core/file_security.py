"""
File Security Utilities
=======================
MIME type validation and file upload security.
"""

import io
import zipfile

import magic
import logging
from typing import Optional, Tuple, Set
from fastapi import UploadFile, HTTPException, status

logger = logging.getLogger(__name__)


# =============================================================================
# ALLOWED FILE TYPES CONFIGURATION
# =============================================================================

# MIME types for spreadsheet files (attendance/payroll imports)
SPREADSHEET_MIMES: Set[str] = {
    "application/vnd.ms-excel",  # .xls
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "text/csv",
    "application/csv",
    "text/plain",  # CSV sometimes detected as plain text
}

# XLSX files are Office Open XML zip containers. Depending on the local
# libmagic database, valid .xlsx uploads can be reported as one of these.
OOXML_ZIP_MIMES: Set[str] = {
    "application/zip",
    "application/x-zip",
    "application/x-zip-compressed",
    "application/octet-stream",
}

# MIME types for document files
DOCUMENT_MIMES: Set[str] = {
    "application/pdf",
    "application/msword",  # .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
}

# MIME types for images
IMAGE_MIMES: Set[str] = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
}

# All allowed MIME types combined
ALL_ALLOWED_MIMES: Set[str] = SPREADSHEET_MIMES | DOCUMENT_MIMES | IMAGE_MIMES

# Dangerous file extensions that should never be uploaded
DANGEROUS_EXTENSIONS: Set[str] = {
    ".exe", ".dll", ".bat", ".cmd", ".sh", ".ps1",  # Executables
    ".js", ".vbs", ".wsf", ".wsh",  # Scripts
    ".msi", ".scr", ".pif", ".com",  # Windows executables
    ".jar", ".py", ".php", ".asp", ".aspx",  # Server-side scripts
    ".html", ".htm", ".svg",  # Can contain scripts
}

# Maximum file sizes by type (in bytes)
MAX_FILE_SIZES = {
    "spreadsheet": 50 * 1024 * 1024,  # 50 MB
    "document": 20 * 1024 * 1024,     # 20 MB
    "image": 10 * 1024 * 1024,        # 10 MB
    "default": 10 * 1024 * 1024,      # 10 MB
}


# =============================================================================
# FILE VALIDATION FUNCTIONS
# =============================================================================

def get_file_mime_type(file_content: bytes) -> str:
    """
    Detect MIME type from file content using libmagic.
    This is more reliable than checking file extension.
    """
    try:
        mime = magic.Magic(mime=True)
        return mime.from_buffer(file_content)
    except Exception as e:
        logger.error(f"Error detecting MIME type: {e}")
        return "application/octet-stream"


def _is_valid_xlsx_content(file_content: bytes) -> bool:
    """Return True when bytes look like a real XLSX workbook container."""
    try:
        with zipfile.ZipFile(io.BytesIO(file_content)) as archive:
            names = set(archive.namelist())
            return "[Content_Types].xml" in names and any(
                name.startswith("xl/") for name in names
            )
    except zipfile.BadZipFile:
        return False


def validate_file_extension(filename: str) -> Tuple[bool, str]:
    """
    Validate file extension is not dangerous.
    Returns (is_valid, error_message).
    """
    if not filename:
        return False, "Filename is required"

    # Get extension
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext in DANGEROUS_EXTENSIONS:
        logger.warning(f"Blocked dangerous file extension: {ext}")
        return False, f"File type '{ext}' is not allowed for security reasons"

    return True, ""


def validate_file_mime(
    file_content: bytes,
    allowed_mimes: Set[str],
    filename: str = ""
) -> Tuple[bool, str]:
    """
    Validate file MIME type matches allowed types.
    Returns (is_valid, error_message).
    """
    detected_mime = get_file_mime_type(file_content)

    if detected_mime not in allowed_mimes:
        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

        if (
            ext == ".xlsx"
            and detected_mime in OOXML_ZIP_MIMES
            and _is_valid_xlsx_content(file_content)
        ):
            return True, ""

        logger.warning(
            f"Blocked file with invalid MIME type: {detected_mime} "
            f"(filename: {filename})"
        )
        return False, f"File type '{detected_mime}' is not allowed"

    return True, ""


def validate_file_size(
    file_content: bytes,
    max_size: int,
    filename: str = ""
) -> Tuple[bool, str]:
    """
    Validate file size is within limits.
    Returns (is_valid, error_message).
    """
    file_size = len(file_content)

    if file_size > max_size:
        max_mb = max_size / (1024 * 1024)
        actual_mb = file_size / (1024 * 1024)
        logger.warning(
            f"Blocked oversized file: {actual_mb:.2f}MB > {max_mb:.2f}MB "
            f"(filename: {filename})"
        )
        return False, f"File size ({actual_mb:.2f}MB) exceeds maximum allowed ({max_mb:.2f}MB)"

    return True, ""


async def validate_upload_file(
    file: UploadFile,
    allowed_mimes: Set[str] = None,
    max_size: int = None,
    check_content: bool = True
) -> bytes:
    """
    Comprehensive file upload validation.
    Returns file content if valid, raises HTTPException if not.

    Args:
        file: The uploaded file
        allowed_mimes: Set of allowed MIME types (default: ALL_ALLOWED_MIMES)
        max_size: Maximum file size in bytes (default: 10MB)
        check_content: Whether to check file content for MIME type

    Returns:
        File content as bytes

    Raises:
        HTTPException: If validation fails
    """
    if allowed_mimes is None:
        allowed_mimes = ALL_ALLOWED_MIMES
    if max_size is None:
        max_size = MAX_FILE_SIZES["default"]

    filename = file.filename or "unknown"

    # 1. Validate extension
    is_valid, error = validate_file_extension(filename)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )

    # 2. Read file content
    try:
        content = await file.read()
    except Exception as e:
        logger.error(f"Error reading uploaded file: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error reading uploaded file"
        )

    # 3. Validate file size
    is_valid, error = validate_file_size(content, max_size, filename)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=error
        )

    # 4. Validate MIME type from content
    if check_content:
        is_valid, error = validate_file_mime(content, allowed_mimes, filename)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error
            )

    # Reset file position for further processing
    await file.seek(0)

    return content


async def validate_spreadsheet_upload(file: UploadFile) -> bytes:
    """
    Validate a spreadsheet file upload (XLS, XLSX, CSV).
    """
    return await validate_upload_file(
        file,
        allowed_mimes=SPREADSHEET_MIMES,
        max_size=MAX_FILE_SIZES["spreadsheet"]
    )


async def validate_document_upload(file: UploadFile) -> bytes:
    """
    Validate a document file upload (PDF, DOC, DOCX).
    """
    return await validate_upload_file(
        file,
        allowed_mimes=DOCUMENT_MIMES,
        max_size=MAX_FILE_SIZES["document"]
    )


async def validate_image_upload(file: UploadFile) -> bytes:
    """
    Validate an image file upload (JPEG, PNG, GIF, WebP).
    """
    return await validate_upload_file(
        file,
        allowed_mimes=IMAGE_MIMES,
        max_size=MAX_FILE_SIZES["image"]
    )


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent path traversal and other attacks.
    """
    if not filename:
        return "unnamed_file"

    # Remove path separators
    filename = filename.replace("/", "_").replace("\\", "_")

    # Remove null bytes
    filename = filename.replace("\x00", "")

    # Remove control characters
    filename = "".join(c for c in filename if ord(c) >= 32)

    # Remove leading/trailing dots and spaces
    filename = filename.strip(". ")

    # Limit length
    max_length = 255
    if len(filename) > max_length:
        name, ext = filename.rsplit(".", 1) if "." in filename else (filename, "")
        name = name[:max_length - len(ext) - 1]
        filename = f"{name}.{ext}" if ext else name

    return filename or "unnamed_file"
