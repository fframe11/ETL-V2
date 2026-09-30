import os
import hmac
import time
import base64
import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

SESSION_COOKIE_NAME = "sdoqap_session"
SESSION_TTL_SECONDS = 12 * 60 * 60  # 12 hours


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable '{name}'. Session auth cannot start "
            f"without it — set it in .env. See README.md 'Required Environment Variables'."
        )
    return value


def _secret_key() -> bytes:
    return _required_env("SESSION_SECRET_KEY").encode("utf-8")


def create_session_token(username: str) -> str:
    expiry = int(time.time()) + SESSION_TTL_SECONDS
    payload = f"{username}:{expiry}"
    payload_b64 = base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")
    sig = hmac.new(_secret_key(), payload_b64.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def verify_session_token(token: str):
    """Returns the username if the token is valid and unexpired, else None."""
    if not token or "." not in token:
        return None
    payload_b64, _, sig = token.partition(".")
    expected_sig = hmac.new(_secret_key(), payload_b64.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return None
    try:
        payload = base64.urlsafe_b64decode(payload_b64.encode("ascii")).decode("utf-8")
        username, expiry_str = payload.rsplit(":", 1)
        expiry = int(expiry_str)
    except Exception:
        return None
    if time.time() > expiry:
        return None
    return username


def _cookie_secure() -> bool:
    return os.getenv("SESSION_COOKIE_SECURE", "false").strip().lower() == "true"


def require_session(request: Request) -> str:
    """FastAPI dependency: raises 401 unless a valid session cookie is present.
    Returns the authenticated username on success."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    username = verify_session_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in.")
    return username


def require_webhook_secret(request: Request) -> None:
    """FastAPI dependency for machine-to-machine webhooks (e.g. Grafana alerting) that
    cannot perform a browser login. Checks the X-Webhook-Secret header against
    ALERT_WEBHOOK_SECRET."""
    provided = request.headers.get("X-Webhook-Secret")
    expected = _required_env("ALERT_WEBHOOK_SECRET")
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Missing or invalid X-Webhook-Secret header.")


def require_session_or_service_key(request: Request) -> str:
    """FastAPI dependency for endpoints called both by the logged-in browser UI (session
    cookie) and by the n8n orchestrator (machine-to-machine, X-Service-Key header) — e.g.
    the ingestion endpoints. Returns a caller identifier on success."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    username = verify_session_token(token)
    if username:
        return username

    service_key = request.headers.get("X-Service-Key")
    expected = os.getenv("INGEST_SERVICE_KEY")
    if service_key and expected and hmac.compare_digest(service_key, expected):
        return "service:n8n"

    raise HTTPException(status_code=401, detail="Not authenticated. Provide a session cookie or a valid X-Service-Key header.")


class LoginPayload(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(payload: LoginPayload, response: Response):
    admin_username = _required_env("ADMIN_USERNAME")
    admin_password = _required_env("ADMIN_PASSWORD")

    username_ok = hmac.compare_digest(payload.username, admin_username)
    password_ok = hmac.compare_digest(payload.password, admin_password)
    if not (username_ok and password_ok):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = create_session_token(admin_username)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        path="/",
    )
    return {"status": "success", "username": admin_username}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return {"status": "success"}


@router.get("/me")
def me(username: str = Depends(require_session)):
    return {"username": username}
