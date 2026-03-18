"""
Email Service
=============
Gmail SMTP email service for notifications.
Supports HTML templates with bilingual content (English/Tagalog).
"""

import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, Any, List
from datetime import datetime
import logging
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

# Template directory
TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "emails"


class EmailService:
    """Gmail SMTP email service."""

    def __init__(self):
        self.host = settings.SMTP_HOST
        self.port = settings.SMTP_PORT
        self.user = settings.SMTP_USER
        self.password = settings.SMTP_PASSWORD
        self.from_name = settings.SMTP_FROM_NAME
        self.from_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
        self.enabled = settings.EMAIL_ENABLED

    def _create_connection(self) -> smtplib.SMTP:
        """Create SMTP connection with TLS."""
        context = ssl.create_default_context()
        server = smtplib.SMTP(self.host, self.port)
        server.ehlo()
        server.starttls(context=context)
        server.ehlo()
        server.login(self.user, self.password)
        return server

    def _render_template(
        self,
        template_name: str,
        context: Dict[str, Any]
    ) -> str:
        """
        Render email template with context variables.
        Templates support {{ variable }} syntax.
        """
        template_path = TEMPLATE_DIR / f"{template_name}.html"

        if not template_path.exists():
            # Return simple fallback
            return self._simple_template(template_name, context)

        with open(template_path, 'r', encoding='utf-8') as f:
            template = f.read()

        # Simple variable substitution
        for key, value in context.items():
            template = template.replace(f"{{{{ {key} }}}}", str(value))
            template = template.replace(f"{{{{{key}}}}}", str(value))

        return template

    def _simple_template(
        self,
        template_name: str,
        context: Dict[str, Any]
    ) -> str:
        """Generate simple HTML fallback when template doesn't exist."""
        # Default templates for common notifications
        templates = {
            'payslip_released': f"""
                <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Payslip Ready / Payslip na po ay Handa na</h2>
                    <p>Dear {context.get('employee_name', 'Employee')},</p>
                    <p>Your payslip for the period <strong>{context.get('period', '')}</strong> is now available.</p>
                    <p><em>Ang iyong payslip para sa period na {context.get('period', '')} ay handa na.</em></p>
                    <p>Net Pay: <strong>PHP {context.get('net_pay', '0.00')}</strong></p>
                    <p>Please log in to the system to view your payslip details.</p>
                    <p><em>Mag-login po sa system para makita ang detalye ng inyong payslip.</em></p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">This is an automated message from {self.from_name}</p>
                </body>
                </html>
            """,
            'leave_approved': f"""
                <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Leave Request Approved / Leave Request Approved na</h2>
                    <p>Dear {context.get('employee_name', 'Employee')},</p>
                    <p>Your leave request has been <strong style="color: green;">APPROVED</strong>.</p>
                    <p><em>Ang iyong leave request ay <strong style="color: green;">APPROVED</strong> na.</em></p>
                    <ul>
                        <li>Leave Type: {context.get('leave_type', '')}</li>
                        <li>Period: {context.get('start_date', '')} - {context.get('end_date', '')}</li>
                        <li>Days: {context.get('total_days', '')}</li>
                    </ul>
                    {f"<p>Reviewer's Notes: {context.get('review_notes', '')}</p>" if context.get('review_notes') else ""}
                    <hr>
                    <p style="color: #666; font-size: 12px;">This is an automated message from {self.from_name}</p>
                </body>
                </html>
            """,
            'leave_rejected': f"""
                <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Leave Request Rejected / Leave Request Hindi Approved</h2>
                    <p>Dear {context.get('employee_name', 'Employee')},</p>
                    <p>We regret to inform you that your leave request has been <strong style="color: red;">REJECTED</strong>.</p>
                    <p><em>Ikinalulungkot naming ipaalam na ang iyong leave request ay <strong style="color: red;">HINDI APPROVED</strong>.</em></p>
                    <ul>
                        <li>Leave Type: {context.get('leave_type', '')}</li>
                        <li>Period: {context.get('start_date', '')} - {context.get('end_date', '')}</li>
                    </ul>
                    {f"<p>Reason: {context.get('review_notes', '')}</p>" if context.get('review_notes') else ""}
                    <p>Please contact HR if you have any questions.</p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">This is an automated message from {self.from_name}</p>
                </body>
                </html>
            """,
            'correction_approved': f"""
                <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Attendance Correction Approved</h2>
                    <p>Dear {context.get('employee_name', 'Employee')},</p>
                    <p>Your attendance correction request has been <strong style="color: green;">APPROVED</strong>.</p>
                    <ul>
                        <li>Date: {context.get('date', '')}</li>
                        <li>Type: {context.get('correction_type', '')}</li>
                    </ul>
                    {f"<p>Notes: {context.get('review_notes', '')}</p>" if context.get('review_notes') else ""}
                    <hr>
                    <p style="color: #666; font-size: 12px;">This is an automated message from {self.from_name}</p>
                </body>
                </html>
            """,
            'correction_rejected': f"""
                <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Attendance Correction Rejected</h2>
                    <p>Dear {context.get('employee_name', 'Employee')},</p>
                    <p>Your attendance correction request has been <strong style="color: red;">REJECTED</strong>.</p>
                    <ul>
                        <li>Date: {context.get('date', '')}</li>
                        <li>Type: {context.get('correction_type', '')}</li>
                    </ul>
                    {f"<p>Reason: {context.get('review_notes', '')}</p>" if context.get('review_notes') else ""}
                    <hr>
                    <p style="color: #666; font-size: 12px;">This is an automated message from {self.from_name}</p>
                </body>
                </html>
            """,
            'password_reset': f"""
                <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Password Reset / Bagong Password</h2>
                    <p>Dear {context.get('employee_name', 'Employee')},</p>
                    <p>Your password has been reset. Your temporary password is:</p>
                    <p style="font-size: 18px; background: #f0f0f0; padding: 10px; display: inline-block;">
                        <strong>{context.get('temp_password', '')}</strong>
                    </p>
                    <p>Please change your password after logging in.</p>
                    <p><em>Palitan po ang password pagkatapos mag-login.</em></p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">This is an automated message from {self.from_name}</p>
                </body>
                </html>
            """,
        }

        return templates.get(template_name, f"""
            <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Notification from {self.from_name}</h2>
                <p>{context.get('message', 'You have a new notification.')}</p>
                <hr>
                <p style="color: #666; font-size: 12px;">This is an automated message from {self.from_name}</p>
            </body>
            </html>
        """)

    def send_email(
        self,
        to_email: str,
        subject: str,
        template_name: str,
        context: Dict[str, Any],
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None
    ) -> bool:
        """
        Send an email using a template.

        Args:
            to_email: Recipient email address
            subject: Email subject
            template_name: Name of the template file (without .html)
            context: Dictionary of variables to substitute in template
            cc: Optional CC recipients
            bcc: Optional BCC recipients

        Returns:
            True if sent successfully, False otherwise
        """
        if not self.enabled:
            logger.warning("Email service is disabled. Set EMAIL_ENABLED=True in config.")
            return False

        if not self.user or not self.password:
            logger.error("SMTP credentials not configured")
            return False

        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email

            if cc:
                msg['Cc'] = ', '.join(cc)
            if bcc:
                msg['Bcc'] = ', '.join(bcc)

            # Render HTML content
            html_content = self._render_template(template_name, context)
            msg.attach(MIMEText(html_content, 'html', 'utf-8'))

            # Send
            recipients = [to_email]
            if cc:
                recipients.extend(cc)
            if bcc:
                recipients.extend(bcc)

            with self._create_connection() as server:
                server.sendmail(self.from_email, recipients, msg.as_string())

            logger.info(f"Email sent successfully to {to_email}: {subject}")
            return True

        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP authentication failed: {e}")
            return False
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error: {e}")
            return False
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False

    def send_payslip_notification(
        self,
        to_email: str,
        employee_name: str,
        period: str,
        net_pay: float
    ) -> bool:
        """Send payslip released notification."""
        return self.send_email(
            to_email=to_email,
            subject=f"Payslip Ready - {period} | Payslip Handa na",
            template_name='payslip_released',
            context={
                'employee_name': employee_name,
                'period': period,
                'net_pay': f"{net_pay:,.2f}",
                'date': datetime.now().strftime('%B %d, %Y'),
            }
        )

    def send_leave_approved_notification(
        self,
        to_email: str,
        employee_name: str,
        leave_type: str,
        start_date: str,
        end_date: str,
        total_days: float,
        review_notes: Optional[str] = None
    ) -> bool:
        """Send leave approved notification."""
        return self.send_email(
            to_email=to_email,
            subject=f"Leave Request Approved - {leave_type}",
            template_name='leave_approved',
            context={
                'employee_name': employee_name,
                'leave_type': leave_type,
                'start_date': start_date,
                'end_date': end_date,
                'total_days': total_days,
                'review_notes': review_notes,
            }
        )

    def send_leave_rejected_notification(
        self,
        to_email: str,
        employee_name: str,
        leave_type: str,
        start_date: str,
        end_date: str,
        review_notes: Optional[str] = None
    ) -> bool:
        """Send leave rejected notification."""
        return self.send_email(
            to_email=to_email,
            subject=f"Leave Request Rejected - {leave_type}",
            template_name='leave_rejected',
            context={
                'employee_name': employee_name,
                'leave_type': leave_type,
                'start_date': start_date,
                'end_date': end_date,
                'review_notes': review_notes,
            }
        )

    def send_correction_approved_notification(
        self,
        to_email: str,
        employee_name: str,
        date: str,
        correction_type: str,
        review_notes: Optional[str] = None
    ) -> bool:
        """Send attendance correction approved notification."""
        return self.send_email(
            to_email=to_email,
            subject=f"Attendance Correction Approved - {date}",
            template_name='correction_approved',
            context={
                'employee_name': employee_name,
                'date': date,
                'correction_type': correction_type,
                'review_notes': review_notes,
            }
        )

    def send_correction_rejected_notification(
        self,
        to_email: str,
        employee_name: str,
        date: str,
        correction_type: str,
        review_notes: Optional[str] = None
    ) -> bool:
        """Send attendance correction rejected notification."""
        return self.send_email(
            to_email=to_email,
            subject=f"Attendance Correction Rejected - {date}",
            template_name='correction_rejected',
            context={
                'employee_name': employee_name,
                'date': date,
                'correction_type': correction_type,
                'review_notes': review_notes,
            }
        )

    def send_password_reset_notification(
        self,
        to_email: str,
        employee_name: str,
        temp_password: str
    ) -> bool:
        """Send password reset notification with temporary password."""
        return self.send_email(
            to_email=to_email,
            subject="Password Reset - ICAN A&P System",
            template_name='password_reset',
            context={
                'employee_name': employee_name,
                'temp_password': temp_password,
            }
        )


# Singleton instance
email_service = EmailService()
