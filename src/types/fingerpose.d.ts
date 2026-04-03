declare module "fingerpose" {
  export enum Finger {
    Thumb = 0,
    Index = 1,
    Middle = 2,
    Ring = 3,
    Pinky = 4,
  }

  export enum FingerCurl {
    NoCurl = 0,
    HalfCurl = 1,
    FullCurl = 2,
  }

  export enum FingerDirection {
    VerticalUp = 0,
    VerticalDown = 1,
    HorizontalLeft = 2,
    HorizontalRight = 3,
    DiagonalUpRight = 4,
    DiagonalUpLeft = 5,
    DiagonalDownRight = 6,
    DiagonalDownLeft = 7,
  }

  export class GestureDescription {
    name: string;
    constructor(name: string);
    addCurl(finger: Finger, curl: FingerCurl, confidence: number): this;
    addDirection(finger: Finger, direction: FingerDirection, confidence: number): this;
  }

  export interface GestureMatch {
    name: string;
    score: number;
  }

  export interface EstimationResult {
    gestures: GestureMatch[];
    poseData: unknown[];
  }

  export class GestureEstimator {
    constructor(gestures: GestureDescription[]);
    estimate(landmarks: number[][], minScore: number): EstimationResult;
  }
}
