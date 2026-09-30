from urllib.parse import urlparse


def es_base_and_auth(url: str):
    """Split http://user:pass@host:port into ('http://host:port', (user, pass) | None)."""
    parsed = urlparse(url)
    auth = (parsed.username, parsed.password) if parsed.username else None
    return f"{parsed.scheme}://{parsed.hostname}:{parsed.port}", auth
