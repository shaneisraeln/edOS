/**
 * Barrel export for the edOS UI primitives.
 *
 * Pages should import from '@/components/ui' rather than reaching into
 * individual files, so the surface stays small and swappable.
 */

export { Button, ButtonLink, type ButtonProps } from './button';
export { Field, Input, Textarea, Select, Segmented, Switch } from './field';
export {
  Page,
  PageHeader,
  Section,
  Card,
  CardLink,
  List,
  ListRow,
  Stat,
  StatGrid,
} from './layout';
export {
  Spinner,
  Skeleton,
  PageLoading,
  EmptyState,
  ErrorState,
  Alert,
  Badge,
  StatusDot,
  ProgressBar,
  MasteryBadge,
} from './feedback';
export { Dialog } from './dialog';
export { Icon, type IconName } from '../icon';
