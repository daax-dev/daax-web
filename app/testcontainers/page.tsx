/**
 * Test Containers Dashboard Page
 *
 * Main page for managing test containers.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Container,
  RefreshCw,
  Plus,
  AlertCircle,
  Search,
  Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useContainers } from '@/plugins/testcontainers/hooks';
import { ContainerCard } from '@/plugins/testcontainers/components';
import type { ContainerAction, ContainerStatus } from '@/plugins/testcontainers/types';

export default function TestContainersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filter = useMemo(() => ({
    search: search || undefined,
    status: statusFilter !== 'all' ? [statusFilter as ContainerStatus] : undefined,
  }), [search, statusFilter]);

  const {
    containers,
    total,
    loading,
    error,
    dockerStatus,
    refresh,
    startContainer,
    stopContainer,
    restartContainer,
    removeContainer,
  } = useContainers({
    autoRefresh: true,
    refreshInterval: 10000,
    filter,
  });

  const handleAction = useCallback(
    async (action: ContainerAction, id: string) => {
      try {
        switch (action) {
          case 'start':
            await startContainer(id);
            toast.success('Container started');
            break;
          case 'stop':
            await stopContainer(id);
            toast.success('Container stopped');
            break;
          case 'restart':
            await restartContainer(id);
            toast.success('Container restarted');
            break;
          case 'remove':
            await removeContainer(id, true);
            toast.success('Container removed');
            break;
          case 'logs':
            // Open logs in a new tab/modal
            window.open(`/testcontainers/${id}/logs`, '_blank');
            break;
          case 'inspect':
            // Navigate to details page
            router.push(`/testcontainers/${id}`);
            break;
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Action failed');
      }
    },
    [router, startContainer, stopContainer, restartContainer, removeContainer]
  );

  // Count containers by status
  const runningCount = containers.filter((c) => c.status === 'running').length;
  const stoppedCount = containers.filter(
    (c) => c.status === 'exited' || c.status === 'dead'
  ).length;

  // Docker not connected state
  if (dockerStatus && !dockerStatus.connected) {
    return (
      <div className="container py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Docker Not Available</h1>
          <p className="text-muted-foreground max-w-md mb-4">
            Unable to connect to the Docker daemon. Make sure Docker is running
            and accessible.
          </p>
          <div className="bg-muted rounded-lg p-4 text-left text-sm font-mono max-w-md mb-4">
            <p className="text-muted-foreground mb-2"># Start Docker daemon:</p>
            <p>sudo systemctl start docker</p>
            <p className="text-muted-foreground mt-4 mb-2"># Or on macOS:</p>
            <p>open -a Docker</p>
          </div>
          <Button onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Container className="h-6 w-6" />
            Test Containers
          </h1>
          <p className="text-muted-foreground">
            Manage ephemeral testing infrastructure
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button asChild>
            <Link href="/testcontainers/catalog">
              <Plus className="h-4 w-4 mr-2" />
              Launch Container
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Containers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Running
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-500">{runningCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Stopped
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-500">{stoppedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search containers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="exited">Stopped</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      )}

      {/* Container list */}
      {containers.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Container className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium mb-2">No containers found</h2>
          <p className="text-muted-foreground max-w-md mb-4">
            {search || statusFilter !== 'all'
              ? 'No containers match your filters. Try adjusting your search or filter.'
              : 'Launch a container from the catalog to get started.'}
          </p>
          <Button asChild>
            <Link href="/testcontainers/catalog">
              <Plus className="h-4 w-4 mr-2" />
              Browse Catalog
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {containers.map((container) => (
            <ContainerCard
              key={container.id}
              container={container}
              onAction={handleAction}
            />
          ))}
        </div>
      )}

      {/* Loading overlay */}
      {loading && containers.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
