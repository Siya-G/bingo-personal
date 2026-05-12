"""MVP-only salted hashes for host PIN and player session tokens.

Production deployments should replace this with a managed identity provider,
rotating session tokens, Argon2id/bcrypt via a dedicated auth service, and
policies for lockouts and auditing. This module exists so secrets are never
stored in plaintext while keeping the dependency footprint small.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from typing import Final

_ITERATIONS: Final[int] = 120_000
_DK_LEN: Final[int] = 32


def hash_secret(plain: str) -> tuple[str, str]:
    """Return (salt_hex, digest_hex) suitable for persistence."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        plain.encode("utf-8"),
        salt,
        _ITERATIONS,
        dklen=_DK_LEN,
    )
    return salt.hex(), digest.hex()


def verify_secret(plain: str, salt_hex: str, digest_hex: str) -> bool:
    """Constant-time compare of a candidate secret to stored hash."""
    try:
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        plain.encode("utf-8"),
        salt,
        _ITERATIONS,
        dklen=_DK_LEN,
    )
    return hmac.compare_digest(digest, expected)
