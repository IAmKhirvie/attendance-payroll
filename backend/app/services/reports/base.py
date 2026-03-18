"""
Base Report Generator
=====================
Abstract base class for all report generators.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from datetime import date
from sqlalchemy.orm import Session
import io
import csv
from decimal import Decimal


class BaseReportGenerator(ABC):
    """Base class for all report generators."""

    def __init__(self, db: Session):
        self.db = db

    @abstractmethod
    def generate(self, **kwargs) -> Dict[str, Any]:
        """Generate report data."""
        pass

    @abstractmethod
    def to_csv(self, **kwargs) -> io.StringIO:
        """Export report to CSV format."""
        pass

    def to_excel(self, **kwargs) -> io.BytesIO:
        """Export report to Excel format (optional implementation)."""
        raise NotImplementedError("Excel export not implemented for this report")

    @staticmethod
    def format_decimal(value: Optional[Decimal], decimal_places: int = 2) -> str:
        """Format decimal value as string with comma separators."""
        if value is None:
            return "0.00"
        return f"{float(value):,.{decimal_places}f}"

    @staticmethod
    def format_date(d: Optional[date], format_str: str = "%m/%d/%Y") -> str:
        """Format date as string."""
        if d is None:
            return ""
        return d.strftime(format_str)

    def create_csv(self, headers: List[str], rows: List[List[Any]]) -> io.StringIO:
        """Create CSV file from headers and rows."""
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        for row in rows:
            writer.writerow(row)
        output.seek(0)
        return output
