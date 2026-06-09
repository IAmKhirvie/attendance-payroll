"""
Attendance & Payroll Management Platform
========================================
Main FastAPI application entry point.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import logging
import os
from logging.handlers import RotatingFileHandler

from app.core.config import settings
from app.core.database import engine, Base, SessionLocal, seed_contribution_tables, ensure_schema_updates
from app.api.v1 import api_router
from app.models.user import User, Role, UserStatus
from app.models.settings import SystemSettings
from app.core.security import hash_password
from app.core.security_middleware import (
    SecurityHeadersMiddleware,
    RequestValidationMiddleware,
)
from app.core.rate_limiter import RateLimitMiddleware

LOG_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), settings.LOG_DIR))
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        RotatingFileHandler(
            os.path.join(LOG_DIR, "app.log"),
            maxBytes=10 * 1024 * 1024,
            backupCount=10,
        ),
    ],
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info("Starting Attendance & Payroll Management Platform...")
    logger.info(f"Server bound to {settings.HOST}:{settings.PORT}")

    # Create database tables
    Base.metadata.create_all(bind=engine)
    ensure_schema_updates()
    logger.info("Database tables created")

    # Create default admin user if none exists
    create_default_admin()

    # Seed government contribution tables (SSS, PhilHealth, Pag-IBIG)
    try:
        seed_contribution_tables()
        logger.info("Government contribution tables seeded")
    except Exception as e:
        logger.error(f"Error seeding contribution tables: {e}")

    yield

    # Shutdown
    logger.info("Shutting down...")


def create_default_admin():
    """Create default admin user if no admin exists."""
    db = SessionLocal()
    try:
        admin_exists = db.query(User).filter(User.role == Role.ADMIN).first()
        if not admin_exists:
            admin = User(
                email="admin@localhost",
                password_hash=hash_password("admin123"),
                first_name="System",
                last_name="Admin",
                role=Role.ADMIN,
                status=UserStatus.ACTIVE,
                must_change_password=True
            )
            db.add(admin)

            # Also create default system settings
            settings_exist = db.query(SystemSettings).first()
            if not settings_exist:
                sys_settings = SystemSettings(company_name="My Company")
                db.add(sys_settings)

            db.commit()
            logger.info("Created default admin user: admin@localhost / admin123")
            logger.info("WARNING: Please change the default admin password!")
    except Exception as e:
        logger.error(f"Error creating default admin: {e}")
        db.rollback()
    finally:
        db.close()


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Attendance & Payroll Management Platform",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Security middleware - adds security headers (CSP, X-Frame-Options, etc.)
# Enable HSTS in production when using HTTPS
app.add_middleware(
    SecurityHeadersMiddleware,
    enable_hsts=settings.ENVIRONMENT == "production",
)

# Request validation middleware - detects SQL injection and XSS
app.add_middleware(RequestValidationMiddleware)

# Global API rate limiting
app.add_middleware(RateLimitMiddleware)

# CORS middleware - configurable via CORS_ORIGINS env var
# For local network: CORS_ORIGINS="*"
# For production: CORS_ORIGINS="https://your-domain.com,https://admin.your-domain.com"
cors_origins = settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


# Include API router
app.include_router(api_router, prefix="/api/v1")


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION
    }


# Static files directory
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")

# Serve static assets (JS, CSS, images)
if os.path.exists(os.path.join(STATIC_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

# Root endpoint - serve index.html for SPA
@app.get("/")
async def root():
    """Serve the frontend."""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {
        "message": "Attendance & Payroll Management Platform",
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "api": "/api/v1"
    }

# Catch-all route for SPA - must be last
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve index.html for all non-API routes (SPA support)."""
    # Don't serve index.html for API routes
    if full_path.startswith("api/") or full_path in ["docs", "redoc", "openapi.json", "health"]:
        return JSONResponse(status_code=404, content={"detail": "Not found"})

    # Try to serve static file first
    static_file = os.path.join(STATIC_DIR, full_path)
    if os.path.exists(static_file) and os.path.isfile(static_file):
        return FileResponse(static_file)

    # Otherwise serve index.html for SPA routing
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)

    return JSONResponse(status_code=404, content={"detail": "Not found"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        ssl_keyfile=settings.SSL_KEYFILE,
        ssl_certfile=settings.SSL_CERTFILE
    )
