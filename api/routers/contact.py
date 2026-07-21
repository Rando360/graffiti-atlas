"""
contact.py — Contact form route for GraffitiAtlas.

Uses Gmail SMTP with an App Password (no new services, free forever).

Setup:
  1. Enable 2-Step Verification on your Google account
     https://myaccount.google.com/security

  2. Create an App Password:
     Google Account → Security → 2-Step Verification → App passwords
     Name it "GraffitiAtlas" and copy the 16-char password.

  3. Add to your .env:
       GMAIL_ADDRESS=you@gmail.com
       GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
       CONTACT_RECIPIENT=you@gmail.com   # optional, defaults to GMAIL_ADDRESS
"""

import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, field_validator

logger = logging.getLogger(__name__)

router = APIRouter()


class ContactMessage(BaseModel):
    name: str
    email: EmailStr
    subject: str = ""
    message: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        if len(v) > 120:
            raise ValueError("Name too long")
        return v

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message is required")
        if len(v) > 5000:
            raise ValueError("Message too long (max 5000 chars)")
        return v

    @field_validator("subject")
    @classmethod
    def sanitise_subject(cls, v: str) -> str:
        return v.strip()[:200]


@router.post("/contact")
async def send_contact(msg: ContactMessage):
    """
    Receive a contact form submission and forward it to the owner's Gmail.
    The Reply-To header is set to the sender's email so you can reply directly.
    """
    gmail_address = os.getenv("GMAIL_ADDRESS")
    app_password  = os.getenv("GMAIL_APP_PASSWORD")
    recipient     = os.getenv("CONTACT_RECIPIENT", gmail_address)

    if not gmail_address or not app_password:
        logger.error("GMAIL_ADDRESS or GMAIL_APP_PASSWORD not set")
        raise HTTPException(status_code=500, detail="Email service not configured")

    subject_line = (
        f"GraffitiAtlas — {msg.subject}" if msg.subject
        else f"GraffitiAtlas contact from {msg.name}"
    )

    plain = f"""\
New message from the GraffitiAtlas contact form
------------------------------------------------
Name    : {msg.name}
Email   : {msg.email}
Subject : {msg.subject or '(none)'}

{msg.message}
------------------------------------------------
Reply directly to this email to reach {msg.name}.
"""

    html = f"""\
<!DOCTYPE html>
<html>
<body style="font-family:Inter,Arial,sans-serif;color:#2A2520;max-width:560px;margin:0 auto;padding:24px">
  <div style="border-left:4px solid #E85D26;padding-left:16px;margin-bottom:24px">
    <h2 style="margin:0;font-size:18px;color:#E85D26">GraffitiAtlas</h2>
    <p style="margin:4px 0 0;font-size:13px;color:#6E675C">New contact form message</p>
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
    <tr>
      <td style="padding:8px 12px;background:#FAF8F2;font-weight:600;width:90px;border:1px solid #E9E5DA">Name</td>
      <td style="padding:8px 12px;border:1px solid #E9E5DA">{msg.name}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;background:#FAF8F2;font-weight:600;border:1px solid #E9E5DA">Email</td>
      <td style="padding:8px 12px;border:1px solid #E9E5DA"><a href="mailto:{msg.email}">{msg.email}</a></td>
    </tr>
    {"" if not msg.subject else f'''
    <tr>
      <td style="padding:8px 12px;background:#FAF8F2;font-weight:600;border:1px solid #E9E5DA">Subject</td>
      <td style="padding:8px 12px;border:1px solid #E9E5DA">{msg.subject}</td>
    </tr>'''}
  </table>

  <div style="background:#FDFCF8;border:1px solid #E9E5DA;border-radius:8px;padding:16px;font-size:14px;line-height:1.6;white-space:pre-wrap">{msg.message}</div>

  <p style="font-size:11px;color:#8A8378;margin-top:20px">
    Hit Reply to respond directly to {msg.name} at {msg.email}.
  </p>
</body>
</html>
"""

    mime = MIMEMultipart("alternative")
    mime["Subject"]  = subject_line
    mime["From"]     = f"GraffitiAtlas <{gmail_address}>"
    mime["To"]       = recipient
    mime["Reply-To"] = f"{msg.name} <{msg.email}>"

    mime.attach(MIMEText(plain, "plain"))
    mime.attach(MIMEText(html,  "html"))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.ehlo()
            server.starttls()
            server.login(gmail_address, app_password)
            server.sendmail(gmail_address, recipient, mime.as_string())
    except smtplib.SMTPAuthenticationError:
        logger.error("Gmail authentication failed — check GMAIL_APP_PASSWORD")
        raise HTTPException(status_code=500, detail="Email authentication failed")
    except smtplib.SMTPException as exc:
        logger.error("SMTP error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to send email")

    return {"ok": True}
