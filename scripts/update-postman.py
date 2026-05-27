"""One-off helper: update Postman collection untuk THO-205..213.

Idempotent: bisa dijalankan ulang, akan replace folder yang ditambah skrip ini.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COLL = ROOT / "postman" / "tabungan-haji.postman_collection.json"
ENV = ROOT / "postman" / "tabungan-haji.postman_environment.json"


def req(name, method, url_path, body=None, headers=None, prereq=None, tests=None, query=None, auth=False):
    request = {"method": method, "header": list(headers or [])}
    if auth:
        request["header"].insert(0, {"key": "Authorization", "value": "Bearer {{token}}"})
    raw = "{{baseUrl}}" + url_path
    if query:
        raw += "?" + "&".join(f"{k}={v}" for k, v in query)
    request["url"] = {
        "raw": raw,
        "host": ["{{baseUrl}}"],
        "path": url_path.strip("/").split("/"),
    }
    if query:
        request["url"]["query"] = [{"key": k, "value": v} for k, v in query]
    if body is not None:
        request["body"] = {"mode": "raw", "raw": json.dumps(body, indent=2),
                           "options": {"raw": {"language": "json"}}}
    events = []
    if prereq:
        events.append({"listen": "prerequest", "script": {"type": "text/javascript", "exec": prereq}})
    if tests:
        events.append({"listen": "test", "script": {"type": "text/javascript", "exec": tests}})
    item = {"name": name, "request": request}
    if events:
        item["event"] = events
    return item


def hjson(): return [{"key": "Content-Type", "value": "application/json"}]
def hidemp(): return hjson() + [{"key": "Idempotency-Key", "value": "{{idempotencyKey}}"}]


# ========== AUTH FOLDER (THO-209 + 211) ==========
auth_folder = {
    "name": "Auth",
    "item": [
        req(
            "THO-209 Login (happy 200)",
            "POST", "/api/v1/auth/login",
            headers=hjson(),
            body={"email": "ahmad.fauzi@example.com", "password": "Password123!"},
            tests=[
                "pm.test('Status 200', () => pm.response.to.have.status(200));",
                "const json = pm.response.json();",
                "pm.test('Punya token + user', () => {",
                "  pm.expect(json.data).to.have.property('token');",
                "  pm.expect(json.data.tokenType).to.eql('Bearer');",
                "  pm.expect(json.data.user).to.have.property('id');",
                "});",
                "pm.environment.set('token', json.data.token);",
                "pm.environment.set('loggedInUserId', json.data.user.id);",
            ],
        ),
        req(
            "THO-209 Login - Wrong Password (401)",
            "POST", "/api/v1/auth/login",
            headers=hjson(),
            body={"email": "ahmad.fauzi@example.com", "password": "salah-banget"},
            tests=[
                "pm.test('Status 401', () => pm.response.to.have.status(401));",
                "pm.test('error.code = INVALID_CREDENTIALS', () => {",
                "  pm.expect(pm.response.json().error.code).to.eql('INVALID_CREDENTIALS');",
                "});",
            ],
        ),
        req(
            "THO-209 Login - Email Tidak Ada (401, generic)",
            "POST", "/api/v1/auth/login",
            headers=hjson(),
            body={"email": "tidak.ada@example.com", "password": "Password123!"},
            tests=[
                "pm.test('Status 401', () => pm.response.to.have.status(401));",
                "pm.test('Pesan generik (tidak leak akun ada/tidak)', () => {",
                "  pm.expect(pm.response.json().error.message).to.match(/Email atau password salah/);",
                "});",
            ],
        ),
        req(
            "THO-209 Login - Validation (422)",
            "POST", "/api/v1/auth/login",
            headers=hjson(),
            body={"email": "bukan-email", "password": ""},
            tests=[
                "pm.test('Status 422', () => pm.response.to.have.status(422));",
            ],
        ),
        req(
            "THO-210 Probe - Tanpa Token (401)",
            "GET", "/api/v1/tabungan-haji/{{tabunganId}}",
            tests=[
                "pm.test('Status 401', () => pm.response.to.have.status(401));",
                "pm.test('error.code = UNAUTHORIZED', () => {",
                "  pm.expect(pm.response.json().error.code).to.eql('UNAUTHORIZED');",
                "});",
            ],
        ),
        req(
            "THO-210 Probe - Token Invalid (401)",
            "GET", "/api/v1/tabungan-haji/{{tabunganId}}",
            headers=[{"key": "Authorization", "value": "Bearer not.a.valid.jwt"}],
            tests=[
                "pm.test('Status 401', () => pm.response.to.have.status(401));",
                "pm.test('error.code = INVALID_TOKEN', () => {",
                "  pm.expect(pm.response.json().error.code).to.eql('INVALID_TOKEN');",
                "});",
            ],
        ),
        req(
            "THO-211 Logout (200)",
            "POST", "/api/v1/auth/logout",
            auth=True,
            tests=[
                "pm.test('Status 200', () => pm.response.to.have.status(200));",
                "pm.test('Pesan revoke', () => {",
                "  pm.expect(pm.response.json().data.message).to.include('revoke');",
                "});",
            ],
        ),
        req(
            "THO-211 Logout Effect - Token Revoked (401)",
            "GET", "/api/v1/tabungan-haji/{{tabunganId}}",
            auth=True,
            tests=[
                "pm.test('Status 401', () => pm.response.to.have.status(401));",
                "pm.test('error.code = TOKEN_REVOKED', () => {",
                "  pm.expect(pm.response.json().error.code).to.eql('TOKEN_REVOKED');",
                "});",
            ],
        ),
    ],
}


# ========== REPORTS FOLDER (THO-213) ==========
reports_folder = {
    "name": "Reports",
    "item": [
        req(
            "THO-213 Export CSV Bulanan (200)",
            "GET", "/api/v1/reports/transaksi-bulanan",
            auth=True,
            query=[("month", "2026-05")],
            tests=[
                "pm.test('Status 200', () => pm.response.to.have.status(200));",
                "pm.test('Content-Type text/csv', () => {",
                "  pm.expect(pm.response.headers.get('Content-Type')).to.include('text/csv');",
                "});",
                "pm.test('Header Content-Disposition attachment', () => {",
                "  pm.expect(pm.response.headers.get('Content-Disposition')).to.include('attachment');",
                "});",
                "pm.test('CSV body punya header row', () => {",
                "  pm.expect(pm.response.text()).to.include('waktu,nomor_rekening');",
                "});",
            ],
        ),
        req(
            "THO-213 Export CSV - Invalid Month (422)",
            "GET", "/api/v1/reports/transaksi-bulanan",
            auth=True,
            query=[("month", "2026-13")],
            tests=[
                "pm.test('Status 422', () => pm.response.to.have.status(422));",
            ],
        ),
        req(
            "THO-213 Export CSV - Tanpa Token (401)",
            "GET", "/api/v1/reports/transaksi-bulanan",
            query=[("month", "2026-05")],
            tests=[
                "pm.test('Status 401', () => pm.response.to.have.status(401));",
            ],
        ),
    ],
}


# ========== TABUNGAN HAJI FOLDER (replace dengan auth + tambah estimasi) ==========
tabungan_folder = {
    "name": "Tabungan Haji",
    "item": [
        req(
            "THO-205 Buka Rekening (happy 201)",
            "POST", "/api/v1/tabungan-haji",
            auth=True, headers=hjson(),
            body={"nasabahId": "{{nasabahId}}"},
            tests=[
                "pm.test('Status 201', () => pm.response.to.have.status(201));",
                "const json = pm.response.json();",
                "pm.test('Punya data.tabungan dengan id & nomorRekening', () => {",
                "  pm.expect(json.data.tabungan).to.have.property('id');",
                "  pm.expect(json.data.tabungan).to.have.property('nomorRekening');",
                "});",
                "pm.environment.set('tabunganId', json.data.tabungan.id);",
            ],
        ),
        req(
            "THO-205 Buka Rekening - Duplikat (409)",
            "POST", "/api/v1/tabungan-haji",
            auth=True, headers=hjson(),
            body={"nasabahId": "{{nasabahId}}"},
            tests=[
                "pm.test('Status 409', () => pm.response.to.have.status(409));",
                "pm.test('error.code = DUPLICATE_TABUNGAN', () => {",
                "  pm.expect(pm.response.json().error.code).to.eql('DUPLICATE_TABUNGAN');",
                "});",
            ],
        ),
        req(
            "THO-205 Buka Rekening - Nasabah Belum Daftar (403)",
            "POST", "/api/v1/tabungan-haji",
            auth=True, headers=hjson(),
            body={"nasabahId": "00000000-0000-0000-0000-000000000000"},
            tests=[
                "pm.test('Status 403', () => pm.response.to.have.status(403));",
                "pm.test('error.code = NASABAH_NOT_REGISTERED', () => {",
                "  pm.expect(pm.response.json().error.code).to.eql('NASABAH_NOT_REGISTERED');",
                "});",
            ],
        ),
        req(
            "THO-205 Buka Rekening - Validasi (422)",
            "POST", "/api/v1/tabungan-haji",
            auth=True, headers=hjson(),
            body={"nasabahId": "bukan-uuid"},
            tests=["pm.test('Status 422', () => pm.response.to.have.status(422));"],
        ),
        req(
            "THO-207 Detail Tabungan (200)",
            "GET", "/api/v1/tabungan-haji/{{tabunganId}}",
            auth=True,
            tests=[
                "pm.test('Status 200', () => pm.response.to.have.status(200));",
                "const json = pm.response.json();",
                "pm.test('Punya saldo, status, nasabah', () => {",
                "  pm.expect(json.data).to.have.property('saldo');",
                "  pm.expect(json.data).to.have.property('status');",
                "  pm.expect(json.data).to.have.property('nasabah');",
                "});",
            ],
        ),
        req(
            "THO-207 Detail Tabungan - Not Found (404)",
            "GET", "/api/v1/tabungan-haji/00000000-0000-0000-0000-000000000000",
            auth=True,
            tests=["pm.test('Status 404', () => pm.response.to.have.status(404));"],
        ),
        req(
            "THO-207 Detail Tabungan - Invalid UUID (422)",
            "GET", "/api/v1/tabungan-haji/bukan-uuid",
            auth=True,
            tests=["pm.test('Status 422', () => pm.response.to.have.status(422));"],
        ),
        req(
            "THO-206 Setor (201)",
            "POST", "/api/v1/tabungan-haji/{{tabunganId}}/setor",
            auth=True, headers=hidemp(),
            body={"nominal": 250000, "metode": "QRIS"},
            prereq=[
                "const key = (typeof crypto !== 'undefined' && crypto.randomUUID)",
                "  ? crypto.randomUUID()",
                "  : ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx').replace(/[xy]/g, c => {",
                "      const r = Math.random() * 16 | 0;",
                "      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);",
                "    });",
                "pm.environment.set('idempotencyKey', key);",
            ],
            tests=[
                "pm.test('Status 201', () => pm.response.to.have.status(201));",
                "pm.test('Transaksi tersimpan', () => {",
                "  const json = pm.response.json();",
                "  pm.expect(json.data.transaksi).to.have.property('id');",
                "  pm.expect(json.data.transaksi.jenis).to.eql('SETORAN');",
                "});",
            ],
        ),
        req(
            "THO-206 Setor - Replay (201 + Idempotency-Replayed)",
            "POST", "/api/v1/tabungan-haji/{{tabunganId}}/setor",
            auth=True, headers=hidemp(),
            body={"nominal": 250000, "metode": "QRIS"},
            tests=[
                "pm.test('Status 201', () => pm.response.to.have.status(201));",
                "pm.test('Header Idempotency-Replayed = true', () => {",
                "  pm.expect(pm.response.headers.get('Idempotency-Replayed')).to.eql('true');",
                "});",
            ],
        ),
        req(
            "THO-206 Setor - Minimum 100rb (422)",
            "POST", "/api/v1/tabungan-haji/{{tabunganId}}/setor",
            auth=True,
            headers=hjson() + [{"key": "Idempotency-Key", "value": "test-minimum-fail-12345678"}],
            body={"nominal": 50000},
            tests=[
                "pm.test('Status 422', () => pm.response.to.have.status(422));",
                "pm.test('Pesan minimum 100rb', () => {",
                "  pm.expect(JSON.stringify(pm.response.json().error.details)).to.include('Minimum setoran');",
                "});",
            ],
        ),
        req(
            "THO-206 Setor - Tanpa Idempotency-Key (400)",
            "POST", "/api/v1/tabungan-haji/{{tabunganId}}/setor",
            auth=True, headers=hjson(),
            body={"nominal": 100000},
            tests=[
                "pm.test('Status 400', () => pm.response.to.have.status(400));",
                "pm.test('error.code = IDEMPOTENCY_KEY_REQUIRED', () => {",
                "  pm.expect(pm.response.json().error.code).to.eql('IDEMPOTENCY_KEY_REQUIRED');",
                "});",
            ],
        ),
        req(
            "THO-208 Mutasi - List All (200)",
            "GET", "/api/v1/tabungan-haji/{{tabunganId}}/mutasi",
            auth=True,
            tests=[
                "pm.test('Status 200', () => pm.response.to.have.status(200));",
                "pm.test('Punya pagination meta', () => {",
                "  pm.expect(pm.response.json().meta.pagination).to.have.property('total');",
                "});",
            ],
        ),
        req(
            "THO-208 Mutasi - Filter Jenis=SETORAN",
            "GET", "/api/v1/tabungan-haji/{{tabunganId}}/mutasi",
            auth=True,
            query=[("jenis", "SETORAN")],
            tests=[
                "pm.test('Status 200', () => pm.response.to.have.status(200));",
                "pm.test('Semua jenis SETORAN', () => {",
                "  pm.response.json().data.forEach(it => pm.expect(it.jenis).to.eql('SETORAN'));",
                "});",
            ],
        ),
        req(
            "THO-208 Mutasi - Pagination (limit=1)",
            "GET", "/api/v1/tabungan-haji/{{tabunganId}}/mutasi",
            auth=True,
            query=[("page", "1"), ("limit", "1")],
            tests=[
                "pm.test('Status 200', () => pm.response.to.have.status(200));",
                "pm.test('Max 1 item per page', () => {",
                "  pm.expect(pm.response.json().data.length).to.be.at.most(1);",
                "});",
            ],
        ),
        req(
            "THO-212 Estimasi Tahun Berangkat (200)",
            "GET", "/api/v1/tabungan-haji/{{tabunganId}}/estimasi",
            auth=True,
            tests=[
                "pm.test('Status 200', () => pm.response.to.have.status(200));",
                "pm.test('Punya field saldoSekarang, targetPorsi, estimasiTahunBerangkat', () => {",
                "  const d = pm.response.json().data;",
                "  pm.expect(d).to.have.property('saldoSekarang');",
                "  pm.expect(d).to.have.property('targetPorsi');",
                "  pm.expect(d).to.have.property('estimasiTahunBerangkat');",
                "});",
            ],
        ),
        req(
            "THO-212 Estimasi - Not Found (404)",
            "GET", "/api/v1/tabungan-haji/00000000-0000-0000-0000-000000000000/estimasi",
            auth=True,
            tests=["pm.test('Status 404', () => pm.response.to.have.status(404));"],
        ),
    ],
}


# ========== Update Nasabah folder: tambah Bearer ke list/detail/update/delete ==========
def patch_nasabah_folder(folder):
    """Tambah Authorization: Bearer {{token}} ke semua request kecuali Create (POST)."""
    for item in folder.get("item", []):
        req_obj = item.get("request", {})
        method = req_obj.get("method")
        # Skip Create requests (POST /api/v1/nasabah register publik)
        url = req_obj.get("url", {})
        raw = url.get("raw", "")
        is_create = method == "POST" and raw.endswith("/api/v1/nasabah")
        if is_create:
            continue
        # Tambah header Bearer kalau belum ada
        headers = req_obj.get("header", [])
        has_auth = any(h.get("key", "").lower() == "authorization" for h in headers)
        if not has_auth:
            headers.insert(0, {"key": "Authorization", "value": "Bearer {{token}}"})
            req_obj["header"] = headers
    return folder


# === Apply ===
coll = json.loads(COLL.read_text(encoding="utf-8"))

# Remove old auto-generated folders
keep = []
managed = {"Auth", "Tabungan Haji", "Reports"}
for it in coll["item"]:
    if it["name"] == "Nasabah":
        keep.append(patch_nasabah_folder(it))
    elif it["name"] not in managed:
        keep.append(it)

# Order: Health → Auth → Nasabah → Tabungan Haji → Reports
ordered = []
for n in ["Health", "Auth", "Nasabah", "Tabungan Haji", "Reports"]:
    if n == "Auth":
        ordered.append(auth_folder)
    elif n == "Tabungan Haji":
        ordered.append(tabungan_folder)
    elif n == "Reports":
        ordered.append(reports_folder)
    else:
        for it in keep:
            if it["name"] == n:
                ordered.append(it)
                break

coll["item"] = ordered
COLL.write_text(json.dumps(coll, indent=2), encoding="utf-8")
print(f"[OK] collection updated -> {COLL}")
print(f"     folders: {[it['name'] for it in coll['item']]}")
print(f"     auth requests: {len(auth_folder['item'])}")
print(f"     tabungan haji requests: {len(tabungan_folder['item'])}")
print(f"     reports requests: {len(reports_folder['item'])}")

# --- Update environment ---
env = json.loads(ENV.read_text(encoding="utf-8"))
existing_keys = {v["key"] for v in env["values"]}
for new_key in ["tabunganId", "idempotencyKey", "saldoSesudah", "token", "loggedInUserId"]:
    if new_key not in existing_keys:
        env["values"].append({"key": new_key, "value": "", "type": "default", "enabled": True})
ENV.write_text(json.dumps(env, indent=2), encoding="utf-8")
print(f"[OK] environment updated -> {ENV}")
print(f"     keys: {[v['key'] for v in env['values']]}")
