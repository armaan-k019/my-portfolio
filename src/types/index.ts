export type Vector3D = { x: number; y: number; z: number };

export type Face = { a: number; b: number; c: number };

export type RoomShape = {
  vertices: Vector3D[];
  faces: Face[];
};

export type MaterialType =
  | 'concrete'
  | 'brick'
  | 'wood'
  | 'carpet'
  | 'glass'
  | 'acoustic'
  | 'gypsum'
  | 'upholstered';

export type SurfaceGroup = {
  label: string;         // "Floor", "Ceiling", "Walls", "Face 0–N"
  faceIndices: number[]; // which face indices belong to this group
  material: MaterialType;
};

export type OctaveBandRT60 = {
  hz125: number;
  hz250: number;
  hz500: number;
  hz1000: number;
  hz2000: number;
  hz4000: number;
};

export type AcousticMetrics = {
  volume: number;
  surfaceArea: number;
  rt60: number;            // average (500 Hz band)
  octaveBandRT60: OctaveBandRT60;
  earlyReflections: number;
};

export type SoundRay = {
  origin: Vector3D;
  direction: Vector3D;
  bounces: Vector3D[];
  intensity: number;
};

export type ReceiverPoint = {
  id: string;
  position: Vector3D;
  label: string;
};

export type ShapeArchetype = 'orthogonal' | 'pitched' | 'cylinder' | 'barrel_vault' | 'dome';

export type ShapeParams = {
  archetype: ShapeArchetype;
  dimensions: {
    length?: number;
    width?: number;
    height?: number;
    radius?: number;
    peak_height?: number;
  };
};
