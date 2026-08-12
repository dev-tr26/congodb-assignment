import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * SNAP "ego-Facebook" network — the classic undirected friendship graph.
 * 4,039 nodes / 88,234 edges. Free, no sign-up, ~218 KB gzipped.
 * https://snap.stanford.edu/data/facebook_combined.html
 */
export const DATASET_URL = 'https://snap.stanford.edu/data/facebook_combined.txt.gz'
export const DATA_DIR = path.join(ROOT, 'data')
export const LOCAL_FILE = path.join(DATA_DIR, 'facebook_combined.txt')

/** Ensure the plain-text edge list exists locally (downloads if needed). */
export async function ensureDataset() {
  if (fs.existsSync(LOCAL_FILE)) {
    return LOCAL_FILE
  }
  fs.mkdirSync(DATA_DIR, { recursive: true })
  console.log(`Downloading dataset from ${DATASET_URL} …`)
  const res = await fetch(DATASET_URL)
  if (!res.ok) {
    throw new Error(`Dataset download failed (HTTP ${res.status}). Try again, or place the file at ${LOCAL_FILE}.`)
  }
  const plain = zlib.gunzipSync(Buffer.from(await res.arrayBuffer()))
  fs.writeFileSync(LOCAL_FILE, plain)
  console.log(`Saved edge list to ${LOCAL_FILE}`)
  return LOCAL_FILE
}

/** Parse the "from to" edge list into an array of [a, b] pairs. */
export function readEdges(file = LOCAL_FILE) {
  const text = fs.readFileSync(file, 'utf8')
  const edges = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const [a, b] = t.split(/\s+/)
    if (a === undefined || b === undefined) continue
    edges.push([Number(a), Number(b)])
  }
  return edges
}
