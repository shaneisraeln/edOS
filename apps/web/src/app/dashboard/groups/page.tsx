'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Input,
  List,
  ListRow,
  Page,
  PageHeader,
  PageLoading,
  Section,
  Textarea,
} from '@/components/ui';

interface StudyGroup {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  creator?: { name: string };
}

interface GroupMember {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  user?: { name: string; email: string };
}

interface LeaderboardEntry {
  userId: string;
  name: string;
  averageMastery: number;
}

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [groupDetail, setGroupDetail] = useState<StudyGroup | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) {
      router.push('/login');
      return;
    }
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      setGroups(await api.request<StudyGroup[]>('/groups'));
    } catch (err: any) {
      if (err.message?.includes('401')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Could not load groups');
    } finally {
      setLoading(false);
    }
  };

  const createGroup = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError('');

    try {
      await api.request<StudyGroup>('/groups/create', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || undefined,
        }),
      });
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
      await loadGroups();
    } catch (err: any) {
      setError(err.message || 'Could not create the group');
    } finally {
      setCreating(false);
    }
  };

  const joinGroup = async (groupId: string) => {
    setJoining(groupId);
    setError('');
    try {
      await api.request(`/groups/${groupId}/join`, { method: 'POST', body: '{}' });
      await loadGroupDetail(groupId);
    } catch (err: any) {
      setError(err.message || 'Could not join that group');
    } finally {
      setJoining(null);
    }
  };

  const loadGroupDetail = async (groupId: string) => {
    setSelectedGroup(groupId);
    try {
      const [group, membersData, lb] = await Promise.all([
        api.request<StudyGroup>(`/groups/${groupId}`),
        api.request<GroupMember[]>(`/groups/${groupId}/members`),
        api.request<LeaderboardEntry[]>(`/groups/${groupId}/leaderboard`),
      ]);
      setGroupDetail(group);
      setMembers(membersData);
      setLeaderboard(lb);
    } catch (err: any) {
      setError(err.message || 'Could not load that group');
    }
  };

  if (loading) return <PageLoading />;

  return (
    <Page>
      <PageHeader
        title="Study groups"
        description="Compare progress with other learners working on the same things."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setShowCreate(true)}>
            Create group
          </Button>
        }
      />

      {error && <Alert>{error}</Alert>}

      {groups.length === 0 ? (
        <EmptyState
          icon="users"
          title="No groups yet"
          description="Create a group and share it with people studying the same topic."
          action={
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              Create a group
            </Button>
          }
        />
      ) : (
        <Section title="Groups">
          <List>
            {groups.map((group) => (
              <ListRow
                key={group.id}
                onClick={() => loadGroupDetail(group.id)}
                className={
                  selectedGroup === group.id ? 'bg-gray-50 dark:bg-dark-tertiary' : undefined
                }
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                    {group.name}
                  </span>
                  <span className="mt-0.5 block truncate text-2xs text-gray-500 dark:text-gray-400">
                    {group.description || `Created by ${group.creator?.name || 'someone'}`}
                  </span>
                </span>
                <Button
                  size="sm"
                  onClick={() => joinGroup(group.id)}
                  loading={joining === group.id}
                >
                  Join
                </Button>
              </ListRow>
            ))}
          </List>
        </Section>
      )}

      {selectedGroup && groupDetail && (
        <>
          <Section
            title="Leaderboard"
            description={`Average mastery across ${groupDetail.name}`}
          >
            {leaderboard.length === 0 ? (
              <Card>
                <p className="text-xs text-gray-500 dark:text-gray-400">No members yet.</p>
              </Card>
            ) : (
              <List>
                {leaderboard.map((entry, idx) => (
                  <ListRow key={entry.userId}>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="w-4 shrink-0 text-2xs tabular-nums text-gray-500 dark:text-gray-400">
                        {idx + 1}
                      </span>
                      <span className="truncate text-sm text-gray-900 dark:text-gray-100">
                        {entry.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                      {Math.round(entry.averageMastery)}%
                    </span>
                  </ListRow>
                ))}
              </List>
            )}
          </Section>

          <Section title={`Members (${members.length})`}>
            <List>
              {members.map((member) => (
                <ListRow key={member.id}>
                  <span className="truncate text-sm text-gray-900 dark:text-gray-100">
                    {member.user?.name || 'Unknown'}
                  </span>
                  <Badge tone={member.role === 'owner' ? 'accent' : 'neutral'}>{member.role}</Badge>
                </ListRow>
              ))}
            </List>
          </Section>
        </>
      )}

      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create a group"
        footer={
          <>
            <Button onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={createGroup}
              loading={creating}
              disabled={!newName.trim()}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Systems design study group"
          />
          <Textarea
            label="Description"
            hint="Optional"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="What the group is working through"
          />
        </div>
      </Dialog>
    </Page>
  );
}
