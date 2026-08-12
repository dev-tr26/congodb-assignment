"""SNAP "ego-Facebook" network — the classic undirected friendship graph.

4,039 nodes / 88,234 edges. Free, no sign-up, ~218 KB gzipped.
https://snap.stanford.edu/data/facebook_combined.html
"""
import gzip
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET_URL = "https://snap.stanford.edu/data/facebook_combined.txt.gz"
DATA_DIR = ROOT / "data"
LOCAL_FILE = DATA_DIR / "facebook_combined.txt"


def ensure_dataset():
    """Ensure the plain-text edge list exists locally (downloads if needed)."""
    if LOCAL_FILE.exists():
        return str(LOCAL_FILE)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading dataset from {DATASET_URL} …")
    with urllib.request.urlopen(DATASET_URL) as response:
        if response.status != 200:
            raise RuntimeError(
                f"Dataset download failed (HTTP {response.status}). "
                f"Try again, or place the file at {LOCAL_FILE}."
            )
        plain = gzip.decompress(response.read())
    LOCAL_FILE.write_bytes(plain)
    print(f"Saved edge list to {LOCAL_FILE}")
    return str(LOCAL_FILE)


def read_edges(file=LOCAL_FILE):
    """Parse the "from to" edge list into a list of (a, b) pairs."""
    edges = []
    with open(file, "r", encoding="utf-8") as fh:
        for line in fh:
            text = line.strip()
            if not text or text.startswith("#"):
                continue
            parts = text.split()
            if len(parts) < 2:
                continue
            edges.append((int(parts[0]), int(parts[1])))
    return edges
