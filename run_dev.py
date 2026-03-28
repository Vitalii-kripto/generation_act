import os
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def is_port_free(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
            return True
        except OSError:
            return False


def find_free_port(start_port: int, host: str = "127.0.0.1", max_tries: int = 200) -> int:
    for port in range(start_port, start_port + max_tries):
        if is_port_free(host, port):
            return port
    raise RuntimeError(f"Не удалось найти свободный порт, начиная с {start_port}")


def stream_process_output(process: subprocess.Popen, prefix: str):
    if process.stdout is None:
        return
    for line in process.stdout:
        print(f"[{prefix}] {line.rstrip()}")


def main() -> None:
    backend_host = "127.0.0.1"
    frontend_host = "127.0.0.1"

    backend_port = find_free_port(8001, backend_host)
    frontend_port = find_free_port(3000, frontend_host)

    env = os.environ.copy()
    env["BACKEND_HOST"] = backend_host
    env["BACKEND_PORT"] = str(backend_port)
    env["FRONTEND_HOST"] = frontend_host
    env["FRONTEND_PORT"] = str(frontend_port)
    env["VITE_BACKEND_URL"] = f"http://{backend_host}:{backend_port}"

    print("=" * 72)
    print(f"Backend  -> http://{backend_host}:{backend_port}")
    print(f"Frontend -> http://{frontend_host}:{frontend_port}")
    print("=" * 72)

    python_exe = sys.executable
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

    backend_cmd = [python_exe, "-u", str(ROOT / "main.py")]
    frontend_cmd = [npm_cmd, "run", "frontend", "--", "--host", frontend_host, "--port", str(frontend_port)]

    backend_process = subprocess.Popen(
        backend_cmd,
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    time.sleep(2)

    frontend_process = subprocess.Popen(
        frontend_cmd,
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        shell=False,
    )

    try:
        time.sleep(2)
        webbrowser.open(f"http://{frontend_host}:{frontend_port}")
    except Exception as exc:
        print(f"Не удалось открыть браузер автоматически: {exc}")

    import threading

    t1 = threading.Thread(target=stream_process_output, args=(backend_process, "BACKEND"), daemon=True)
    t2 = threading.Thread(target=stream_process_output, args=(frontend_process, "FRONTEND"), daemon=True)
    t1.start()
    t2.start()

    try:
        while True:
            backend_code = backend_process.poll()
            frontend_code = frontend_process.poll()

            if backend_code is not None:
                print(f"BACKEND завершился с кодом {backend_code}")
                frontend_process.terminate()
                break

            if frontend_code is not None:
                print(f"FRONTEND завершился с кодом {frontend_code}")
                backend_process.terminate()
                break

            time.sleep(1)
    except KeyboardInterrupt:
        print("Остановка процессов...")
        backend_process.terminate()
        frontend_process.terminate()
    finally:
        try:
            backend_process.wait(timeout=5)
        except Exception:
            backend_process.kill()
        try:
            frontend_process.wait(timeout=5)
        except Exception:
            frontend_process.kill()


if __name__ == "__main__":
    main()
