import { DocumentChunk } from '../types/index';

// Simplified vector store for portfolio demo - no PDFs, always returns empty.
// The full implementation uses ChromaDB + VoyageAI embeddings.

export async function initializeVectorStore(_chunks: DocumentChunk[]): Promise<void> {
  // No-op for portfolio demo
}

export async function queryRelevantChunks(_query: string, _topK = 5): Promise<DocumentChunk[]> {
  return [];
}

export function isVectorStoreReady(): boolean {
  return false;
}
