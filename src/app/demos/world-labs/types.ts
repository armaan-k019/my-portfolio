// Shared types for the Ekphrasis demo (page, API routes, and cache file).

export interface SpatialDNA {
  materiality: {
    primary_materials: string[];
    surface_qualities: string;
  };
  scale: {
    dominant_scale: "intimate" | "domestic" | "monumental" | "vast" | "cosmic";
    ceiling_or_sky: string;
    notes: string;
  };
  light: {
    source: string;
    intensity: "dim" | "muted" | "even" | "bright" | "harsh";
    color_temperature: "warm" | "neutral" | "cool" | "shifting";
    notes: string;
  };
  mood: {
    primary_emotion: string;
    atmosphere: string;
  };
  composition: {
    orientation: string;
    density: "sparse" | "moderate" | "dense" | "overwhelming";
    notes: string;
  };
  temperature: {
    thermal: "cold" | "cool" | "temperate" | "warm" | "hot";
    humidity_impression: string;
  };
  sound_implied: string;
  key_interpretive_choice: string;
}

export interface Annotation {
  choice: string;
  reasoning: string;
  text_evidence: string;
}

export interface Reading {
  dna: SpatialDNA;
  annotations: Annotation[];
  // A single paragraph scene description written from the DNA. This is what
  // gets sent to Marble, so the world inherits the interpretation.
  marble_prompt: string;
}

export interface WorldRecord {
  world_id: string;
  marble_url: string;
  thumbnail_url: string | null;
  created_at: string;
}

export interface OperationStatus {
  operation_id: string;
  done: boolean;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED";
  description: string | null;
  error: string | null;
  world: WorldRecord | null;
}
