declare global {
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
}

export interface MemorySnapshot {
  used: number;
  total: number;
  limit: number;
  timestamp: number;
}

export interface MemorySample {
  label: string;
  memory: MemorySnapshot;
  timestamp: number;
  memoryDelta: number;
}

export interface ComponentProfile {
  componentName: string;
  operationId: string;
  profileId: string;
  startMemory: MemorySnapshot;
  startTime: number;
  samples: MemorySample[];
  completed: boolean;
  endMemory?: MemorySnapshot;
  endTime?: number;
  metadata?: Record<string, any>;
}

export interface ComponentMetrics {
  componentName: string;
  operationId: string;
  duration: number;
  memoryUsed: number;
  memoryUsedMB: number;
  peakMemoryDelta: number;
  sampleCount: number;
  metadata: Record<string, any>;
}

export interface ComponentStats {
  componentName: string;
  operations: ComponentMetrics[];
  totalMemoryUsed: number;
  averageMemoryUsed: number;
  operationCount: number;
}

export interface TopMemoryConsumer {
  component: string;
  averageMemoryMB: string;
  totalMemoryMB: string;
  operationCount: number;
  recentOperations: ComponentMetrics[];
}

export interface ProfilerStats {
  enabled: boolean;
  activeProfiles: number;
  componentCount: number;
  totalOperationsTracked: number;
}

export class ComponentMemoryProfiler {
  private profiles: Map<string, ComponentProfile | ComponentStats>;
  private samplingEnabled: boolean;

  constructor() {
    this.profiles = new Map();
    this.samplingEnabled = true;
  }

  startProfiling(componentName: string, operationId: string = 'default'): string | null {
    if (!this.samplingEnabled) return null;

    const profileId = `${componentName}:${operationId}`;
    const currentMemory = this.getCurrentMemory();

    if (!currentMemory) return null;

    const profile: ComponentProfile = {
      componentName,
      operationId,
      profileId,
      startMemory: currentMemory,
      startTime: performance.now(),
      samples: [],
      completed: false,
    };

    this.profiles.set(profileId, profile);
    return profileId;
  }

  sample(profileId: string | null, label: string = 'sample'): void {
    if (!this.samplingEnabled || !profileId) return;

    const profile = this.profiles.get(profileId) as ComponentProfile | undefined;
    if (!profile || profile.completed) return;

    const currentMemory = this.getCurrentMemory();
    if (!currentMemory) return;

    profile.samples.push({
      label,
      memory: currentMemory,
      timestamp: performance.now(),
      memoryDelta: currentMemory.used - profile.startMemory.used,
    });
  }

  completeProfiling(
    profileId: string | null,
    metadata: Record<string, any> = {}
  ): ComponentMetrics | null {
    if (!this.samplingEnabled || !profileId) return null;

    const profile = this.profiles.get(profileId) as ComponentProfile | undefined;
    if (!profile || profile.completed) return null;

    const endMemory = this.getCurrentMemory();
    const endTime = performance.now();

    if (!endMemory) return null;

    profile.endMemory = endMemory;
    profile.endTime = endTime;
    profile.completed = true;
    profile.metadata = metadata;

    const metrics: ComponentMetrics = {
      componentName: profile.componentName,
      operationId: profile.operationId,
      duration: endTime - profile.startTime,
      memoryUsed: endMemory.used - profile.startMemory.used,
      memoryUsedMB: (endMemory.used - profile.startMemory.used) / (1024 * 1024),
      peakMemoryDelta: Math.max(...profile.samples.map((s) => s.memoryDelta), 0),
      sampleCount: profile.samples.length,
      metadata,
    };

    this.storeMetrics(profile.componentName, metrics);
    this.profiles.delete(profileId);

    return metrics;
  }

  private storeMetrics(componentName: string, metrics: ComponentMetrics): void {
    if (!this.profiles.has(componentName)) {
      this.profiles.set(componentName, {
        componentName,
        operations: [],
        totalMemoryUsed: 0,
        averageMemoryUsed: 0,
        operationCount: 0,
      });
    }

    const componentProfile = this.profiles.get(componentName) as ComponentStats;
    componentProfile.operations.push(metrics);
    componentProfile.totalMemoryUsed += metrics.memoryUsed;
    componentProfile.operationCount++;
    componentProfile.averageMemoryUsed =
      componentProfile.totalMemoryUsed / componentProfile.operationCount;

    if (componentProfile.operations.length > 50) {
      const removed = componentProfile.operations.shift();
      if (removed) {
        componentProfile.totalMemoryUsed -= removed.memoryUsed;
        componentProfile.operationCount--;
        componentProfile.averageMemoryUsed =
          componentProfile.totalMemoryUsed / componentProfile.operationCount;
      }
    }
  }

  private getCurrentMemory(): MemorySnapshot | null {
    if (!performance.memory) return null;

    return {
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit,
      timestamp: performance.now(),
    };
  }

  getComponentStats(componentName: string | null = null): ComponentStats | ComponentStats[] | null {
    if (componentName) {
      const stats = this.profiles.get(componentName);
      return stats && 'averageMemoryUsed' in stats ? stats : null;
    }

    const stats = Array.from(this.profiles.values())
      .filter((profile): profile is ComponentStats => 'averageMemoryUsed' in profile)
      .sort((a, b) => b.averageMemoryUsed - a.averageMemoryUsed);

    return stats;
  }

  getTopMemoryConsumers(limit: number = 10): TopMemoryConsumer[] {
    const stats = this.getComponentStats() as ComponentStats[];
    return stats.slice(0, limit).map((profile) => ({
      component: profile.componentName,
      averageMemoryMB: (profile.averageMemoryUsed / (1024 * 1024)).toFixed(2),
      totalMemoryMB: (profile.totalMemoryUsed / (1024 * 1024)).toFixed(2),
      operationCount: profile.operationCount,
      recentOperations: profile.operations.slice(-5),
    }));
  }

  setEnabled(enabled: boolean): void {
    this.samplingEnabled = enabled;
    if (!enabled) {
      Array.from(this.profiles.keys()).forEach((key) => {
        if (key.includes(':')) {
          this.profiles.delete(key);
        }
      });
    }
  }

  getProfilerStats(): ProfilerStats {
    const activeProfiles = Array.from(this.profiles.keys()).filter((key) => key.includes(':'));
    const componentStats = Array.from(this.profiles.values()).filter(
      (p): p is ComponentStats => 'averageMemoryUsed' in p
    );

    return {
      enabled: this.samplingEnabled,
      activeProfiles: activeProfiles.length,
      componentCount: componentStats.length,
      totalOperationsTracked: componentStats.reduce((sum, p) => sum + p.operationCount, 0),
    };
  }
}
