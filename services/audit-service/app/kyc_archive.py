"""Tamper-evident KYC document archival to S3.

The audit-service is the system of record for sensitive customer document
retention. Whenever a KYC verification completes (driving licence, address
proof, etc.), the upstream service POSTs the document blob here. We persist:

  1. An audit_entries row pointing at the S3 object key (in PostgreSQL)
  2. The document payload itself in S3 (encrypted at rest, versioned)

In the workshop sample the bucket name is injected by the CDK stack via the
``KYC_BUCKET_NAME`` environment variable. In local docker-compose the bucket
is unset and the route returns 503 — local development does not exercise the
S3 path.

Lab 2 (`demo/lab2-iam-s3-deny`) revokes the audit-service task role's
``s3:PutObject`` on the bucket. After injection, attempted KYC archival
calls return 502 with an AccessDenied message that the DevOps Agent then
correlates against CloudTrail.
"""

from __future__ import annotations

import base64
import logging
import os
from datetime import datetime
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

import sys
sys.path.insert(0, "/app")
from shared.middleware import get_current_user, TokenPayload  # noqa: E402


logger = logging.getLogger(__name__)


KYC_BUCKET_NAME = os.environ.get("KYC_BUCKET_NAME", "")
_s3_client = None


def _s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3")
    return _s3_client


class KycArchiveRequest(BaseModel):
    customer_id: str = Field(..., description="Customer UUID this document belongs to")
    document_type: str = Field(..., description="Document type, e.g. DRIVERS_LICENCE")
    content_type: str = Field("application/octet-stream")
    content_b64: str = Field(..., description="Base64-encoded document payload")
    metadata: Optional[dict] = Field(default_factory=dict)


class KycArchiveResponse(BaseModel):
    bucket: str
    key: str
    size_bytes: int
    archived_at: datetime


router = APIRouter(prefix="/api/v1/audit/kyc", tags=["audit", "kyc"])


@router.post("/archive", response_model=KycArchiveResponse)
def archive_kyc_document(
    payload: KycArchiveRequest,
    current_user: TokenPayload = Depends(get_current_user),
) -> KycArchiveResponse:
    """Persist a KYC document to S3 with server-side encryption.

    Returns 503 if the service is not configured with a KYC bucket
    (e.g. local docker-compose), 502 if S3 returns AccessDenied or any
    other client error.
    """
    if not KYC_BUCKET_NAME:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="KYC bucket is not configured (KYC_BUCKET_NAME unset).",
        )

    try:
        body = base64.b64decode(payload.content_b64, validate=True)
    except (ValueError, base64.binascii.Error) as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"content_b64 is not valid base64: {exc}",
        )

    now = datetime.utcnow()
    key = (
        f"customers/{payload.customer_id}/"
        f"{now.strftime('%Y/%m/%d')}/"
        f"{payload.document_type}-{now.strftime('%Y%m%dT%H%M%S')}.bin"
    )

    metadata = {
        "customer-id": payload.customer_id,
        "document-type": payload.document_type,
        "actor-id": current_user.sub,
        "actor-username": current_user.username,
    }
    if payload.metadata:
        for k, v in payload.metadata.items():
            metadata[f"x-{k}"] = str(v)

    try:
        _s3().put_object(
            Bucket=KYC_BUCKET_NAME,
            Key=key,
            Body=body,
            ContentType=payload.content_type,
            ServerSideEncryption="AES256",
            Metadata=metadata,
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "Unknown")
        msg = exc.response.get("Error", {}).get("Message", str(exc))
        logger.warning(
            "kyc_archive_failed customer=%s code=%s message=%s",
            payload.customer_id, code, msg,
        )
        # AccessDenied propagates as 502 so the agent sees an upstream
        # dependency failure (rather than the audit-service being "down").
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"S3 PutObject failed: {code} - {msg}",
        )
    except BotoCoreError as exc:
        logger.warning("kyc_archive_botocore_error customer=%s err=%s", payload.customer_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"S3 transport error: {exc}",
        )

    return KycArchiveResponse(
        bucket=KYC_BUCKET_NAME,
        key=key,
        size_bytes=len(body),
        archived_at=now,
    )
