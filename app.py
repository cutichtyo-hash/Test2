from datetime import datetime, timedelta, timezone
import json
import os
import secrets
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, abort, jsonify, render_template, send_from_directory

app = Flask(__name__)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

SPIN_DURATION_SECONDS = 30
PRIZES = ["Serect 1", "Serect 2", "Serect 3", "Serect 4"]
PRIZE_IMAGE_NAMES = [
    ["serect 1.jpg", "secret 1.jpg"],
    ["serect 2.jpg", "secret 2.jpg"],
    ["serect 3.jpg", "secret 3.jpg"],
    ["serect 4.jpg", "secret 4.jpg"],
]
APP_DIR = os.path.dirname(os.path.abspath(__file__))
PRIZE_IMAGE_DIRS = [os.path.join(APP_DIR, "image"), os.path.join(APP_DIR, "static", "image")]

CONFIG_FILE = os.path.join(APP_DIR, "config.json")
try:
    with open(CONFIG_FILE, "r", encoding="utf-8") as config_file:
        LOCAL_CONFIG = json.load(config_file)
except FileNotFoundError:
    LOCAL_CONFIG = {}

# Environment variables take precedence, which lets Render provide secrets safely.
SUPABASE_URL = (
    os.environ.get("SUPABASE_URL") or LOCAL_CONFIG.get("supabase_url", "")
).strip().rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or LOCAL_CONFIG.get("supabase_service_role_key", "")
).strip()


class SupabaseError(Exception):
    pass


def supabase_request(method, path, query=None, body=None):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise SupabaseError("Supabase chưa được cấu hình.")

    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if query:
        url = f"{url}?{urlencode(query)}"

    payload = None if body is None else json.dumps(body).encode("utf-8")
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    # New sb_secret keys are API keys, not JWTs, so they must not be sent as Bearer tokens.
    if not SUPABASE_SERVICE_ROLE_KEY.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"

    req = Request(url, data=payload, method=method, headers=headers)
    try:
        with urlopen(req, timeout=8) as response:
            content = response.read().decode("utf-8")
            return json.loads(content) if content else []
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        app.logger.error("Supabase trả về lỗi %s: %s", exc.code, details)
        raise SupabaseError("Không thể cập nhật trạng thái vòng quay.") from exc
    except (URLError, TimeoutError) as exc:
        app.logger.error("Không kết nối được Supabase: %s", exc)
        raise SupabaseError("Không thể kết nối Supabase.") from exc


def control_status():
    rows = supabase_request(
        "GET",
        "draw_control",
        {"id": "eq.1", "select": "enabled,spin_in_progress,started_at,prize_index,completed_at"},
    )
    if not rows:
        raise SupabaseError("Chưa có dòng cấu hình vòng quay trong Supabase.")
    return rows[0]


@app.route("/")
def index():
    available_images = [
        find_prize_image(index) is not None
        for index in range(len(PRIZES))
    ]
    return render_template("index.html", prizes=PRIZES, prize_images=available_images)


def find_prize_image(prize_index):
    if not 0 <= prize_index < len(PRIZE_IMAGE_NAMES):
        return None
    for directory in PRIZE_IMAGE_DIRS:
        for filename in PRIZE_IMAGE_NAMES[prize_index]:
            if os.path.isfile(os.path.join(directory, filename)):
                return directory, filename
    return None


@app.route("/prize-images/<int:prize_index>")
def prize_image(prize_index):
    match = find_prize_image(prize_index)
    if match:
        directory, filename = match
        return send_from_directory(directory, filename)
    abort(404)


@app.route("/api/status", methods=["GET"])
def get_status():
    try:
        return jsonify({"ok": True, **control_status()})
    except SupabaseError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 503


@app.route("/api/spin/start", methods=["POST"])
def start_spin():
    # Conditional PATCH makes the first request the only one that can claim the draw.
    now = datetime.now(timezone.utc)
    rows = supabase_request(
        "PATCH",
        "draw_control",
        {"id": "eq.1", "enabled": "eq.true", "spin_in_progress": "eq.false"},
        {
            "spin_in_progress": True,
            "started_at": now.isoformat(),
            "prize_index": secrets.randbelow(len(PRIZES)),
        },
    )
    if not rows:
        return jsonify({"error": "Vòng quay đã được sử dụng hoặc đang diễn ra."}), 409

    return jsonify({
        "prize_index": rows[0]["prize_index"],
        "started_at": rows[0]["started_at"],
        "duration": SPIN_DURATION_SECONDS,
    })


@app.route("/api/spin/finish", methods=["POST"])
def finish_spin():
    # The database timestamp check prevents clients from finishing before 30 seconds.
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=SPIN_DURATION_SECONDS)
    rows = supabase_request(
        "PATCH",
        "draw_control",
        {
            "id": "eq.1",
            "enabled": "eq.true",
            "spin_in_progress": "eq.true",
            "started_at": f"lte.{cutoff.isoformat()}",
        },
        {
            "enabled": False,
            "spin_in_progress": False,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    if not rows:
        return jsonify({"error": "Vòng quay chưa đủ 30 giây hoặc đã được hoàn tất."}), 409

    prize_index = rows[0]["prize_index"]
    return jsonify({"prize_index": prize_index, "prize": PRIZES[prize_index]})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
