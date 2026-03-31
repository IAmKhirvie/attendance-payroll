"""
Notion Sync Service
====================
Sync employee data from Notion Teacher's Database to A&P system.
READ-ONLY from Notion - only pulls data, never writes to Notion.
"""

import httpx
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
import re

from app.models.employee import Employee
from app.models.audit import AuditLog, AuditAction


# Notion API configuration
NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

# Teacher's Database ID (extracted from URL)
TEACHERS_DATABASE_ID = "1abd37d6663080ae9307ddbee22c48b1"


def parse_time_to_ampm(time_str: str) -> Optional[str]:
    """
    Convert Notion time format (e.g., '8am', '5pm') to AM/PM format (e.g., '08:00 AM', '05:00 PM').
    """
    if not time_str:
        return None

    time_str = time_str.lower().strip()
    match = re.match(r'^(\d{1,2})(am|pm)$', time_str)
    if not match:
        return None

    hour = int(match.group(1))
    period = match.group(2).upper()

    return f"{hour:02d}:00 {period}"


def get_notion_teachers(api_key: str) -> List[Dict[str, Any]]:
    """
    Fetch all teachers from Notion database.
    Returns list of teacher records with normalized data.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
    }

    teachers = []
    has_more = True
    start_cursor = None

    while has_more:
        payload = {"page_size": 100}
        if start_cursor:
            payload["start_cursor"] = start_cursor

        response = httpx.post(
            f"{NOTION_API_BASE}/databases/{TEACHERS_DATABASE_ID}/query",
            headers=headers,
            json=payload,
            timeout=30.0
        )

        if response.status_code != 200:
            raise Exception(f"Notion API error: {response.status_code} - {response.text}")

        data = response.json()

        for page in data.get("results", []):
            teacher = parse_notion_page(page)
            if teacher:
                teachers.append(teacher)

        has_more = data.get("has_more", False)
        start_cursor = data.get("next_cursor")

    return teachers


def parse_notion_page(page: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Parse a Notion page into a normalized teacher record.
    """
    props = page.get("properties", {})

    def get_title(prop):
        """Extract text from title property."""
        if not prop or prop.get("type") != "title":
            return None
        title_list = prop.get("title", [])
        if not title_list:
            return None
        return "".join([t.get("plain_text", "") for t in title_list])

    def get_text(prop):
        """Extract text from rich_text property."""
        if not prop:
            return None
        if prop.get("type") == "rich_text":
            rich_text = prop.get("rich_text", [])
            if not rich_text:
                return None
            return "".join([t.get("plain_text", "") for t in rich_text])
        return None

    def get_select(prop):
        """Extract value from select property."""
        if not prop or prop.get("type") != "select":
            return None
        select = prop.get("select")
        if not select:
            return None
        return select.get("name")

    def get_multi_select(prop):
        """Extract values from multi_select property."""
        if not prop or prop.get("type") != "multi_select":
            return []
        return [opt.get("name") for opt in prop.get("multi_select", [])]

    def get_email(prop):
        """Extract email from email property."""
        if not prop or prop.get("type") != "email":
            return None
        return prop.get("email")

    def get_phone(prop):
        """Extract phone from phone_number property."""
        if not prop or prop.get("type") != "phone_number":
            return None
        return prop.get("phone_number")

    def get_unique_id(prop):
        """Extract unique_id value."""
        if not prop or prop.get("type") != "unique_id":
            return None
        unique_id = prop.get("unique_id")
        if not unique_id:
            return None
        prefix = unique_id.get("prefix", "")
        number = unique_id.get("number", "")
        return f"{prefix}-{number}" if prefix else str(number)

    # Extract all fields
    full_name = get_title(props.get("Full Name"))
    if not full_name:
        return None  # Skip records without name

    # Parse nickname from full name format "[Nickname] Full Name"
    nickname = get_text(props.get("Nickname"))

    # Clean full name (remove nickname prefix if present)
    clean_name = full_name
    if full_name.startswith("[") and "]" in full_name:
        clean_name = full_name.split("]", 1)[1].strip()

    return {
        "notion_id": page.get("id"),
        "teacher_id": get_unique_id(props.get("Teacher ID")),
        "full_name": clean_name,
        "nickname": nickname,
        "first_name": get_text(props.get("First Name")),
        "last_name": get_text(props.get("Last Name")),
        "email": get_email(props.get("Email")),
        "phone": get_phone(props.get("Contact Number")),
        "status": get_select(props.get("Status")),  # Active, Inactive, Break
        "start_time": get_select(props.get("Start Time")),  # 8am, 9am, etc.
        "end_time": get_select(props.get("End Time")),  # 5pm, 6pm, etc.
        "position": get_multi_select(props.get("Position")),  # ["Teacher", "Administrative"]
        "designation": get_multi_select(props.get("Designation")),  # ["Teacher", "Coordinator", "Administrator"]
        "major": get_text(props.get("Major")),
    }


def sync_notion_to_employees(
    db: Session,
    api_key: str,
    admin_user_id: Optional[int] = None,
    admin_email: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sync teachers from Notion to A&P employees.

    Matching logic:
    1. Match by email (exact)
    2. Match by name (first + last)
    3. Match by Teacher ID in employee_no

    Sync behavior:
    - Updates status based on Notion status
    - Updates schedule (call_time, time_out) from Notion
    - Updates contact info if empty in A&P
    - Does NOT create new employees (only updates existing)
    """
    results = {
        "synced": 0,
        "skipped": 0,
        "not_found": 0,
        "errors": [],
        "details": []
    }

    try:
        teachers = get_notion_teachers(api_key)
    except Exception as e:
        results["errors"].append(f"Failed to fetch from Notion: {str(e)}")
        return results

    for teacher in teachers:
        try:
            # Try to find matching employee
            employee = None
            match_method = None

            # 1. Match by email
            if teacher.get("email"):
                employee = db.query(Employee).filter(
                    func.lower(Employee.email) == teacher["email"].lower()
                ).first()
                if employee:
                    match_method = "email"

            # 2. Match by first + last name
            if not employee and teacher.get("first_name") and teacher.get("last_name"):
                employee = db.query(Employee).filter(
                    func.lower(Employee.first_name) == teacher["first_name"].lower(),
                    func.lower(Employee.last_name) == teacher["last_name"].lower()
                ).first()
                if employee:
                    match_method = "name"

            # 3. Match by full name (fuzzy matching)
            if not employee and teacher.get("full_name"):
                notion_name = teacher["full_name"].lower().strip()
                notion_parts = notion_name.split()

                # Try to find employee where all name parts match
                all_employees = db.query(Employee).filter(Employee.is_active == True).all()
                for emp in all_employees:
                    emp_full = emp.full_name.lower()
                    # Check if all parts of Notion name are in employee full name
                    if all(part in emp_full for part in notion_parts):
                        employee = emp
                        match_method = "full_name"
                        break
                    # Also check reverse - all parts of employee name in Notion name
                    emp_parts = emp_full.split()
                    if all(part in notion_name for part in emp_parts):
                        employee = emp
                        match_method = "full_name"
                        break

            # 4. Match by Teacher ID (ICN-XXX) in employee_no
            if not employee and teacher.get("teacher_id"):
                employee = db.query(Employee).filter(
                    Employee.employee_no == teacher["teacher_id"]
                ).first()
                if employee:
                    match_method = "teacher_id"

            if not employee:
                results["not_found"] += 1
                results["details"].append({
                    "teacher": teacher["full_name"],
                    "teacher_id": teacher.get("teacher_id"),
                    "action": "not_found",
                    "reason": "No matching employee in A&P"
                })
                continue

            # Track changes for audit log
            changes = {}
            old_values = {}

            # Update employee_no to match ICN Teacher ID
            if teacher.get("teacher_id") and employee.employee_no != teacher["teacher_id"]:
                old_values["employee_no"] = employee.employee_no
                changes["employee_no"] = teacher["teacher_id"]
                employee.employee_no = teacher["teacher_id"]

            # Map Notion status to A&P status
            notion_status = teacher.get("status")
            if notion_status:
                new_status = None
                new_is_active = None

                if notion_status == "Active":
                    new_status = "active"
                    new_is_active = True
                elif notion_status == "Inactive":
                    new_status = "inactive"
                    new_is_active = False
                elif notion_status == "Break":
                    new_status = "inactive"  # Treat break as inactive
                    new_is_active = False

                if new_status and employee.status != new_status:
                    old_values["status"] = employee.status
                    changes["status"] = new_status
                    employee.status = new_status

                if new_is_active is not None and employee.is_active != new_is_active:
                    old_values["is_active"] = employee.is_active
                    changes["is_active"] = new_is_active
                    employee.is_active = new_is_active

            # Update schedule from Notion (AM/PM format)
            start_time = parse_time_to_ampm(teacher.get("start_time"))
            end_time = parse_time_to_ampm(teacher.get("end_time"))

            if start_time and employee.call_time != start_time:
                old_values["call_time"] = employee.call_time
                changes["call_time"] = start_time
                employee.call_time = start_time

            if end_time and employee.time_out != end_time:
                old_values["time_out"] = employee.time_out
                changes["time_out"] = end_time
                employee.time_out = end_time

            # Update contact info if empty in A&P
            if teacher.get("email") and not employee.email:
                old_values["email"] = employee.email
                changes["email"] = teacher["email"]
                employee.email = teacher["email"]

            if teacher.get("phone") and not employee.phone:
                old_values["phone"] = employee.phone
                changes["phone"] = teacher["phone"]
                employee.phone = teacher["phone"]

            # Update position if available
            position_list = teacher.get("position", [])
            if position_list:
                position_str = ", ".join(position_list)
                if employee.position != position_str:
                    old_values["position"] = employee.position
                    changes["position"] = position_str
                    employee.position = position_str

            if changes:
                results["synced"] += 1
                results["details"].append({
                    "teacher": teacher["full_name"],
                    "teacher_id": teacher.get("teacher_id"),
                    "employee_id": employee.id,
                    "employee_no": employee.employee_no,
                    "action": "updated",
                    "match_method": match_method,
                    "changes": changes
                })

                # Create audit log
                audit_log = AuditLog(
                    user_id=admin_user_id,
                    user_email=admin_email,
                    action=AuditAction.EMPLOYEE_UPDATE,
                    resource_type="employee",
                    resource_id=str(employee.id),
                    old_value=old_values,
                    new_value=changes,
                    reason="Synced from Notion",
                    extra_data={
                        "employee_name": employee.full_name,
                        "employee_no": employee.employee_no,
                        "notion_teacher_id": teacher.get("teacher_id"),
                        "sync_source": "notion"
                    }
                )
                db.add(audit_log)
            else:
                results["skipped"] += 1
                results["details"].append({
                    "teacher": teacher["full_name"],
                    "teacher_id": teacher.get("teacher_id"),
                    "employee_id": employee.id,
                    "action": "skipped",
                    "reason": "No changes needed"
                })

        except Exception as e:
            results["errors"].append(f"Error processing {teacher.get('full_name', 'Unknown')}: {str(e)}")

    db.commit()

    return results


def preview_notion_sync(api_key: str, db: Session) -> Dict[str, Any]:
    """
    Preview what would be synced without making changes.
    """
    results = {
        "total_teachers": 0,
        "would_sync": 0,
        "would_skip": 0,
        "not_found": 0,
        "teachers": []
    }

    try:
        teachers = get_notion_teachers(api_key)
        results["total_teachers"] = len(teachers)
    except Exception as e:
        results["error"] = str(e)
        return results

    for teacher in teachers:
        teacher_info = {
            "teacher_id": teacher.get("teacher_id"),
            "name": teacher["full_name"],
            "email": teacher.get("email"),
            "status": teacher.get("status"),
            "schedule": f"{teacher.get('start_time', '-')} - {teacher.get('end_time', '-')}",
            "matched_employee": None,
            "match_method": None,
            "would_change": []
        }

        # Try to find matching employee
        employee = None

        if teacher.get("email"):
            employee = db.query(Employee).filter(
                func.lower(Employee.email) == teacher["email"].lower()
            ).first()
            if employee:
                teacher_info["match_method"] = "email"

        if not employee and teacher.get("first_name") and teacher.get("last_name"):
            employee = db.query(Employee).filter(
                func.lower(Employee.first_name) == teacher["first_name"].lower(),
                func.lower(Employee.last_name) == teacher["last_name"].lower()
            ).first()
            if employee:
                teacher_info["match_method"] = "name"

        # Match by full name (fuzzy matching)
        if not employee and teacher.get("full_name"):
            notion_name = teacher["full_name"].lower().strip()
            notion_parts = notion_name.split()

            all_employees = db.query(Employee).filter(Employee.is_active == True).all()
            for emp in all_employees:
                emp_full = emp.full_name.lower()
                if all(part in emp_full for part in notion_parts):
                    employee = emp
                    teacher_info["match_method"] = "full_name"
                    break
                emp_parts = emp_full.split()
                if all(part in notion_name for part in emp_parts):
                    employee = emp
                    teacher_info["match_method"] = "full_name"
                    break

        if not employee and teacher.get("teacher_id"):
            employee = db.query(Employee).filter(
                Employee.employee_no == teacher["teacher_id"]
            ).first()
            if employee:
                teacher_info["match_method"] = "teacher_id"

        if employee:
            teacher_info["matched_employee"] = {
                "id": employee.id,
                "employee_no": employee.employee_no,
                "name": employee.full_name,
                "current_status": employee.status,
                "current_schedule": f"{employee.call_time or '-'} - {employee.time_out or '-'}"
            }

            # Check what would change
            # Employee number (ICN ID)
            if teacher.get("teacher_id") and employee.employee_no != teacher["teacher_id"]:
                teacher_info["would_change"].append(f"employee_no: {employee.employee_no} → {teacher['teacher_id']}")

            # Status
            notion_status = teacher.get("status")
            if notion_status:
                ap_status = "active" if notion_status == "Active" else "inactive"
                if employee.status != ap_status:
                    teacher_info["would_change"].append(f"status: {employee.status} → {ap_status}")

            # Schedule (AM/PM format)
            start_time = parse_time_to_ampm(teacher.get("start_time"))
            end_time = parse_time_to_ampm(teacher.get("end_time"))

            if start_time and employee.call_time != start_time:
                teacher_info["would_change"].append(f"call_time: {employee.call_time} → {start_time}")
            if end_time and employee.time_out != end_time:
                teacher_info["would_change"].append(f"time_out: {employee.time_out} → {end_time}")

            # Position
            position_list = teacher.get("position", [])
            if position_list:
                position_str = ", ".join(position_list)
                if employee.position != position_str:
                    teacher_info["would_change"].append(f"position: {employee.position} → {position_str}")

            if teacher_info["would_change"]:
                results["would_sync"] += 1
            else:
                results["would_skip"] += 1
        else:
            results["not_found"] += 1

        results["teachers"].append(teacher_info)

    return results
