"""
Broker-password decryption, for the direct database path.

The copier-gateway used to be the only thing holding ENCRYPTION_KEY, so every
runtime-config read had to go through it. With the worker reading its config
straight from the database it receives the ciphertext as stored, and decrypts
it here.

Byte-compatible with the gateway (supabase/functions/copier-gateway/index.ts)
and with delta_engine's original backend: AES-256-GCM, a 12-byte nonce, no
associated data, base64(nonce || ciphertext || tag).

Holding the key on the Windows machine is not a new exposure: that machine
already receives every broker password in plaintext -- MT5 needs it to log in.
"""

from __future__ import annotations

import base64
import binascii
from typing import Optional

NONCE_BYTES = 12


class CredentialError(Exception):
    """The key is missing or wrong, or the stored blob is not ours."""


def parse_key(hex_key: Optional[str]) -> Optional[bytes]:
    """The 32-byte key from its 64-hex-character form, or None when unset."""
    text = (hex_key or "").strip()
    if not text:
        return None
    if len(text) != 64:
        raise CredentialError("ENCRYPTION_KEY must be 64 hex characters (256 bits).")
    try:
        return binascii.unhexlify(text)
    except (binascii.Error, ValueError) as exc:
        raise CredentialError("ENCRYPTION_KEY must be 64 hex characters (256 bits).") from exc


def decrypt_password(encrypted_b64: str, key: bytes) -> str:
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    try:
        blob = base64.b64decode(encrypted_b64)
    except (binascii.Error, ValueError, TypeError) as exc:
        raise CredentialError("stored password is not valid base64") from exc
    if len(blob) <= NONCE_BYTES:
        raise CredentialError("stored password is too short")
    try:
        plain = AESGCM(key).decrypt(blob[:NONCE_BYTES], blob[NONCE_BYTES:], None)
    except InvalidTag as exc:
        # The one failure that matters: the key is not the one the password was
        # encrypted with. Every account under it is unusable until fixed.
        raise CredentialError(
            "password does not decrypt with this ENCRYPTION_KEY -- it must be the "
            "same value as the copier-gateway secret"
        ) from exc
    return plain.decode("utf-8")


def encrypt_password(plaintext: str, key: bytes) -> str:
    """The inverse, for tests: proves compatibility with the stored format."""
    import os

    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    nonce = os.urandom(NONCE_BYTES)
    return base64.b64encode(nonce + AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)).decode()
