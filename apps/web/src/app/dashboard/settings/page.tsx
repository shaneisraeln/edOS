'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const router = useRouter();
  const [permissions, setPermissions] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const [perms, devs] = await Promise.all([
        api.request<any>('/settings/permissions'),
        api.request<any[]>('/settings/devices'),
      ]);
      setPermissions(perms);
      setDevices(devs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const togglePermission = async (key: string) => {
    const updated = { ...permissions, [key]: !permissions[key] };
    setPermissions(updated);
    await api.request<any>('/settings/permissions', { method: 'PATCH', body: JSON.stringify({ [key]: updated[key] }) });
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>;

  const permissionList = [
    { key: 'browser', label: 'Browser Activity', desc: 'Track page visits on educational sites' },
    { key: 'ide', label: 'IDE Activity', desc: 'Track coding sessions in VS Code' },
    { key: 'documents', label: 'Documents', desc: 'Track PDF and document reading' },
    { key: 'aiPlatforms', label: 'AI Platforms', desc: 'Track ChatGPT, Claude usage' },
    { key: 'notifications', label: 'Notifications', desc: 'Receive revision reminders and alerts' },
    { key: 'screenContext', label: 'Screen Context', desc: 'Analyze screen content for topic detection' },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Permissions */}
        <div className="card">
          <h2 className="font-semibold mb-4">Permissions</h2>
          <p className="text-sm text-gray-500 mb-4">Control what edOS can access. All permissions can be revoked at any time.</p>
          <div className="space-y-3">
            {permissionList.map(p => (
              <div key={p.key} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <div>
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="text-xs text-gray-400">{p.desc}</p>
                </div>
                <button onClick={() => togglePermission(p.key)} className={`w-10 h-5 rounded-full transition-colors ${permissions?.[p.key] ? 'bg-primary-600' : 'bg-gray-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${permissions?.[p.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Devices */}
        <div className="card">
          <h2 className="font-semibold mb-4">Devices</h2>
          {devices.length > 0 ? (
            <div className="space-y-2">
              {devices.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{d.deviceName}</p>
                    <p className="text-xs text-gray-400">{d.platform} • Last active: {d.lastActiveAt ? new Date(d.lastActiveAt).toLocaleDateString() : 'Never'}</p>
                  </div>
                  <span className={`text-xs ${d.active ? 'text-green-600' : 'text-gray-400'}`}>{d.active ? 'Active' : 'Inactive'}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No devices registered. Install the Desktop Agent or Browser Extension to get started.</p>
          )}
        </div>

        {/* Account */}
        <div className="card">
          <h2 className="font-semibold mb-4">Account</h2>
          <button onClick={() => { localStorage.clear(); router.push('/login'); }} className="btn-secondary text-sm text-red-600">Sign Out</button>
        </div>
      </div>
    </div>
  );
}
