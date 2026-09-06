'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

interface TeamRow {
  id: string;
  name: string;
  principalId: string;
  memberPrincipalIds: string[];
}

interface PersonRow {
  principalId: string;
  email: string;
  userId: string | null;
  role: string;
}

export default function SettingsTeamsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [memberPrincipalId, setMemberPrincipalId] = useState('');

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );

  const nameForPrincipal = useCallback(
    (principalId: string) =>
      people.find((person) => person.principalId === principalId)?.email ??
      'Unknown',
    [people],
  );

  const reload = useCallback(async () => {
    const response = await fetch('/api/teams');
    const body = (await response.json()) as {
      teams?: TeamRow[];
      people?: PersonRow[];
      error?: string;
    };
    if (!response.ok) {
      setError(body.error ?? 'Could not load teams');
      return;
    }
    setError('');
    setTeams(body.teams ?? []);
    setPeople(body.people ?? []);
    setSelectedTeamId((prev) => prev || body.teams?.[0]?.id || '');
    setMemberPrincipalId((prev) => prev || body.people?.[0]?.principalId || '');
  }, []);

  useEffect(() => {
    void reload().catch(() => setError('Could not load teams'));
  }, [reload]);

  async function createTeam() {
    if (!name.trim()) {
      setError('Enter a team name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name }),
      });
      const body = (await response.json()) as {
        team?: TeamRow;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not create team');
        return;
      }
      setName('');
      await reload();
      if (body.team?.id) {
        setSelectedTeamId(body.team.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create team');
    } finally {
      setBusy(false);
    }
  }

  async function addMember() {
    if (!selectedTeamId || !memberPrincipalId) {
      setError('Pick a team and a person.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addMember',
          teamId: selectedTeamId,
          principalId: memberPrincipalId,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? 'Could not add person to team');
        return;
      }
      await reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not add person to team',
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(principalId: string) {
    if (!selectedTeamId) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'removeMember',
          teamId: selectedTeamId,
          principalId,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? 'Could not remove person');
        return;
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove person');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SettingsNav />
      <div className="mx-auto w-full max-w-3xl space-y-8 p-6">
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Teams</h2>
          <p className="text-sm text-muted-foreground">
            Group people so you can share database access with everyone on the
            team at once.
          </p>
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="space-y-4 rounded-lg border border-border p-4">
          <div>
            <h3 className="text-sm font-medium">Create a team</h3>
            <p className="text-xs text-muted-foreground">
              Example: Sales, Support, Finance.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="team-name">Name</Label>
              <Input
                id="team-name"
                className="w-56"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Sales"
              />
            </div>
            <Button disabled={busy} onClick={() => void createTeam()}>
              {busy ? 'Creating…' : 'Create team'}
            </Button>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border p-4">
          <div>
            <h3 className="text-sm font-medium">Manage team members</h3>
            <p className="text-xs text-muted-foreground">
              After adding people, give the team access under Access.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Team</Label>
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Choose a team…" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTeam ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {selectedTeam.memberPrincipalIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No members yet.
                  </p>
                ) : (
                  selectedTeam.memberPrincipalIds.map((principalId) => (
                    <Badge
                      key={principalId}
                      variant="secondary"
                      className="gap-2 px-2 py-1"
                    >
                      {nameForPrincipal(principalId)}
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        disabled={busy}
                        onClick={() => void removeMember(principalId)}
                      >
                        ×
                      </button>
                    </Badge>
                  ))
                )}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label>Person</Label>
                  <Select
                    value={memberPrincipalId}
                    onValueChange={setMemberPrincipalId}
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Choose…" />
                    </SelectTrigger>
                    <SelectContent>
                      {people.map((person) => (
                        <SelectItem
                          key={person.principalId}
                          value={person.principalId}
                        >
                          {person.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button disabled={busy} onClick={() => void addMember()}>
                  Add to team
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Create a team above to start adding people.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
