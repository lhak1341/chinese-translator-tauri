import { logger } from '../logger.js';
import type { CleanupPriority } from './SmartMemoryPressureDetector.js';

export type { CleanupPriority };

export interface CleanupTask {
  id: string;
  task: () => any;
  priority: CleanupPriority;
  queued: number;
  attempts: number;
  maxAttempts: number;
}

export interface BackgroundCleanupStats {
  queueLength: number;
  tasksProcessed: number;
  tasksQueued: number;
  idleTimeUsedMs: string;
  averageTaskTimeMs: string;
  isProcessing: boolean;
}

interface IdleDeadline {
  timeRemaining(): number;
}

export class BackgroundCleanupManager {
  private readonly MAX_QUEUE_SIZE = 100;
  private cleanupQueue: CleanupTask[];
  private isProcessing: boolean;
  private stats: {
    tasksProcessed: number;
    tasksQueued: number;
    idleTimeUsed: number;
    averageTaskTime: number;
  };

  constructor() {
    this.cleanupQueue = [];
    this.isProcessing = false;
    this.stats = {
      tasksProcessed: 0,
      tasksQueued: 0,
      idleTimeUsed: 0,
      averageTaskTime: 0,
    };
  }

  queueCleanup(task: () => any, priority: CleanupPriority = 'normal'): void {
    if (this.cleanupQueue.length >= this.MAX_QUEUE_SIZE) {
      logger.warn(
        `⚠️ Cleanup queue full (${this.MAX_QUEUE_SIZE}), attempting to evict low-priority tasks`
      );

      const lowPriorityIndex = this.cleanupQueue.findIndex((t) => t.priority === 'low');
      if (lowPriorityIndex !== -1) {
        const evicted = this.cleanupQueue.splice(lowPriorityIndex, 1)[0];
        logger.log(`🗑️ Evicted low-priority cleanup task: ${evicted.id}`);
      } else {
        if (priority !== 'urgent') {
          logger.error(
            `❌ Cannot queue ${priority} cleanup task - queue full with ${this.cleanupQueue.length} urgent/normal tasks`
          );
          return;
        }
        logger.warn(`⚠️ Forcing urgent cleanup task into full queue`);
      }
    }

    const cleanupTask: CleanupTask = {
      id: `cleanup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      task,
      priority,
      queued: performance.now(),
      attempts: 0,
      maxAttempts: 3,
    };

    if (priority === 'urgent') {
      this.cleanupQueue.unshift(cleanupTask);
    } else {
      this.cleanupQueue.push(cleanupTask);
    }

    this.stats.tasksQueued++;
    this.processQueue();
  }

  private processQueue(): void {
    if (this.isProcessing || this.cleanupQueue.length === 0) return;

    this.isProcessing = true;

    const processNextTask = (deadline: IdleDeadline) => {
      const startTime = performance.now();

      // Capture length BEFORE the loop — retry-failed tasks pushed to end must not
      // re-execute in the same idle callback (defeats deferred-retry intent).
      let head = 0;
      const initialQueueLength = this.cleanupQueue.length;
      while (deadline.timeRemaining() > 5 && head < initialQueueLength) {
        const task = this.cleanupQueue[head];
        head++;

        try {
          const taskStartTime = performance.now();
          task.task();
          const taskDuration = performance.now() - taskStartTime;

          this.stats.tasksProcessed++;
          this.updateAverageTaskTime(taskDuration);

          if (task.priority === 'urgent') {
            logger.log(
              `🧹 Background cleanup: ${task.id} completed in ${taskDuration.toFixed(1)}ms`
            );
          }
        } catch (error) {
          task.attempts++;

          if (task.attempts < task.maxAttempts) {
            task.priority = 'low';
            this.cleanupQueue.push(task);
          } else {
            logger.warn(`🚨 Background cleanup failed after ${task.maxAttempts} attempts:`, error);
          }
        }
      }

      if (head > 0) {
        this.cleanupQueue = this.cleanupQueue.slice(head);
      }

      const totalTime = performance.now() - startTime;
      this.stats.idleTimeUsed += totalTime;

      if (this.cleanupQueue.length > 0) {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(processNextTask, { timeout: 10000 });
        } else {
          setTimeout(() => processNextTask({ timeRemaining: () => 10 }), 100);
        }
      } else {
        this.isProcessing = false;
      }
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(processNextTask, { timeout: 5000 });
    } else {
      setTimeout(() => processNextTask({ timeRemaining: () => 16 }), 0);
    }
  }

  private updateAverageTaskTime(taskTime: number): void {
    const currentAvg = this.stats.averageTaskTime;
    const count = this.stats.tasksProcessed;
    this.stats.averageTaskTime = (currentAvg * (count - 1) + taskTime) / count;
  }

  processUrgentTasks(): void {
    const urgentSet = new Set<CleanupTask>();

    for (const task of this.cleanupQueue) {
      if (task.priority !== 'urgent') continue;
      try {
        task.task();
        this.stats.tasksProcessed++;
        urgentSet.add(task);
      } catch (error) {
        logger.warn('Urgent cleanup task failed:', error);
        urgentSet.add(task);
      }
    }

    if (urgentSet.size > 0) {
      this.cleanupQueue = this.cleanupQueue.filter((task) => !urgentSet.has(task));
    }
  }

  getStats(): BackgroundCleanupStats {
    return {
      queueLength: this.cleanupQueue.length,
      tasksProcessed: this.stats.tasksProcessed,
      tasksQueued: this.stats.tasksQueued,
      idleTimeUsedMs: this.stats.idleTimeUsed.toFixed(1),
      averageTaskTimeMs: this.stats.averageTaskTime.toFixed(1),
      isProcessing: this.isProcessing,
    };
  }

  clear(): void {
    this.cleanupQueue = [];
    this.isProcessing = false;
  }
}
