"""Gera um novo par de chaves VAPID (EC P-256) para Web Push.

Rodar uma vez e colar a saída no .env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).
Trocar as chaves invalida todas as subscriptions existentes (usuários
precisam reativar a notificação).
"""
import base64

from cryptography.hazmat.primitives.asymmetric import ec

private_key = ec.generate_private_key(ec.SECP256R1())
public_numbers = private_key.public_key().public_numbers()

x = public_numbers.x.to_bytes(32, "big")
y = public_numbers.y.to_bytes(32, "big")
public_raw = b"\x04" + x + y  # ponto EC não-comprimido — formato exigido pelo applicationServerKey
public_b64 = base64.urlsafe_b64encode(public_raw).rstrip(b"=").decode()

private_raw = private_key.private_numbers().private_value.to_bytes(32, "big")
private_b64 = base64.urlsafe_b64encode(private_raw).rstrip(b"=").decode()

print(f"VAPID_PUBLIC_KEY={public_b64}")
print(f"VAPID_PRIVATE_KEY={private_b64}")
