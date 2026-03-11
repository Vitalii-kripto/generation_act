import os
import sys
import subprocess

def setup():
    try:
        print("Python version:", sys.version)
        print("Python executable:", sys.executable)
        print("Ensuring pip is installed...")
        try:
            subprocess.run([sys.executable, "-m", "pip", "--version"], check=True, capture_output=True)
        except Exception:
            print("Downloading get-pip.py...")
            import urllib.request
            urllib.request.urlretrieve("https://bootstrap.pypa.io/get-pip.py", "get-pip.py")
            print("Installing pip...")
            subprocess.run([sys.executable, "get-pip.py"], check=True)
        
        print("Installing requirements...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], check=True)
        print("Requirements installed successfully.")
    except Exception as e:
        print(f"Error during setup: {e}")

if __name__ == "__main__":
    setup()
