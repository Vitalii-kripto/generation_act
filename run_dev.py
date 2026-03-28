import os
import socket
import subprocess
import sys
import time
import webbrowser
import logging
import threading
import json
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
import shutil

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
    try:
        for line in process.stdout:
            line = line.rstrip()
            print(f"[{prefix}] {line}")
            try:
                with open(LOG_FILE, "a", encoding="utf-8") as f:
                    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S,%f')[:-3]
                    f.write(f"{timestamp} - {prefix} - INFO - {line}\n")
            except Exception:
                pass # Ignore file write errors to not crash the thread
    except Exception as e:
        logger.error(f"Ошибка при чтении вывода процесса {prefix}: {e}")

def wait_for_http(url: str, timeout: int = 30, prefix: str = "") -> bool:
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=2) as response:
                if response.getcode() == 200:
                    return True
        except urllib.error.URLError:
            pass
        except Exception:
            pass
        time.sleep(1)
    return False

def validate_environment():
    # Check package.json
    pkg_path = ROOT / "package.json"
    if not pkg_path.exists():
        logger.error("Файл package.json не найден.")
        sys.exit(1)
    
    try:
        with open(pkg_path, "r", encoding="utf-8") as f:
            pkg_data = json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"Ошибка чтения package.json: {e}")
        sys.exit(1)
    
    if "scripts" not in pkg_data:
        logger.error("В package.json отсутствует раздел 'scripts'.")
        sys.exit(1)
        
    if "frontend" not in pkg_data["scripts"]:
        logger.error("В package.json отсутствует скрипт 'frontend'.")
        sys.exit(1)
        
    # Check node_modules
    if not (ROOT / "node_modules").exists():
        logger.error("Папка node_modules не найдена. Пожалуйста, выполните 'npm install'.")
        sys.exit(1)
        
    # Check npm command
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    if shutil.which(npm_cmd) is None:
        logger.error(f"Команда '{npm_cmd}' не найдена. Убедитесь, что Node.js установлен.")
        sys.exit(1)
        
    return npm_cmd

def main() -> None:
    logger.info("Запуск стартового скрипта run_dev.py")
    
    npm_cmd = validate_environment()
    
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

    backend_cmd = [python_exe, "-u", str(ROOT / "main.py")]
    frontend_cmd = [npm_cmd, "run", "frontend", "--", "--host", frontend_host, "--port", str(frontend_port)]

    logger.info(f"Команда запуска бэкенда: {' '.join(backend_cmd)}")
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
    except Exception as e:
        logger.error(f"Ошибка запуска бэкенда: {e}")
        sys.exit(1)

    t1 = threading.Thread(target=stream_process_output, args=(backend_process, "BACKEND"), daemon=True)
    t1.start()

    # Wait for backend to be ready
    backend_url = f"http://{backend_host}:{backend_port}/api/health"
    logger.info(f"Ожидание запуска бэкенда по адресу {backend_url}...")
    if not wait_for_http(backend_url, timeout=30, prefix="BACKEND"):
        logger.error("Бэкенд не ответил вовремя. Завершение работы.")
        backend_process.terminate()
        sys.exit(1)
    logger.info("Бэкенд успешно запущен и доступен.")

    logger.info(f"Команда запуска фронтенда: {' '.join(frontend_cmd)}")
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
    except Exception as e:
        logger.error(f"Ошибка запуска фронтенда: {e}")
        backend_process.terminate()
        sys.exit(1)

    t2 = threading.Thread(target=stream_process_output, args=(frontend_process, "FRONTEND"), daemon=True)
    t2.start()

    # Wait for frontend to be ready
    frontend_url = f"http://{frontend_host}:{frontend_port}"
    logger.info(f"Ожидание запуска фронтенда по адресу {frontend_url}...")
    if not wait_for_http(frontend_url, timeout=60, prefix="FRONTEND"):
        logger.error("Фронтенд не ответил вовремя. Завершение работы.")
        backend_process.terminate()
        frontend_process.terminate()
        sys.exit(1)
    logger.info("Фронтенд успешно запущен и доступен.")

    try:
        logger.info(f"Открытие браузера по адресу {frontend_url}")
        webbrowser.open(frontend_url)
    except Exception as exc:
        logger.error(f"Не удалось открыть браузер автоматически: {exc}")

    try:
        while True:
            backend_code = backend_process.poll()
            frontend_code = frontend_process.poll()

            if backend_code is not None:
                logger.error(f"BACKEND завершился с кодом {backend_code}")
                frontend_process.terminate()
                sys.exit(1)

            if frontend_code is not None:
                logger.error(f"FRONTEND завершился с кодом {frontend_code}")
                backend_process.terminate()
                sys.exit(1)

            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Остановка процессов пользователем (KeyboardInterrupt)...")
        backend_process.terminate()
        frontend_process.terminate()
        sys.exit(0)
    except Exception as e:
        logger.error(f"Системное исключение в главном цикле: {e}")
        backend_process.terminate()
        frontend_process.terminate()
        sys.exit(1)
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
