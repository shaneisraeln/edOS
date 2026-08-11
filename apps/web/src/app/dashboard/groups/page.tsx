'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

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

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      const data = await api.request<StudyGroup[]>('/groups');
      setGroups(data);
    } catch (err: any) {
      if (err.message?.includes('401')) router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const createGroup = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.request<StudyGroup>('/groups/create', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined }),
      });
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
      await loadGroups();
    } catch {}
    setCreating(false);
  };

  const joinGroup = async (groupId: string) => {
    setJoining(groupId);
    try {
      await api.request('/groups/' + groupId + '/join', { method: 'POST', body: '{}' });
      if (selectedGroup === groupId) {
        await loadGroupDetail(groupId);
      }
    } catch {}
    setJoining(null);
  };

  const loadGroupDetail = async (groupId: string) => {
    setSelectedGroup(groupId);
    try {
      const [group, membersData, lb] = await Promise.all([
        api.request<StudyGroup>('/groups/' + groupId),
        api.request<GroupMember[]>('/groups/' + groupId + '/members'),
        api.request<LeaderboardEntry[]>('/groups/' + groupId + '/leaderboard'),
      ]);
      setGroupDetail(group);
      setMembers(membersData);
      setLeaderboard(lb);
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-gray-100 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight">Study Groups</h1>
          <p className="text-sm text-gray-500 mt-1">Collaborate and compete with other learners</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          + Create Group
        </button>
      </header>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface p-5 space-y-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Group name"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={createGroup}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-tertiary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Groups list */}
      <div className="grid gap-3">
        {groups.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No groups yet. Create one to get started!</p>
        )}
        {groups.map((group) => (
          <button
            key={group.id}
            onClick={() => loadGroupDetail(group.id)}
            className={`w-full text-left rounded-2xl border p-5 transition-all ${
              selectedGroup === group.id
                ? 'border-primary-300 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-900/10'
                : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface hover:border-gray-300 dark:hover:border-gray-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{group.name}</p>
                {group.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">Created by {group.creator?.name || 'Unknown'}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); joinGroup(group.id); }}
                disabled={joining === group.id}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-dark-tertiary text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {joining === group.id ? 'Joining...' : 'Join'}
              </button>
            </div>
          </button>
        ))}
      </div>

      {/* Group detail */}
      {selectedGroup && groupDetail && (
        <div className="space-y-6">
          {/* Leaderboard */}
          <section className="space-y-3">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Leaderboard</h2>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface divide-y divide-gray-100 dark:divide-gray-800">
              {leaderboard.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No members yet</p>
              )}
              {leaderboard.map((entry, idx) => (
                <div key={entry.userId} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-400 w-5">{idx + 1}</span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{entry.name}</span>
                  </div>
                  <span className="text-xs tabular-nums font-medium text-primary-600">{entry.averageMastery}%</span>
                </div>
              ))}
            </div>
          </section>

          {/* Members */}
          <section className="space-y-3">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Members ({members.length})</h2>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface divide-y divide-gray-100 dark:divide-gray-800">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{member.user?.name || 'Unknown'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    member.role === 'owner'
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                  }`}>
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
