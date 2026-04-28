export const FRAUD_QUEUE = 'fraud';

// Weighted contribution to final fraud score
export const FRAUD_WEIGHTS = {
  metadata: 0.10,
  ela: 0.15,
  gemini: 0.75,
} as const;

// Score thresholds for verdict
export const FRAUD_THRESHOLDS = {
  suspicious: 0.3,   // score >= 0.3 → SUSPICIOUS
  likelyForged: 0.6, // score >= 0.6 → LIKELY_FORGED
} as const;

// Skip Gemini if early score (metadata + ELA) is below this — image is clean
export const EARLY_EXIT_THRESHOLD = 0.05;

// ELA: divide image into this many blocks per axis (16x16 = 256 blocks total)
export const ELA_GRID_SIZE = 16;

// ELA: blocks with mean diff > mean + N*stddev are flagged as suspicious
export const ELA_STDDEV_THRESHOLD = 2;

// Known image editing software — presence in EXIF is a strong fraud signal
export const KNOWN_EDITING_SOFTWARE = [
  'Adobe Photoshop',
  'PicsArt',
  'Snapseed',
  'GIMP',
  'Adobe Lightroom',
  'Affinity Photo',
  'Pixlr',
  'Canva',
  'Paint.NET',
  'CorelDRAW',
  'Adobe Illustrator',
  'Facetune',
  'YouCam',
  'Meitu',
  'BeautyPlus',
];
