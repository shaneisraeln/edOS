'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  List,
  ListRow,
  Page,
  PageHeader,
  PageLoading,
  Section,
  StatusDot,
  Switch,
} from '@/components/ui';

const PERMISSIONS: { key: string; label: string; description: string }[] = [
  { key: 'browser', label: 'Browser activity', description: 'Pages you read on educational sites.' },
  { key: 'ide', label: 'Editor activity', description: 'Files and languages you work in.' },
  { key: 'documents', label: 'Documents', description: 'PDFs and documents you read.' },
  { key: 'aiPlatforms', label: 'AI platforms', description: 'Conversations with ChatGPT, Claude and similar.' },
  { key: 'notifications', label: 'Notifications', description: 'Revision reminders and knowledge checks.' },
  { key: 'screenContext', label: 'Screen context', description: 'Window titles used to detect the current topic.' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [permissions, setPermissions] = useState<Record<string, boolean> | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.request<any>('/settings/permissions'),
      api.request<any[]>('/settings/devices'),
    ])
      .then(([perms, devs]) => {
        setPermissions(perms);
        setDevices(devs || []);
      })
      .catch((err: any) => setError(err.message || 'Could not load your settings'))
      .finally(() => setLoading(false));
  }, []);

  const togglePermission = async (key: string, next: boolean) => {
    if (!permissions) return;

    const previous = permissions[key];
    setPermissions({ ...permissions, [key]: next });
    setError('');

    try {
      await api.request<any>('/settings/permissions', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: next }),
      });
    } catch (err: any) {
      // Roll back so the switch never lies about server state.
      setPermissions((current) => (current ? { ...current, [key]: previous } : current));
      setError(err.message || 'Could not save that change');
    }
  };

  if (loading) return <PageLoading />;

  return (
    <Page width="narrow">
      <PageHeader
        title="Settings"
        description="What edOS is allowed to observe, and which devices are reporting."
      />

      {error && <Alert>{error}</Alert>}

      <Section
        title="Data collection"
        description="Every one of these can be turned off at any time."
      >
        <List>
          {PERMISSIONS.map((p) => (
            <ListRow key={p.key}>
              <span className="min-w-0 pr-4">
                <span className="block text-sm text-gray-900 dark:text-gray-100">{p.label}</span>
                <span className="mt-0.5 block text-2xs text-gray-500 dark:text-gray-400">
                  {p.description}
                </span>
              </span>
              <Switch
                checked={Boolean(permissions?.[p.key])}
                onChange={(next) => togglePermission(p.key, next)}
                label={p.label}
              />
            </ListRow>
          ))}
        </List>
      </Section>

      <Section title="Devices" description="Agents that have reported activity to your account.">
        {devices.length === 0 ? (
          <EmptyState
            icon="desktop"
            title="No devices yet"
            description="Sign in from the desktop agent, browser extension or editor extension and they will register here."
          />
        ) : (
          <List>
            {devices.map((d: any) => (
              <ListRow key={d.id}>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                    {d.deviceName}
                  </span>
                  <span className="mt-0.5 block text-2xs text-gray-500 dark:text-gray-400">
                    {d.platform}
                    {d.lastActiveAt
                      ? ` · last seen ${new Date(d.lastActiveAt).toLocaleString()}`
                      : ' · never active'}
                  </span>
                </span>
                <Badge tone={d.active ? 'success' : 'neutral'}>
                  <StatusDot tone={d.active ? 'live' : 'off'} />
                  {d.active ? 'Active' : 'Inactive'}
                </Badge>
              </ListRow>
            ))}
          </List>
        )}
      </Section>

      <Section title="Account">
        <Card className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-900 dark:text-gray-100">Sign out</p>
            <p className="mt-0.5 text-2xs text-gray-500 dark:text-gray-400">
              Clears your session on this browser only.
            </p>
          </div>
          <Button
            variant="danger"
            onClick={() => {
              localStorage.clear();
              router.push('/login');
            }}
          >
            Sign out
          </Button>
        </Card>
      </Section>
    </Page>
  );
}
