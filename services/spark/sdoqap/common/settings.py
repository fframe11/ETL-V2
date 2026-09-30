import os


def load_env_file(start_dir: str) -> None:
    """Walk up to 3 directories from start_dir looking for a .env file and load its
    key=value pairs into os.environ without overwriting variables already set."""
    current_dir = start_dir
    for _ in range(3):
        env_path = os.path.join(current_dir, ".env")
        if os.path.exists(env_path):
            try:
                with open(env_path, "r") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            os.environ.setdefault(k.strip(), v.strip())
            except Exception:
                pass
            break
        current_dir = os.path.dirname(current_dir)


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if value is None:
        raise RuntimeError(f"Missing required environment variable '{name}'. Set it in the environment.")
    return value
