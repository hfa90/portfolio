from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import socket
import sys


STATE = None


class BancoHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path == "/api/state":
            self.send_json(STATE)
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

        self.send_json({"error": "not found"}, status=404)

    def send_json(self, payload, status=200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


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
