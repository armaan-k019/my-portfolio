"""Embed the Goodfire demo corpus with all-MiniLM-L6-v2 (mean pooled, L2
normalized) and write int8 vectors for the browser.

Usage: python3 scripts/goodfire-embed.py path/to/model.onnx path/to/tokenizer.json

Needs numpy, onnxruntime, and tokenizers. Reads
src/app/demos/goodfire/corpus.json and writes public/demos/goodfire/vectors.json.
"""

import base64
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "src/app/demos/goodfire/corpus.json"
OUT = ROOT / "public/demos/goodfire/vectors.json"


def embed(model_path: str, tokenizer_path: str, texts: list[str]) -> np.ndarray:
    tok = Tokenizer.from_file(tokenizer_path)
    tok.enable_truncation(max_length=128)
    tok.enable_padding()
    enc = tok.encode_batch(texts)
    ids = np.array([e.ids for e in enc], dtype=np.int64)
    mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
    session = ort.InferenceSession(model_path)
    hidden = session.run(
        None, {"input_ids": ids, "attention_mask": mask, "token_type_ids": np.zeros_like(ids)}
    )[0]
    m = mask[..., None].astype(np.float32)
    pooled = (hidden * m).sum(1) / m.sum(1)
    return pooled / np.linalg.norm(pooled, axis=1, keepdims=True)


def main() -> None:
    corpus = json.loads(CORPUS.read_text())
    texts = [s["text"] for s in corpus["sentences"]]
    vecs = embed(sys.argv[1], sys.argv[2], texts)
    scale = float(np.abs(vecs).max()) / 127.0
    q = np.clip(np.round(vecs / scale), -127, 127).astype(np.int8)
    OUT.write_text(
        json.dumps(
            {
                "model": "sentence-transformers/all-MiniLM-L6-v2",
                "dims": int(vecs.shape[1]),
                "count": len(texts),
                "scale": scale,
                "int8": base64.b64encode(q.tobytes()).decode("ascii"),
            }
        )
        + "\n"
    )
    print(f"wrote {len(texts)} vectors of {vecs.shape[1]} dims to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
