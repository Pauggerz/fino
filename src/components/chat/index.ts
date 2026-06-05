/**
 * Chat card components (FINO_CHATBOT_CARDS.md §4) — bubble-sized mini visuals
 * and the `ChatCardView` render seam. Purpose-built for the chat bubble; they
 * deliberately do NOT reuse the Stats chart kit (D1).
 */

export { ChatCardView } from './ChatCardView';
export { Reveal, REVEAL_FADE_MS, REVEAL_STAGGER_MS } from './Reveal';
export { MiniBars } from './MiniBars';
export { MiniSparkline } from './MiniSparkline';
export { ProgressBar } from './ProgressBar';
export { DeltaChip } from './DeltaChip';
export {
  roleColor,
  statusColor,
  statusSurface,
  peso,
  shortPeso,
} from './palette';
