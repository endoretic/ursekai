#!/usr/bin/env python3

import subprocess
import time
import webbrowser
import signal
import sys
import os

def main():
    port = 8000
    url = f"http://localhost:{port}/paint_local.html"

    print("Starting MySekai X-Ray...")
    print(f"Running on http://localhost:{port}")
    print("Your browser will be opened automatically")
    print()

    # Start HTTP server
    print(f"Starting server on port {port}...")
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    try:
        time.sleep(2)

        print(f"Opening browser at {url}...")
        webbrowser.open(url)

        print()
        print("Server is running. Press Ctrl+C to stop...")
        print()

        server.wait()

    except KeyboardInterrupt:
        print("\n\nShutting down server...")
        server.terminate()
        try:
            server.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
        print("Server stopped. Port released.")
    except Exception as e:
        print(f"Error: {e}")
        if server.poll() is None:
            server.kill()
    finally:
        sys.exit(0)

if __name__ == "__main__":
    main()
