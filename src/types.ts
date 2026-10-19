export type Selection =
  | { kind: 'vertex'; curveId: string; x: number; y: number }
  | { kind: 'root'; curveId: string; x: number }
  | { kind: 'intersection'; idA: string; idB: string; x: number }
  | { kind: 'marker'; markerId: string; x: number; y: number };

export interface View {
  cx: number;
  cy: number;
  /** pixels per world unit */
  scale: number;
}

export interface IntersectionPoint {
  key: string;
  idA: string;
  idB: string;
  x: number;
  y: number;
  touches: boolean;
}

export interface PointEntry {
  id: string;
  x: string;
  y: string;
  color: string;
  visible: boolean;
}

export interface MarkerPose {
  id: string;
  color: string;
  x: number;
  y: number;
}

