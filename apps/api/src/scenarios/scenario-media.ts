import { resolve } from 'node:path';

export const MEDIA_DIRECTORY =
  process.env.MEDIA_DIRECTORY ?? resolve(__dirname, '../../../../scenarios/videos');
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
