'use client';

import { Bot, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { SettingsNav } from '@/components/settings/settings-nav';
import {
  SettingsCallout,
  SettingsPageHeader,
  SettingsSection,
} from '@/components/settings/settings-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PersonRow {
  id: string;
  email: string;
  role: string;
  userId: string | null;
  principalId: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

export default function SettingsPeoplePage() {
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');

  const reload = useCallback(async () => {
    const response = await fetch('/api/people');
    const body = (await response.json()) as {
      people?: PersonRow[];
      error?: string;
    };
    if (!response.ok) {
      setError(
        response.status === 403
          ? 'Only workspace owners and admins can manage People.'
          : (body.error ?? 'Could not load people'),
      );
      return;
    }
    setError('');
    setPeople(body.people ?? []);
  }, []);

  useEffect(() => {
    void reload().catch(() => setError('Could not load people'));
  }, [reload]);

  async function invite() {
    if (!email.trim()) {
      setError('Enter an email address.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? 'Could not invite person');
        return;
      }
      setEmail('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not invite person');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SettingsNav />
      <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
        <SettingsPageHeader
          icon={Users}
          title="People"
          description="Add coworkers to this workspace by email. No email is sent — they sign in with that address, then you grant database access under Access."
        />

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <SettingsSection
          icon={Users}
          title={`Members${people.length ? ` (${people.length})` : ''}`}
        >
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No people yet. Add one below.
                    </TableCell>
                  </TableRow>
                ) : (
                  people.map((person) => (
                    <TableRow key={person.id}>
                      <TableCell className="font-medium">
                        {person.email}
                      </TableCell>
                      <TableCell>
                        {ROLE_LABELS[person.role] ?? person.role}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {person.userId ? 'Joined' : 'Invited'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </SettingsSection>

        <SettingsSection
          icon={UserPlus}
          title="Add a person"
          description="They appear as Invited until they sign in with that email. Share the app link yourself — we do not send an invite email yet."
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                className="w-64"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="alex@company.com"
              />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select
                value={role}
                onValueChange={(value) =>
                  setRole(value === 'admin' ? 'admin' : 'member')
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button disabled={busy} onClick={() => void invite()}>
              {busy ? 'Adding…' : 'Add person'}
            </Button>
          </div>
        </SettingsSection>

        <SettingsCallout icon={ShieldCheck}>
          Next, open{' '}
          <a href="/settings/access" className="text-primary underline">
            Access
          </a>{' '}
          to share specific databases with people you just added, or group them
          first under{' '}
          <a href="/settings/teams" className="text-primary underline">
            Teams
          </a>
          .
        </SettingsCallout>
        <SettingsCallout icon={Bot}>
          Looking for AI helpers instead of people? Create and manage named
          agents on the{' '}
          <a href="/settings/connect" className="text-primary underline">
            Connect AI
          </a>{' '}
          page.
        </SettingsCallout>
      </div>
    </div>
  );
}
