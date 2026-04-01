export type Vector3D = { x: number; y: number; z: number };

export type Face = { a: number; b: number; c: number };

export type RoomShape = {
  vertices: Vector3D[];
  faces: Face[];
};

export type AcousticMetrics = {
  volume: number;
  surfaceArea: number;
  rt60: number;
  earlyReflections: number;
};

export type SoundRay = {
  origin: Vector3D;
  direction: Vector3D;
  bounces: Vector3D[];
  intensity: number;
};
