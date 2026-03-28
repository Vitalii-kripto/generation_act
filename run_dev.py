import os
import socket
import subprocess
import sys
import time
import webbrowser
import logging
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOGS_DIR = ROOT / "logs"
LOGS_DIR.mkdir(exist_ok=True)
LOG_FILE = LOGS_DIR / "app.log"

# Setup logging
logger = logging.getLogger("RunDev")
logger.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

fh = logging.FileHandler(LOG_FILE, encoding='utf-8')
fh.setFormatter(formatter)
logger.addHandler(fh)

ch = logging.StreamHandler(sys.stdout)
ch.setFormatter(formatter)
logger.addHandler(ch)

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
        line = line.rstrip()
        print(f"[{prefix}] {line}")
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S,%f')[:-3]} - {prefix} - INFO - {line}\n")

def main() -> None:
    logger.info("Запуск стартового скрипта run_dev.py")
    backend_host = "127.0.0.1"
    frontend_host = "127.0.0.1"

    try:
        backend_port = find_free_port(8001, backend_host)
        frontend_port = find_free_port(3000, frontend_host)
    except Exception as e:
        logger.error(f"Ошибка при поиске свободных портов: {e}")
        sys.exit(1)

    logger.info(f"Выбран порт бэкенда: {backend_port}")
    logger.info(f"Выбран порт фронтенда: {frontend_port}")

    env = os.environ.copy()
    env["BACKEND_HOST"] = backend_host
    env["BACKEND_PORT"] = str(backend_port)
    env["FRONTEND_HOST"] = frontend_host
    env["FRONTEND_PORT"] = str(frontend_port)
    env["VITE_BACKEND_URL"] = f"http://{backend_host}:{backend_port}"

    logger.info("=" * 72)
    logger.info(f"Backend  -> http://{backend_host}:{backend_port}")
    logger.info(f"Frontend -> http://{frontend_host}:{frontend_port}")
    logger.info("=" * 72)

    python_exe = sys.executable
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

    backend_cmd = [python_exe, "-u", str(ROOT / "main.py")]
    frontend_cmd = [npm_cmd, "run", "frontend", "--", "--host", frontend_host, "--port", str(frontend_port)]

    logger.info("Запуск процесса бэкенда...")
    try:
        backend_process = subprocess.Popen(
            backend_cmd,
            cwd=ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        logger.info("Бэкенд успешно запущен.")
    except Exception as e:
        logger.error(f"Ошибка запуска бэкенда: {e}")
        sys.exit(1)

    time.sleep(2)

    logger.info("Запуск процесса фронтенда...")
    try:
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
        logger.info("Фронтенд успешно запущен.")
    except Exception as e:
        logger.error(f"Ошибка запуска фронтенда: {e}")
        backend_process.terminate()
        sys.exit(1)

    try:
        time.sleep(2)
        frontend_url = f"http://{frontend_host}:{frontend_port}"
        logger.info(f"Открытие браузера по адресу {frontend_url}")
        webbrowser.open(frontend_url)
    except Exception as exc:
        logger.error(f"Не удалось открыть браузер автоматически: {exc}")

    t1 = threading.Thread(target=stream_process_output, args=(backend_process, "BACKEND"), daemon=True)
    t2 = threading.Thread(target=stream_process_output, args=(frontend_process, "FRONTEND"), daemon=True)
    t1.start()
    t2.start()

    try:
        while True:
            backend_code = backend_process.poll()
            frontend_code = frontend_process.poll()

            if backend_code is not None:
                logger.error(f"BACKEND завершился с кодом {backend_code}")
                frontend_process.terminate()
                break

            if frontend_code is not None:
                logger.error(f"FRONTEND завершился с кодом {frontend_code}")
                backend_process.terminate()
                break

            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Остановка процессов пользователем (KeyboardInterrupt)...")
        backend_process.terminate()
        frontend_process.terminate()
    except Exception as e:
        logger.error(f"Системное исключение в главном цикле: {e}")
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
        logger.info("Работа скрипта run_dev.py завершена.")

if __name__ == "__main__":
    main()
