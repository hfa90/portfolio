from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import socket
import sys
import time
import uuid
from urllib.parse import parse_qs, urlparse


STATE = None
CHESS_ROOMS = {}


class BancoHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path == "/api/state":
            self.send_json(STATE)
            return
        parsed = urlparse(self.path)
        if parsed.path == "/api/chess/state":
            params = parse_qs(parsed.query)
            room_id = (params.get("room") or [""])[0].strip()
            password = (params.get("password") or [""])[0]
            room = CHESS_ROOMS.get(room_id)
            if not room or room.get("password") != password:
                self.send_json({"error": "room not found"}, status=404)
                return
            self.send_json({"room": public_chess_room(room)})
            return
        if parsed.path == "/api/chess/invite":
            params = parse_qs(parsed.query)
            room_id = (params.get("room") or [""])[0].strip()
            room = CHESS_ROOMS.get(room_id)
            if not room:
                self.send_json({"error": "room not found"}, status=404)
                return
            self.send_json({"id": room_id, "white": room["players"].get("white") or "Outro jogador"})
            return
        super().do_GET()

    def do_POST(self):
        global STATE

        if self.path == "/api/state":
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(body.decode("utf-8"))
                if not isinstance(payload, dict) or not isinstance(payload.get("players"), list):
                    raise ValueError("Invalid game state")
            except Exception:
                self.send_json({"error": "invalid state"}, status=400)
                return

            STATE = payload
            self.send_json({"ok": True, "revision": STATE.get("revision", 0)})
            return

        if self.path == "/api/reset":
            STATE = None
            self.send_json({"ok": True})
            return

        if self.path == "/api/chess/create":
            payload = self.read_json()
            if payload is None:
                self.send_json({"error": "invalid payload"}, status=400)
                return
            password = str(payload.get("password") or "").strip()
            if len(password) < 3:
                self.send_json({"error": "password required"}, status=400)
                return
            try:
                time_limit_ms = int(payload.get("timeLimitMs") or 0)
            except (TypeError, ValueError):
                time_limit_ms = 0
            if time_limit_ms not in (0, 180000, 300000, 600000):
                time_limit_ms = 0
            room_id = uuid.uuid4().hex[:8]
            now = time.time()
            CHESS_ROOMS[room_id] = {
                "id": room_id,
                "password": password,
                "revision": 1,
                "created_at": now,
                "updated_at": now,
                "players": {
                    "white": str(payload.get("playerName") or "Brancas")[:24],
                    "black": ""
                },
                "state": {
                    "fen": "start",
                    "pgn": "",
                    "moves": [],
                    "lastMove": "",
                    "status": "Aguardando oponente",
                    "result": "",
                    "turn": "w",
                    "timer": {
                        "limitMs": time_limit_ms,
                        "startedAt": None,
                        "endsAt": None
                    }
                }
            }
            self.send_json({
                "room": public_chess_room(CHESS_ROOMS[room_id]),
                "color": "white",
                "link": self.room_link(room_id)
            })
            return

        if self.path == "/api/chess/join":
            payload = self.read_json()
            if payload is None:
                self.send_json({"error": "invalid payload"}, status=400)
                return
            room_id = str(payload.get("roomId") or "").strip()
            password = str(payload.get("password") or "")
            room = CHESS_ROOMS.get(room_id)
            if not room or room.get("password") != password:
                self.send_json({"error": "room not found"}, status=404)
                return
            color = "black"
            if not room["players"].get("black"):
                room["players"]["black"] = str(payload.get("playerName") or "Pretas")[:24]
            if room["state"].get("status") == "Aguardando oponente":
                room["state"]["status"] = "Partida em andamento"
                timer = room["state"].get("timer") or {}
                limit_ms = int(timer.get("limitMs") or 0)
                if limit_ms and not timer.get("endsAt"):
                    now_ms = int(time.time() * 1000)
                    timer["startedAt"] = now_ms
                    timer["endsAt"] = now_ms + limit_ms
                    room["state"]["timer"] = timer
            room["revision"] += 1
            room["updated_at"] = time.time()
            self.send_json({"room": public_chess_room(room), "color": color})
            return

        if self.path == "/api/chess/move":
            payload = self.read_json()
            if payload is None:
                self.send_json({"error": "invalid payload"}, status=400)
                return
            room_id = str(payload.get("roomId") or "").strip()
            password = str(payload.get("password") or "")
            room = CHESS_ROOMS.get(room_id)
            if not room or room.get("password") != password:
                self.send_json({"error": "room not found"}, status=404)
                return
            state = payload.get("state")
            if not isinstance(state, dict) or not state.get("fen"):
                self.send_json({"error": "invalid state"}, status=400)
                return
            room["state"] = {
                "fen": str(state.get("fen") or "start"),
                "pgn": str(state.get("pgn") or ""),
                "moves": state.get("moves") if isinstance(state.get("moves"), list) else [],
                "lastMove": str(state.get("lastMove") or ""),
                "status": str(state.get("status") or "Partida em andamento"),
                "result": str(state.get("result") or ""),
                "turn": str(state.get("turn") or "w")[:1],
                "timer": state.get("timer") if isinstance(state.get("timer"), dict) else {
                    "limitMs": 0,
                    "startedAt": None,
                    "endsAt": None
                }
            }
            room["revision"] += 1
            room["updated_at"] = time.time()
            self.send_json({"room": public_chess_room(room)})
            return

        self.send_json({"error": "not found"}, status=404)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(body.decode("utf-8"))
            return payload if isinstance(payload, dict) else None
        except Exception:
            return None

    def room_link(self, room_id):
        host = self.headers.get("Host") or "127.0.0.1:4173"
        return f"http://{host}/#chess={room_id}"

    def send_json(self, payload, status=200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def public_chess_room(room):
    return {
        "id": room["id"],
        "revision": room["revision"],
        "players": room["players"],
        "state": room["state"],
    }


def local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("192.0.2.1", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    server = ThreadingHTTPServer(("0.0.0.0", port), BancoHandler)
    print("Banco de Mesa rodando.")
    print(f"Nesta máquina: http://127.0.0.1:{port}")
    print(f"Na mesma rede: http://{local_ip()}:{port}")
    print("Estado em memória: ao fechar este servidor, a partida online é perdida.")
    server.serve_forever()


if __name__ == "__main__":
    main()
