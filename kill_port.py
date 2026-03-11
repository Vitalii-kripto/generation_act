import os
import signal
import subprocess

def kill_port(port):
    try:
        # Find process listening on port
        result = subprocess.run(['lsof', '-t', f'-i:{port}'], capture_output=True, text=True)
        pids = result.stdout.strip().split('\n')
        for pid in pids:
            if pid:
                print(f"Killing process {pid} on port {port}")
                os.kill(int(pid), signal.SIGKILL)
    except Exception as e:
        print(f"Error killing port {port}: {e}")

if __name__ == "__main__":
    kill_port(8001)
