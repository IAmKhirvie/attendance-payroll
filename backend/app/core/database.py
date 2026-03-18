"""
Database Configuration
======================
SQLAlchemy database setup and session management.
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

# Create engine - SQLite for local development
if settings.DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False}  # Required for SQLite
    )
else:
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20
    )

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables."""
    from app.models import user, employee, attendance, payroll, audit
    Base.metadata.create_all(bind=engine)


def seed_contribution_tables():
    """
    Seed government contribution tables with 2025 rates.
    Only seeds if tables don't exist for the year.
    """
    from app.models.payroll import ContributionTable, ContributionType

    db = SessionLocal()
    try:
        # Check if 2025 SSS table exists
        existing_sss = db.query(ContributionTable).filter(
            ContributionTable.contribution_type == ContributionType.SSS,
            ContributionTable.effective_year == 2025,
            ContributionTable.is_active == True
        ).first()

        if not existing_sss:
            # 2025 SSS Contribution Table (effective January 2025)
            # Source: SSS Circular 2024-001
            sss_2025_brackets = [
                {"min": 0, "max": 4249.99, "msc": 4000, "ee": 180.00, "er": 380.00, "ec": 10.00},
                {"min": 4250, "max": 4749.99, "msc": 4500, "ee": 202.50, "er": 427.50, "ec": 10.00},
                {"min": 4750, "max": 5249.99, "msc": 5000, "ee": 225.00, "er": 475.00, "ec": 10.00},
                {"min": 5250, "max": 5749.99, "msc": 5500, "ee": 247.50, "er": 522.50, "ec": 10.00},
                {"min": 5750, "max": 6249.99, "msc": 6000, "ee": 270.00, "er": 570.00, "ec": 10.00},
                {"min": 6250, "max": 6749.99, "msc": 6500, "ee": 292.50, "er": 617.50, "ec": 10.00},
                {"min": 6750, "max": 7249.99, "msc": 7000, "ee": 315.00, "er": 665.00, "ec": 10.00},
                {"min": 7250, "max": 7749.99, "msc": 7500, "ee": 337.50, "er": 712.50, "ec": 10.00},
                {"min": 7750, "max": 8249.99, "msc": 8000, "ee": 360.00, "er": 760.00, "ec": 10.00},
                {"min": 8250, "max": 8749.99, "msc": 8500, "ee": 382.50, "er": 807.50, "ec": 10.00},
                {"min": 8750, "max": 9249.99, "msc": 9000, "ee": 405.00, "er": 855.00, "ec": 10.00},
                {"min": 9250, "max": 9749.99, "msc": 9500, "ee": 427.50, "er": 902.50, "ec": 10.00},
                {"min": 9750, "max": 10249.99, "msc": 10000, "ee": 450.00, "er": 950.00, "ec": 10.00},
                {"min": 10250, "max": 10749.99, "msc": 10500, "ee": 472.50, "er": 997.50, "ec": 10.00},
                {"min": 10750, "max": 11249.99, "msc": 11000, "ee": 495.00, "er": 1045.00, "ec": 10.00},
                {"min": 11250, "max": 11749.99, "msc": 11500, "ee": 517.50, "er": 1092.50, "ec": 10.00},
                {"min": 11750, "max": 12249.99, "msc": 12000, "ee": 540.00, "er": 1140.00, "ec": 10.00},
                {"min": 12250, "max": 12749.99, "msc": 12500, "ee": 562.50, "er": 1187.50, "ec": 10.00},
                {"min": 12750, "max": 13249.99, "msc": 13000, "ee": 585.00, "er": 1235.00, "ec": 10.00},
                {"min": 13250, "max": 13749.99, "msc": 13500, "ee": 607.50, "er": 1282.50, "ec": 10.00},
                {"min": 13750, "max": 14249.99, "msc": 14000, "ee": 630.00, "er": 1330.00, "ec": 10.00},
                {"min": 14250, "max": 14749.99, "msc": 14500, "ee": 652.50, "er": 1377.50, "ec": 10.00},
                {"min": 14750, "max": 15249.99, "msc": 15000, "ee": 675.00, "er": 1425.00, "ec": 10.00},
                {"min": 15250, "max": 15749.99, "msc": 15500, "ee": 697.50, "er": 1472.50, "ec": 10.00},
                {"min": 15750, "max": 16249.99, "msc": 16000, "ee": 720.00, "er": 1520.00, "ec": 10.00},
                {"min": 16250, "max": 16749.99, "msc": 16500, "ee": 742.50, "er": 1567.50, "ec": 10.00},
                {"min": 16750, "max": 17249.99, "msc": 17000, "ee": 765.00, "er": 1615.00, "ec": 10.00},
                {"min": 17250, "max": 17749.99, "msc": 17500, "ee": 787.50, "er": 1662.50, "ec": 10.00},
                {"min": 17750, "max": 18249.99, "msc": 18000, "ee": 810.00, "er": 1710.00, "ec": 10.00},
                {"min": 18250, "max": 18749.99, "msc": 18500, "ee": 832.50, "er": 1757.50, "ec": 10.00},
                {"min": 18750, "max": 19249.99, "msc": 19000, "ee": 855.00, "er": 1805.00, "ec": 10.00},
                {"min": 19250, "max": 19749.99, "msc": 19500, "ee": 877.50, "er": 1852.50, "ec": 10.00},
                {"min": 19750, "max": 20249.99, "msc": 20000, "ee": 900.00, "er": 1900.00, "ec": 10.00},
                {"min": 20250, "max": 20749.99, "msc": 20500, "ee": 922.50, "er": 1947.50, "ec": 10.00},
                {"min": 20750, "max": 21249.99, "msc": 21000, "ee": 945.00, "er": 1995.00, "ec": 10.00},
                {"min": 21250, "max": 21749.99, "msc": 21500, "ee": 967.50, "er": 2042.50, "ec": 10.00},
                {"min": 21750, "max": 22249.99, "msc": 22000, "ee": 990.00, "er": 2090.00, "ec": 10.00},
                {"min": 22250, "max": 22749.99, "msc": 22500, "ee": 1012.50, "er": 2137.50, "ec": 10.00},
                {"min": 22750, "max": 23249.99, "msc": 23000, "ee": 1035.00, "er": 2185.00, "ec": 10.00},
                {"min": 23250, "max": 23749.99, "msc": 23500, "ee": 1057.50, "er": 2232.50, "ec": 10.00},
                {"min": 23750, "max": 24249.99, "msc": 24000, "ee": 1080.00, "er": 2280.00, "ec": 10.00},
                {"min": 24250, "max": 24749.99, "msc": 24500, "ee": 1102.50, "er": 2327.50, "ec": 10.00},
                {"min": 24750, "max": 25249.99, "msc": 25000, "ee": 1125.00, "er": 2375.00, "ec": 10.00},
                {"min": 25250, "max": 25749.99, "msc": 25500, "ee": 1147.50, "er": 2422.50, "ec": 10.00},
                {"min": 25750, "max": 26249.99, "msc": 26000, "ee": 1170.00, "er": 2470.00, "ec": 10.00},
                {"min": 26250, "max": 26749.99, "msc": 26500, "ee": 1192.50, "er": 2517.50, "ec": 10.00},
                {"min": 26750, "max": 27249.99, "msc": 27000, "ee": 1215.00, "er": 2565.00, "ec": 10.00},
                {"min": 27250, "max": 27749.99, "msc": 27500, "ee": 1237.50, "er": 2612.50, "ec": 10.00},
                {"min": 27750, "max": 28249.99, "msc": 28000, "ee": 1260.00, "er": 2660.00, "ec": 10.00},
                {"min": 28250, "max": 28749.99, "msc": 28500, "ee": 1282.50, "er": 2707.50, "ec": 10.00},
                {"min": 28750, "max": 29249.99, "msc": 29000, "ee": 1305.00, "er": 2755.00, "ec": 10.00},
                {"min": 29250, "max": 29749.99, "msc": 29500, "ee": 1327.50, "er": 2802.50, "ec": 10.00},
                {"min": 29750, "max": 30249.99, "msc": 30000, "ee": 1350.00, "er": 2850.00, "ec": 10.00},
                {"min": 30250, "max": 30749.99, "msc": 30500, "ee": 1372.50, "er": 2897.50, "ec": 10.00},
                {"min": 30750, "max": 31249.99, "msc": 31000, "ee": 1395.00, "er": 2945.00, "ec": 10.00},
                {"min": 31250, "max": 31749.99, "msc": 31500, "ee": 1417.50, "er": 2992.50, "ec": 10.00},
                {"min": 31750, "max": 32249.99, "msc": 32000, "ee": 1440.00, "er": 3040.00, "ec": 10.00},
                {"min": 32250, "max": 32749.99, "msc": 32500, "ee": 1462.50, "er": 3087.50, "ec": 10.00},
                {"min": 32750, "max": 33249.99, "msc": 33000, "ee": 1485.00, "er": 3135.00, "ec": 10.00},
                {"min": 33250, "max": 33749.99, "msc": 33500, "ee": 1507.50, "er": 3182.50, "ec": 10.00},
                {"min": 33750, "max": 34249.99, "msc": 34000, "ee": 1530.00, "er": 3230.00, "ec": 10.00},
                {"min": 34250, "max": 34749.99, "msc": 34500, "ee": 1552.50, "er": 3277.50, "ec": 10.00},
                {"min": 34750, "max": 999999, "msc": 35000, "ee": 1575.00, "er": 3325.00, "ec": 10.00},
            ]

            sss_table = ContributionTable(
                contribution_type=ContributionType.SSS,
                effective_year=2025,
                name="SSS 2025 Contribution Table",
                description="SSS contribution table effective January 2025. MSC range: PHP 4,000 - 35,000",
                brackets=sss_2025_brackets,
                is_active=True
            )
            db.add(sss_table)

        # Check if 2025 PhilHealth table exists
        existing_philhealth = db.query(ContributionTable).filter(
            ContributionTable.contribution_type == ContributionType.PHILHEALTH,
            ContributionTable.effective_year == 2025,
            ContributionTable.is_active == True
        ).first()

        if not existing_philhealth:
            # 2025 PhilHealth Premium Rate: 5% (increased from 5% in 2024)
            # Employee share: 2.5%, Employer share: 2.5%
            # Minimum contribution: PHP 500 (total), Maximum: PHP 5,000 (total)
            philhealth_2025 = {
                "rate": 0.05,
                "employee_share_percent": 0.5,
                "employer_share_percent": 0.5,
                "min_monthly_premium": 500.00,
                "max_monthly_premium": 5000.00,
                "min_employee_share": 250.00,
                "max_employee_share": 2500.00,
            }

            philhealth_table = ContributionTable(
                contribution_type=ContributionType.PHILHEALTH,
                effective_year=2025,
                name="PhilHealth 2025 Premium Rate",
                description="PhilHealth premium rate effective January 2025. Rate: 5% of monthly basic salary, split 50/50 between employee and employer.",
                brackets=philhealth_2025,
                is_active=True
            )
            db.add(philhealth_table)

        # Check if 2025 Pag-IBIG table exists
        existing_pagibig = db.query(ContributionTable).filter(
            ContributionTable.contribution_type == ContributionType.PAGIBIG,
            ContributionTable.effective_year == 2025,
            ContributionTable.is_active == True
        ).first()

        if not existing_pagibig:
            # Pag-IBIG Fund Contribution (HDMF)
            # Employee: 2% of monthly compensation
            # Employer: 2% of monthly compensation
            # Maximum monthly compensation for contribution: PHP 10,000
            # Maximum employee contribution: PHP 200
            pagibig_2025 = {
                "employee_rate_below_1500": 0.01,  # 1% if salary <= 1500
                "employee_rate_above_1500": 0.02,  # 2% if salary > 1500
                "employer_rate": 0.02,
                "max_monthly_compensation": 10000.00,
                "max_employee_contribution": 200.00,
                "max_employer_contribution": 200.00,
            }

            pagibig_table = ContributionTable(
                contribution_type=ContributionType.PAGIBIG,
                effective_year=2025,
                name="Pag-IBIG 2025 Contribution Rate",
                description="Pag-IBIG (HDMF) contribution rate. Employee: 2% (max PHP 200), Employer: 2% (max PHP 200).",
                brackets=pagibig_2025,
                is_active=True
            )
            db.add(pagibig_table)

        db.commit()
        print("Government contribution tables seeded successfully.")

    except Exception as e:
        db.rollback()
        print(f"Error seeding contribution tables: {e}")
        raise
    finally:
        db.close()
