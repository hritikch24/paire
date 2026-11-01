export type DeviceFaceResult = { matched: boolean; reason: string };
export type DeviceFaceCheck = {
  prepare: () => Promise<void>;
  compare: (selfie: string, photos: string[]) => Promise<DeviceFaceResult>;
  dispose: () => void;
};
