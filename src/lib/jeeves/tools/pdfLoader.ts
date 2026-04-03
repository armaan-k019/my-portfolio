import { DocumentChunk } from '../types/index';

// Simplified PDF loader for portfolio demo - no PDFs available, always returns empty.
// The full implementation uses pdf-parse to chunk PDFs from a ground-truth directory.

export async function loadPDFsFromDirectory(_dirPath: string): Promise<DocumentChunk[]> {
  return [];
}
