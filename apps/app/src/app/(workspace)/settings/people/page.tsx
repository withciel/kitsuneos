'use client';

import { useCallback, useEffect, useState } from 'react';
import { SettingsNav } from '@/components/settings/settings-nav';
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
      <div className="mx-auto w-full max-w-3xl space-y-8 p-6">
        <div className="space-y-2">
          <h2 className="text-lg font-medium">People</h2>
          <p className="text-sm text-muted-foreground">
            Add coworkers to this workspace by email. No email is sent — they
            must sign in with that address, then you grant database access under
            Access.
          </p>
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

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
                    No people yet.
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

        <div className="space-y-4 rounded-lg border border-border p-4">
          <div>
            <h3 className="text-sm font-medium">Add a person</h3>
            <p className="text-xs text-muted-foreground">
              They appear as Invited until they sign in with that email. Share
              the app link yourself — we do not send an invite email yet. Then
              open Access to share databases with them.
            </p>
          </div>
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
        </div>
      </div>
    </div>
  );
}
