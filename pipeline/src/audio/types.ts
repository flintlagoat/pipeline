export interface KeptRange {
  start: number; // seconds in original audio
  end: number;   // seconds in original audio
}

export interface AudioProcessResult {
  cleanAudioPath: string;
  timestamps: import('../types/specTypes').WordTimestamp[];
  duration: number;
}
