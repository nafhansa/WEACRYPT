"""Uji kompatibilitas browser <-> CLI.

Fixture di tests/fixtures/ dibuat oleh kode JavaScript Entropy Wall yang sama dengan yang
berjalan di browser (js/core/crypto.js, shamir.js, ledger.js). Jalankan:
    python -m pytest python/tests      atau      python -m unittest discover python/tests
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import ewall_cli as cli  # noqa: E402

FIX = HERE / "fixtures"
PASS = "kawah-putih-ciwidey-2026"


class BrowserToCli(unittest.TestCase):
    def test_ewall_from_browser(self):
        meta, data = cli.ewall_decrypt((FIX / "from-browser.ewall").read_bytes(), PASS)
        self.assertEqual(data, (FIX / "from-browser.expected.txt").read_bytes())
        self.assertEqual(meta["name"], "dokumen-uji.txt")
        self.assertEqual(meta["size"], len(data))

    def test_ewall_wrong_pass_and_tamper(self):
        buf = (FIX / "from-browser.ewall").read_bytes()
        with self.assertRaises(cli.EwError):
            cli.ewall_decrypt(buf, "passphrase-salah-sekali")
        for pos in (5 + 1, 20, len(buf) - 1):  # header (iterasi), salt, tag
            bad = bytearray(buf)
            bad[pos] ^= 1
            with self.assertRaises(cli.EwError):
                cli.ewall_decrypt(bytes(bad), PASS)

    def test_shamir_from_browser(self):
        from itertools import combinations
        lines = [l for l in (FIX / "shares-3of5.txt").read_text().splitlines() if l.startswith("EW-SSS1")]
        secret = (FIX / "shares-secret.txt").read_bytes()
        self.assertEqual(len(lines), 5)
        for sub in combinations(lines, 3):
            self.assertEqual(cli.shamir_combine(list(sub)), secret)
        with self.assertRaises(cli.EwError):
            cli.shamir_combine(lines[:2])

    def test_ledger_from_browser(self):
        data = json.loads((FIX / "ledger-export.json").read_text())
        ok, first_bad, _ = cli.verify_ledger(data["blocks"])
        self.assertTrue(ok)
        self.assertGreaterEqual(len(data["blocks"]), 5)
        data["blocks"][2]["meta"]["bits"] = 128
        ok, first_bad, _ = cli.verify_ledger(data["blocks"])
        self.assertFalse(ok)
        self.assertEqual(first_bad, 2)

    def test_sealed_message_from_browser(self):
        payload = cli.open_seal((FIX / "sealed-p.txt").read_text(), PASS)
        self.assertEqual(payload["msg"], "Password WiFi lab: gerimis-di-dago-42")
        with self.assertRaises(cli.EwError):
            cli.open_seal((FIX / "sealed-p.txt").read_text(), "salah")


class CliRoundTrip(unittest.TestCase):
    def test_cli_encrypt_decrypt_commands(self):
        with tempfile.TemporaryDirectory() as d:
            src = Path(d) / "kontrak.pdf"
            src.write_bytes(os.urandom(5000))
            env = dict(os.environ, EWALL_PASSPHRASE="passphrase-uji-panjang")
            script = str(HERE.parent / "ewall_cli.py")
            enc = Path(d) / "out.ewall"
            subprocess.run([sys.executable, script, "encrypt", str(src), "-o", str(enc)], check=True, env=env, capture_output=True)
            buf = enc.read_bytes()
            self.assertEqual(buf[:4], b"EWAL")
            self.assertEqual(int.from_bytes(buf[6:10], "big"), 600000)
            dec = Path(d) / "back.pdf"
            subprocess.run([sys.executable, script, "decrypt", str(enc), "-o", str(dec)], check=True, env=env, capture_output=True)
            self.assertEqual(dec.read_bytes(), src.read_bytes())

    def test_cli_shares_combine(self):
        secret = "seed phrase uji 🌋".encode()
        shares = cli.shamir_split(secret, 2, 3)
        self.assertEqual(cli.shamir_combine([shares[2], shares[0]]), secret)
        other = cli.shamir_split(secret, 2, 3)
        with self.assertRaises(cli.EwError):
            cli.shamir_combine([shares[0], other[1]])

    def test_selftest(self):
        self.assertEqual(cli.cmd_selftest(), 0)


if __name__ == "__main__":
    unittest.main()
