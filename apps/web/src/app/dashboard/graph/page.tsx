'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

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

interface KnowledgeEdge {
  id: string;
  parentConceptId: string;
  childConceptId: string;
  relationshipType: string;
  strength: number;
}

export default function KnowledgeGraphPage() {
  const router = useRouter();
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [edges, setEdges] = useState<KnowledgeEdge[]>([]);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);

  useEffect(() => {
    loadGraph();
  }, []);

  const loadGraph = async () => {
    try {
      const [graphData, conceptsData] = await Promise.all([
        api.getGraph(),
        api.getConcepts(),
      ]);
      setNodes(graphData.nodes || []);
      setEdges(graphData.edges || []);
      setConcepts(conceptsData || []);
    } catch (err) {
      console.error('Failed to load graph:', err);
    } finally {
      setLoading(false);
    }
  };

  const getMasteryColor = (mastery: number) => {
    if (mastery >= 80) return 'bg-green-500';
    if (mastery >= 60) return 'bg-blue-500';
    if (mastery >= 40) return 'bg-yellow-500';
    if (mastery >= 20) return 'bg-orange-500';
    return 'bg-gray-300 dark:bg-gray-600';
  };

  const getMasteryLabel = (mastery: number) => {
    if (mastery >= 80) return 'Strong';
    if (mastery >= 60) return 'Good';
    if (mastery >= 40) return 'Developing';
    if (mastery >= 20) return 'Weak';
    return 'Not started';
  };

  // Group concepts by curriculum for display
  const topLevelConcepts = concepts.filter((c: any) => !c.parentConceptId);
  const getNodeForConcept = (conceptId: string) => nodes.find((n) => n.conceptId === conceptId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Loading knowledge graph...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Knowledge Graph</h2>
          <span className="text-sm text-gray-400">{nodes.length} concepts tracked</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graph Overview */}
        <div className="lg:col-span-2 space-y-6">
          {nodes.length === 0 ? (
            <div className="card text-center py-12 space-y-4">
              <span className="text-4xl">📊</span>
              <h2 className="text-lg font-semibold">Your knowledge graph is empty</h2>
              <p className="text-sm text-gray-500">
                Complete assessments to start building your knowledge map.
                Each topic you're tested on becomes a node in your graph.
              </p>
              <button
                onClick={() => router.push('/dashboard/assessment')}
                className="btn-primary"
              >
                Take Your First Assessment
              </button>
            </div>
          ) : (
            <>
              {/* Legend */}
              <div className="card">
                <div className="flex items-center gap-4 text-xs">
                  <span className="font-medium text-gray-500">Mastery:</span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-green-500" /> Strong (80%+)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-blue-500" /> Good (60-79%)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-yellow-500" /> Developing (40-59%)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-orange-500" /> Weak (&lt;40%)
                  </span>
                </div>
              </div>

              {/* Concept Tree */}
              <div className="space-y-3">
                {nodes.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`card w-full text-left transition-all hover:ring-1 hover:ring-primary-300 ${
                      selectedNode?.id === node.id ? 'ring-2 ring-primary-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${getMasteryColor(node.mastery)}`} />
                        <div>
                          <p className="font-medium text-sm">{node.concept?.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-400">
                            Practiced {node.practiceCount}x • {getMasteryLabel(node.mastery)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-primary-600">{Math.round(node.mastery)}%</p>
                        <p className="text-xs text-gray-400">mastery</p>
                      </div>
                    </div>
                    {/* Mastery bar */}
                    <div className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-dark-tertiary overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getMasteryColor(node.mastery)}`}
                        style={{ width: `${node.mastery}%` }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Available Concepts (not yet tracked) */}
          {topLevelConcepts.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Available Curricula</h3>
              <div className="flex flex-wrap gap-2">
                {topLevelConcepts.map((c: any) => {
                  const tracked = nodes.some((n) => n.conceptId === c.id);
                  return (
                    <span
                      key={c.id}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                        tracked
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-dark-tertiary'
                      }`}
                    >
                      {c.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="space-y-4">
          {selectedNode ? (
            <div className="card space-y-4 sticky top-6">
              <h3 className="font-semibold">{selectedNode.concept?.name}</h3>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Mastery</span>
                  <span className="font-medium">{Math.round(selectedNode.mastery)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Confidence</span>
                  <span className="font-medium">{Math.round(selectedNode.confidence)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Weakness</span>
                  <span className="font-medium text-orange-500">{Math.round(selectedNode.weaknessScore)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Practice Count</span>
                  <span className="font-medium">{selectedNode.practiceCount}</span>
                </div>
                {selectedNode.lastRevision && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Last Revised</span>
                    <span className="font-medium">
                      {new Date(selectedNode.lastRevision).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  router.push('/dashboard/assessment');
                }}
                className="btn-primary w-full text-sm"
              >
                Practice This Topic
              </button>
            </div>
          ) : (
            <div className="card text-center py-8 space-y-2">
              <p className="text-sm text-gray-400">Select a concept to view details</p>
            </div>
          )}

          {/* Summary Stats */}
          <div className="card space-y-3">
            <h3 className="text-sm font-medium text-gray-500">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Concepts Tracked</span>
                <span className="font-medium">{nodes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Average Mastery</span>
                <span className="font-medium">
                  {nodes.length > 0
                    ? Math.round(nodes.reduce((s, n) => s + n.mastery, 0) / nodes.length)
                    : 0}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Weakest Area</span>
                <span className="font-medium text-orange-500">
                  {nodes.length > 0
                    ? nodes.sort((a, b) => b.weaknessScore - a.weaknessScore)[0]?.concept?.name || '—'
                    : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
