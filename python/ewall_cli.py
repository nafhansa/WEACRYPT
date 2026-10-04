#!/usr/bin/env python3
"""WEACRYPT CLI (Weather Encryption): pulihkan data tanpa situs.

Kompatibel byte per byte dengan versi browser:
  - File .ewall v1 (PBKDF2-HMAC-SHA256 + AES-256-GCM, header 38 byte sebagai AAD)
  - Share Shamir EW-SSS1 (GF(2^8), polinomial 0x11B, checksum SHA-256 4 byte)
  - Ekspor Entropy Ledger (hash chain + proof-of-work)
  - Pesan tersegel v1 (link, fragment, atau blok armored)

Pemakaian:
  python ewall_cli.py decrypt locked-7f3a9c12.ewall
  python ewall_cli.py encrypt dokumen.pdf
  python ewall_cli.py shamir-combine share1.txt share2.txt share3.txt
  python ewall_cli.py shamir-split --k 2 --n 3
  python ewall_cli.py verify-ledger ledger-export.json
  python ewall_cli.py open-seal "https://.../open.html#v1.r...."
  python ewall_cli.py selftest
"""
from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import json
import mimetypes
import os
import re
import secrets
import struct
import sys
import unicodedata
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

try:
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
except ImportError:  # pragma: no cover
    sys.stderr.write("Paket 'cryptography' belum terpasang. Jalankan: pip install -r requirements.txt\n")
    sys.exit(2)

MAGIC = b"EWAL"
HEADER_LEN = 38
DEFAULT_ITERS = 600_000
MIN_ITERS, MAX_ITERS = 100_000, 10_000_000
ZERO_HASH = "0" * 64


class EwError(Exception):
    """Kesalahan yang aman ditampilkan ke user (tanpa detail kriptografi)."""


# ---------------------------------------------------------------- util
def _norm_pass(passphrase: str) -> bytes:
    return unicodedata.normalize("NFC", passphrase).encode("utf-8")


def derive_key(passphrase: str, salt: bytes, iters: int) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iters)
    return kdf.derive(_norm_pass(passphrase))


def b64url_decode(s: str) -> bytes:
    if not re.fullmatch(r"[A-Za-z0-9_-]*", s):
        raise EwError("base64url tidak valid")
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def b64url_encode(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _js_number(x) -> str:
    """Format angka persis seperti JSON.stringify di JavaScript (Number::toString)."""
    if isinstance(x, bool):
        return "true" if x else "false"
    if isinstance(x, int):
        return str(x)
    if x != x or x in (float("inf"), float("-inf")):
        return "null"
    if x == 0:
        return "0"
    sign = "-" if x < 0 else ""
    d = Decimal(repr(abs(x)))  # repr = digit terpendek yang round-trip, sama dengan JS
    t = d.as_tuple()
    digits = "".join(map(str, t.digits)).rstrip("0") or "0"
    k = len(digits)
    n = t.exponent + len(t.digits)  # posisi titik desimal (notasi ECMAScript)
    if k <= n <= 21:
        return sign + digits + "0" * (n - k)
    if 0 < n <= 21:
        return sign + digits[:n] + "." + digits[n:]
    if -6 < n <= 0:
        return sign + "0." + "0" * (-n) + digits
    e = n - 1
    exp = ("+" if e > 0 else "-") + str(abs(e))
    if k == 1:
        return sign + digits + "e" + exp
    return sign + digits[0] + "." + digits[1:] + "e" + exp


def canonical_json(v) -> str:
    """JSON dengan key urut alfabetis tanpa spasi; identik dengan EW.util.canonicalJSON."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return _js_number(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        return "[" + ",".join(canonical_json(i) for i in v) + "]"
    if isinstance(v, dict):
        keys = sorted(v.keys(), key=lambda k: k.encode("utf-16-be"))
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + canonical_json(v[k]) for k in keys) + "}"
    raise TypeError(type(v))


def ask_passphrase(confirm: bool = False) -> str:
    env = os.environ.get("EWALL_PASSPHRASE")
    if env is not None:  # untuk otomasi/tes; hindari di mesin bersama
        return env
    p = getpass.getpass("Passphrase: ")
    if confirm:
        if len(p) < 12:
            raise EwError("Passphrase minimal 12 karakter.")
        if getpass.getpass("Ulangi passphrase: ") != p:
            raise EwError("Kedua passphrase tidak sama.")
    return p


# ---------------------------------------------------------------- .ewall
def ewall_encrypt(data: bytes, meta: dict, passphrase: str, iters: int = DEFAULT_ITERS) -> bytes:
    salt, iv = secrets.token_bytes(16), secrets.token_bytes(12)
    header = MAGIC + bytes([1, 1]) + struct.pack(">I", iters) + salt + iv
    assert len(header) == HEADER_LEN
    meta_b = json.dumps(meta, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    pt = struct.pack(">I", len(meta_b)) + meta_b + data
    ct = AESGCM(derive_key(passphrase, salt, iters)).encrypt(iv, pt, header)
    return header + ct


def ewall_parse_header(buf: bytes) -> dict:
    if len(buf) < HEADER_LEN + 16:
        raise EwError("Bukan file .ewall v1 yang valid (terlalu pendek).")
    if buf[:4] != MAGIC:
        raise EwError("Bukan file .ewall (magic EWAL tidak ada).")
    if buf[4] != 1:
        raise EwError(f"Versi .ewall {buf[4]} tidak didukung.")
    if buf[5] != 1:
        raise EwError("KDF tidak dikenal.")
    iters = struct.unpack(">I", buf[6:10])[0]
    if not MIN_ITERS <= iters <= MAX_ITERS:
        raise EwError("Jumlah iterasi PBKDF2 di luar batas wajar.")
    return {"iters": iters, "salt": buf[10:26], "iv": buf[26:38], "header": buf[:HEADER_LEN], "ct": buf[HEADER_LEN:]}


def ewall_decrypt(buf: bytes, passphrase: str) -> tuple[dict, bytes]:
    h = ewall_parse_header(buf)
    try:
        pt = AESGCM(derive_key(passphrase, h["salt"], h["iters"])).decrypt(h["iv"], h["ct"], h["header"])
    except InvalidTag:
        raise EwError("Tidak bisa membuka. Passphrase salah atau file rusak/diubah.") from None
    if len(pt) < 4:
        raise EwError("Isi file rusak.")
    mlen = struct.unpack(">I", pt[:4])[0]
    if 4 + mlen > len(pt):
        raise EwError("Isi file rusak.")
    meta = json.loads(pt[4:4 + mlen].decode("utf-8"))
    return meta, pt[4 + mlen:]


def _safe_name(name: str) -> str:
    s = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", str(name or "file")).lstrip(".")[:180]
    return s or "file"


def _unique(path: Path) -> Path:
    if not path.exists():
        return path
    i = 1
    while True:
        cand = path.with_name(f"{path.stem} ({i}){path.suffix}")
        if not cand.exists():
            return cand
        i += 1


def cmd_encrypt(args) -> int:
    src = Path(args.file)
    data = src.read_bytes()
    meta = {
        "name": src.name,
        "type": mimetypes.guess_type(src.name)[0] or "application/octet-stream",
        "size": len(data),
        "lockedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "stamp": {"place": "Python CLI", "desc": None, "temp": None, "id": None},
    }
    out = ewall_encrypt(data, meta, ask_passphrase(confirm=True), args.iterations)
    dest = Path(args.output) if args.output else _unique(src.with_name(f"locked-{secrets.token_hex(4)}.ewall"))
    dest.write_bytes(out)
    print(f"Terkunci: {dest} ({len(out)} byte). Nama asli tersimpan di dalam file terenkripsi.")
    return 0


def cmd_decrypt(args) -> int:
    src = Path(args.file)
    meta, data = ewall_decrypt(src.read_bytes(), ask_passphrase())
    if isinstance(meta.get("size"), int) and meta["size"] != len(data):
        print(f"Peringatan: metadata menyebut {meta['size']} byte, isi {len(data)} byte.", file=sys.stderr)
    dest = Path(args.output) if args.output else _unique(src.with_name(_safe_name(meta.get("name"))))
    dest.write_bytes(data)
    print(f"Terbuka: {dest} ({len(data)} byte, tipe {meta.get('type')}, dikunci {meta.get('lockedAt')}).")
    st = meta.get("stamp") or {}
    if st.get("desc"):
        print(f"Stempel: {st.get('place')}, {st.get('temp')}°C, {st.get('desc')} (Stamp ID {st.get('id')}).")
    return 0


# ---------------------------------------------------------------- Shamir GF(2^8)
EXP = [0] * 512
LOG = [0] * 256
_x = 1
for _i in range(255):
    EXP[_i] = _x
    LOG[_x] = _i
    _x2 = _x << 1
    if _x2 & 0x100:
        _x2 ^= 0x11B
    _x = _x2 ^ _x
for _i in range(255, 512):
    EXP[_i] = EXP[_i - 255]


def gf_mul(a: int, b: int) -> int:
    return 0 if a == 0 or b == 0 else EXP[LOG[a] + LOG[b]]


def gf_div(a: int, b: int) -> int:
    if b == 0:
        raise ZeroDivisionError
    return 0 if a == 0 else EXP[(LOG[a] + 255 - LOG[b]) % 255]


SHARE_RE = re.compile(r"^EW-SSS1-(\d{1,2})of(\d{1,2})-(\d{1,2})-([0-9a-f]{4})-([0-9a-f]+)-([0-9a-f]{4})$")


def parse_share(line: str) -> dict:
    s = re.sub(r"\s+", "", line).lower()
    s = s.replace("ew-sss1", "EW-SSS1", 1) if s.startswith("ew-sss1") else s
    m = SHARE_RE.match(s)
    if not m:
        raise EwError(f"Format share tidak dikenali: {line[:24]}…")
    k, n, x = int(m[1]), int(m[2]), int(m[3])
    if not (2 <= k <= n <= 10) or not (1 <= x <= n):
        raise EwError("Nilai k/n/x tidak valid.")
    if len(m[5]) % 2 or len(m[5]) < 10:
        raise EwError("Data share terpotong.")
    body = f"EW-SSS1-{k}of{n}-{x}-{m[4]}-{m[5]}"
    if hashlib.sha256(body.encode()).hexdigest()[:4] != m[6]:
        raise EwError(f"Checksum share {x} tidak cocok. Kemungkinan salah ketik.")
    return {"k": k, "n": n, "x": x, "group": m[4], "data": bytes.fromhex(m[5])}


def shamir_split(secret: bytes, k: int, n: int) -> list[str]:
    if not (2 <= k <= n <= 10):
        raise EwError("Butuh 2 <= k <= n <= 10.")
    if not 0 < len(secret) <= 1024:
        raise EwError("Rahasia harus 1 sampai 1.024 byte.")
    payload = secret + hashlib.sha256(secret).digest()[:4]
    group = secrets.token_hex(2)
    ys = [bytearray(len(payload)) for _ in range(n)]
    for b, byte in enumerate(payload):
        coeffs = secrets.token_bytes(k - 1)
        for x in range(1, n + 1):
            acc = 0
            for c in reversed(coeffs):
                acc = gf_mul(acc, x) ^ c
            ys[x - 1][b] = gf_mul(acc, x) ^ byte
    out = []
    for i, y in enumerate(ys):
        body = f"EW-SSS1-{k}of{n}-{i + 1}-{group}-{y.hex()}"
        out.append(body + "-" + hashlib.sha256(body.encode()).hexdigest()[:4])
    return out


def shamir_combine(lines: list[str]) -> bytes:
    shares = [parse_share(l) for l in lines if l.strip()]
    if not shares:
        raise EwError("Belum ada share.")
    first = shares[0]
    for s in shares[1:]:
        if s["group"] != first["group"]:
            raise EwError(f"Share dari set berbeda (group {first['group']} dan {s['group']}) tidak bisa digabung.")
        if (s["k"], s["n"], len(s["data"])) != (first["k"], first["n"], len(first["data"])):
            raise EwError("Share tidak berasal dari set yang sama.")
    uniq = list({s["x"]: s for s in shares}.values())
    if len(uniq) < first["k"]:
        raise EwError(f"Share kurang: butuh {first['k']} share berbeda, baru ada {len(uniq)}.")
    use = uniq[: first["k"]]
    out = bytearray(len(first["data"]))
    for b in range(len(out)):
        acc = 0
        for a in use:
            num = den = 1
            for c in use:
                if c is a:
                    continue
                num = gf_mul(num, c["x"])
                den = gf_mul(den, c["x"] ^ a["x"])
            acc ^= gf_mul(a["data"][b], gf_div(num, den))
        out[b] = acc
    secret, check = bytes(out[:-4]), bytes(out[-4:])
    if hashlib.sha256(secret).digest()[:4] != check:
        raise EwError("Checksum rahasia gagal. Ada share yang salah atau bukan dari set ini.")
    return secret


def _share_lines(paths: list[str]) -> list[str]:
    lines = []
    for p in paths:
        text = sys.stdin.read() if p == "-" else Path(p).read_text(encoding="utf-8")
        lines += [l.strip() for l in text.splitlines() if l.strip().upper().startswith("EW-SSS1")]
    return lines


def cmd_shamir_combine(args) -> int:
    secret = shamir_combine(_share_lines(args.files))
    if args.output:
        Path(args.output).write_bytes(secret)
        print(f"Rahasia dipulihkan ke {args.output} ({len(secret)} byte).")
    else:
        try:
            print(secret.decode("utf-8"))
        except UnicodeDecodeError:
            print(secret.hex())
    return 0


def cmd_shamir_split(args) -> int:
    secret = (sys.stdin.read().rstrip("\n") if not sys.stdin.isatty() else getpass.getpass("Rahasia: ")).encode("utf-8")
    for s in shamir_split(secret, args.k, args.n):
        print(s)
    return 0


# ---------------------------------------------------------------- Ledger
def ledger_block_hash(block: dict) -> str:
    body = {k: v for k, v in block.items() if k != "hash"}
    return hashlib.sha256(canonical_json(body).encode("utf-8")).hexdigest()


def verify_ledger(blocks: list) -> tuple[bool, int, list[list[str]]]:
    first_bad, reasons_all = -1, []
    for i, b in enumerate(blocks):
        reasons = []
        if not isinstance(b, dict):
            reasons.append("blok tidak valid")
        else:
            if ledger_block_hash(b) != b.get("hash"):
                reasons.append("hash tidak cocok dengan isi blok")
            d = b.get("difficulty")
            if not (isinstance(d, int) and 1 <= d <= 8) or not str(b.get("hash", "")).startswith("0" * d):
                reasons.append("proof-of-work tidak memenuhi difficulty")
            if b.get("index") != i:
                reasons.append("index tidak berurutan")
            expect_prev = ZERO_HASH if i == 0 else (blocks[i - 1] or {}).get("hash")
            if b.get("prevHash") != expect_prev:
                reasons.append("prevHash tidak menunjuk blok sebelumnya")
            if i == 0 and b.get("type") != "genesis":
                reasons.append("blok pertama bukan genesis")
        if reasons and first_bad == -1:
            first_bad = i
        reasons_all.append(reasons)
    return first_bad == -1, first_bad, reasons_all


def cmd_verify_ledger(args) -> int:
    data = json.loads(Path(args.file).read_text(encoding="utf-8"))
    blocks = data if isinstance(data, list) else data.get("blocks")
    if not isinstance(blocks, list):
        raise EwError("File bukan ekspor ledger WEACRYPT.")
    ok, first_bad, reasons = verify_ledger(blocks)
    for i, b in enumerate(blocks):
        bad = first_bad != -1 and i >= first_bad
        mark = "RUSAK" if bad else "OK   "
        extra = "; ".join(reasons[i]) if reasons[i] else ("ikut tidak valid karena blok sebelumnya rusak" if bad else "")
        print(f"{mark} #{i:<4} {str(b.get('type')):<13} {str(b.get('hash'))[:16]}…  {extra}")
    print(f"\nRantai valid: {len(blocks)} blok." if ok else f"\nRantai rusak mulai blok #{first_bad}.")
    return 0 if ok else 1


# ---------------------------------------------------------------- Sealed Message
ARMOR_BEGIN = "-----BEGIN WEACRYPT SEALED MESSAGE-----"
ARMOR_END = "-----END WEACRYPT SEALED MESSAGE-----"
# Header lama (sebelum ganti nama) tetap diterima.
ARMORS = [(ARMOR_BEGIN, ARMOR_END), ("-----BEGIN ENTROPY WALL SEALED MESSAGE-----", "-----END ENTROPY WALL SEALED MESSAGE-----")]


def open_seal(text: str, passphrase: str | None = None) -> dict:
    s = text.strip()
    armor = next((a for a in ARMORS if a[0] in s), None)
    if armor:
        s = s.split(armor[0], 1)[1].split(armor[1], 1)[0]
    elif "#" in s:
        s = s.split("#", 1)[1]
    parts = re.sub(r"\s+", "", s).split(".")
    if parts[0] != "v1" or len(parts) < 5 or parts[1] not in ("r", "p"):
        raise EwError("Format pesan tersegel tidak dikenali.")
    mode = parts[1]
    salt, iv, ct = b64url_decode(parts[2]), b64url_decode(parts[3]), b64url_decode(parts[4])
    if mode == "r":
        if len(parts) != 6:
            raise EwError("Format pesan tersegel tidak dikenali.")
        key = b64url_decode(parts[5])
    else:
        if passphrase is None:
            passphrase = ask_passphrase()
        key = derive_key(passphrase, salt, DEFAULT_ITERS)
    try:
        pt = AESGCM(key).decrypt(iv, ct, ("EW-SEAL-v1|" + mode).encode())
    except InvalidTag:
        raise EwError("Tidak bisa membuka. Passphrase salah atau pesan rusak/terpotong.") from None
    return json.loads(pt.decode("utf-8"))


def cmd_open_seal(args) -> int:
    text = args.token if args.token != "-" else sys.stdin.read()
    payload = open_seal(text)
    print(payload.get("msg", ""))
    st = payload.get("stamp") or {}
    print(f"\n(Disegel {payload.get('sealedAt')} di {st.get('place')}, {st.get('desc')}, {st.get('temp')}°C)", file=sys.stderr)
    return 0


# ---------------------------------------------------------------- selftest
def cmd_selftest(_args=None) -> int:
    results = []

    def check(name, fn):
        try:
            fn()
            results.append((True, name, ""))
        except Exception as e:  # noqa: BLE001
            results.append((False, name, str(e)))

    def t_vectors():
        assert hashlib.sha256(b"abc").hexdigest() == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        assert derive_key("Entropy Wall", b"garam-bandung-16", 600000).hex() == \
            "b9a48b7ccf3be32d8490db7dab4586e3454d8622dce529ecc8bcea2e553c5940"

    def t_canonical():
        assert canonical_json({"b": 1, "a": {"d": [1, "x"], "c": None}, "e": 21.4}) == '{"a":{"c":null,"d":[1,"x"]},"b":1,"e":21.4}'
        for v, js in [(131.1, "131.1"), (2.0, "2"), (1e21, "1e+21"), (1e-7, "1e-7"), (1e16, "10000000000000000"),
                      (0.000001, "0.000001"), (-0.5, "-0.5"), (123456789.125, "123456789.125")]:
            assert _js_number(v) == js, (v, _js_number(v), js)

    def t_ewall():
        for size in (0, 1, 1000):
            data = secrets.token_bytes(size)
            f = ewall_encrypt(data, {"name": "t.bin", "type": "application/octet-stream", "size": size}, "passphrase-uji-123", 100000)
            meta, out = ewall_decrypt(f, "passphrase-uji-123")
            assert out == data and meta["name"] == "t.bin"
        bad = bytearray(f)
        bad[20] ^= 1
        try:
            ewall_decrypt(bytes(bad), "passphrase-uji-123")
            raise AssertionError("header diubah harus ditolak")
        except EwError:
            pass

    def t_shamir():
        from itertools import combinations
        secret = "abandon ability able about above absent absorb abstract".encode()
        for n in range(2, 6):
            for k in range(2, n + 1):
                sh = shamir_split(secret, k, n)
                for sub in combinations(sh, k):
                    assert shamir_combine(list(sub)) == secret
                if k > 2:
                    try:
                        shamir_combine(sh[: k - 1])
                        raise AssertionError("k-1 share harus ditolak")
                    except EwError:
                        pass

    def t_ledger():
        chain = []
        for i in range(3):
            b = {"index": i, "timestamp": "2026-10-04T07:05:12.345Z", "type": "password" if i else "genesis",
                 "meta": {"bits": 131.1, "length": 20} if i else {}, "weatherDigest": "00" * 32,
                 "stamp": {"place": "Bandung", "desc": "uji", "temp": 21.4, "sky": "rain"},
                 "prevHash": chain[-1]["hash"] if chain else ZERO_HASH, "difficulty": 2, "nonce": 0}
            while True:
                h = ledger_block_hash(b)
                if h.startswith("00"):
                    b["hash"] = h
                    break
                b["nonce"] += 1
            chain.append(b)
        assert verify_ledger(chain)[0]
        chain[1]["meta"]["bits"] = 40
        ok, first_bad, _ = verify_ledger(chain)
        assert not ok and first_bad == 1

    def t_seal():
        key, iv = secrets.token_bytes(32), secrets.token_bytes(12)
        pt = json.dumps({"v": 1, "msg": "halo 🌧", "sealedAt": "2026-10-04T07:05:00Z"}).encode()
        ct = AESGCM(key).encrypt(iv, pt, b"EW-SEAL-v1|r")
        tok = ".".join(["v1", "r", "", b64url_encode(iv), b64url_encode(ct), b64url_encode(key)])
        assert open_seal("https://x/open.html#" + tok)["msg"] == "halo 🌧"

    check("Vektor SHA-256 dan PBKDF2", t_vectors)
    check("canonicalJSON = JavaScript", t_canonical)
    check(".ewall round trip + tamper", t_ewall)
    check("Shamir semua kombinasi n <= 5", t_shamir)
    check("Ledger mendeteksi manipulasi", t_ledger)
    check("Sealed Message mode r", t_seal)
    for ok, name, err in results:
        print(("PASS " if ok else "FAIL ") + name + (f": {err}" if err else ""))
    fails = sum(1 for r in results if not r[0])
    print("\nSemua PASS." if not fails else f"\n{fails} FAIL.")
    return 1 if fails else 0


# ---------------------------------------------------------------- main
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="ewall_cli.py", description="WEACRYPT CLI: buka .ewall, gabungkan share, verifikasi ledger, secara offline.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("encrypt", help="kunci file menjadi .ewall")
    p.add_argument("file")
    p.add_argument("-o", "--output")
    p.add_argument("--iterations", type=int, default=DEFAULT_ITERS)
    p.set_defaults(fn=cmd_encrypt)
    p = sub.add_parser("decrypt", help="buka file .ewall")
    p.add_argument("file")
    p.add_argument("-o", "--output")
    p.set_defaults(fn=cmd_decrypt)
    p = sub.add_parser("shamir-combine", help="gabungkan share EW-SSS1 (file berisi satu share per baris, '-' untuk stdin)")
    p.add_argument("files", nargs="+")
    p.add_argument("-o", "--output")
    p.set_defaults(fn=cmd_shamir_combine)
    p = sub.add_parser("shamir-split", help="pecah rahasia (dari stdin atau prompt) jadi share EW-SSS1")
    p.add_argument("--k", type=int, required=True)
    p.add_argument("--n", type=int, required=True)
    p.set_defaults(fn=cmd_shamir_split)
    p = sub.add_parser("verify-ledger", help="verifikasi ekspor Entropy Ledger")
    p.add_argument("file")
    p.set_defaults(fn=cmd_verify_ledger)
    p = sub.add_parser("open-seal", help="buka pesan tersegel dari link, fragment, atau blok armored ('-' untuk stdin)")
    p.add_argument("token")
    p.set_defaults(fn=cmd_open_seal)
    p = sub.add_parser("selftest", help="jalankan test vector dan uji kompatibilitas")
    p.set_defaults(fn=cmd_selftest)
    args = ap.parse_args(argv)
    try:
        return args.fn(args)
    except EwError as e:
        print(f"Gagal: {e}", file=sys.stderr)
        return 1
    except FileNotFoundError as e:
        print(f"Gagal: file tidak ditemukan: {e.filename}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
