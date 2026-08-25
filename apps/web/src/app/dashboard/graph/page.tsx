'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  List,
  ListRow,
  MasteryBadge,
  Page,
  PageHeader,
  PageLoading,
  ProgressBar,
  Section,
  Segmented,
} from '@/components/ui';

interface KnowledgeNode {
  id: string;
  conceptId: string;
  confidence: number;
  mastery: number;
  weaknessScore: number;
  practiceCount: number;
  lastRevision?: string;
  concept: { id: string; name: string; description?: string; parentConceptId?: string };
}

type SortKey = 'weakest' | 'strongest' | 'practiced';

export default function KnowledgeGraphPage() {
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('weakest');

  useEffect(() => {
    Promise.all([api.getGraph(), api.getConcepts()])
      .then(([graph, conceptList]) => {
        setNodes(graph.nodes || []);
        setConcepts(conceptList || []);
      })
      .catch(() => {
        setNodes([]);
        setConcepts([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    const copy = [...nodes];
    if (sort === 'weakest') return copy.sort((a, b) => a.mastery - b.mastery);
    if (sort === 'strongest') return copy.sort((a, b) => b.mastery - a.mastery);
    return copy.sort((a, b) => b.practiceCount - a.practiceCount);
  }, [nodes, sort]);

  const summary = useMemo(() => {
    if (nodes.length === 0) return null;
    const avg = Math.round(nodes.reduce((s, n) => s + n.mastery, 0) / nodes.length);
    const weakest = [...nodes].sort((a, b) => a.mastery - b.mastery)[0];
    const strong = nodes.filter((n) => n.mastery >= 80).length;
    return { avg, weakest, strong };
  }, [nodes]);

  if (loading) return <PageLoading />;

  const selected = nodes.find((n) => n.id === selectedId);
  const untracked = concepts.filter(
    (c: any) => !c.parentConceptId && !nodes.some((n) => n.conceptId === c.id),
  );

  return (
    <Page width="wide">
      <PageHeader
        title="Knowledge graph"
        description="Every concept edOS has evidence for, and how well you know it."
      />

      {nodes.length === 0 ? (
        <EmptyState
          icon="graph"
          title="Nothing tracked yet"
          description="Concepts appear here once you take an assessment or the agents observe you studying something."
          action={
            <ButtonLink href="/dashboard/assessment" variant="primary">
              Take an assessment
            </ButtonLink>
          }
        />
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-4">
                <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                  {nodes.length}
                </p>
                <p className="mt-0.5 text-2xs text-gray-500 dark:text-gray-400">Concepts tracked</p>
              </Card>
              <Card className="p-4">
                <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                  {summary.avg}%
                </p>
                <p className="mt-0.5 text-2xs text-gray-500 dark:text-gray-400">Average mastery</p>
              </Card>
              <Card className="p-4">
                <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                  {summary.strong}
                </p>
                <p className="mt-0.5 text-2xs text-gray-500 dark:text-gray-400">Mastered</p>
              </Card>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-5">
            <div className="space-y-2.5 lg:col-span-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Concepts</h2>
                <Segmented
                  aria-label="Sort concepts"
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: 'weakest', label: 'Weakest' },
                    { value: 'strongest', label: 'Strongest' },
                    { value: 'practiced', label: 'Most practised' },
                  ]}
                />
              </div>

              <List>
                {sorted.map((node) => (
                  <ListRow
                    key={node.id}
                    onClick={() => setSelectedId(node.id)}
                    className={selectedId === node.id ? 'bg-gray-50 dark:bg-dark-tertiary' : undefined}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                        {node.concept?.name || 'Unknown concept'}
                      </span>
                      <span className="mt-1.5 block">
                        <ProgressBar value={node.mastery} label={`${node.concept?.name} mastery`} />
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                      {Math.round(node.mastery)}%
                    </span>
                  </ListRow>
                ))}
              </List>
            </div>

            <div className="space-y-5 lg:col-span-2">
              <div className="lg:sticky lg:top-6 lg:space-y-5">
                {selected ? (
                  <Card className="space-y-4">
                    <div>
                      <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {selected.concept?.name}
                      </h2>
                      <div className="mt-1.5">
                        <MasteryBadge mastery={selected.mastery} />
                      </div>
                    </div>

                    {selected.concept?.description && (
                      <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        {selected.concept.description}
                      </p>
                    )}

                    <dl className="space-y-2 text-xs">
                      <Row label="Mastery" value={`${Math.round(selected.mastery)}%`} />
                      <Row label="Confidence" value={`${Math.round(selected.confidence)}%`} />
                      <Row label="Times practised" value={String(selected.practiceCount)} />
                      <Row
                        label="Last reviewed"
                        value={
                          selected.lastRevision
                            ? new Date(selected.lastRevision).toLocaleDateString()
                            : 'Never'
                        }
                      />
                    </dl>

                    <ButtonLink href="/dashboard/assessment" variant="primary" block size="sm">
                      Practise this
                    </ButtonLink>
                  </Card>
                ) : (
                  <Card className="py-10 text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Select a concept to see the detail.
                    </p>
                  </Card>
                )}

                {untracked.length > 0 && (
                  <Section
                    title="Not started"
                    description="Curricula available to pick up."
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {untracked.slice(0, 12).map((c: any) => (
                        <Badge key={c.id}>{c.name}</Badge>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium tabular-nums text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  );
}
