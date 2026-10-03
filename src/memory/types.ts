import { z } from 'zod';
import type { RiskLevel } from '../tools/types.js';

export type SupportedLanguage = 'en' | 'ur' | 'ar' | 'mixed';
export type OutputVerbosity = 'concise' | 'balanced' | 'detailed';
export type SessionStatus = 'ACTIVE' | 'IDLE' | 'PAUSED' | 'COMPLETED';
export type TaskExecutionStatus =
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'WAITING_FOR_AUTHORIZATION'
  | 'WAITING_FOR_USER';

/**
 * User Profile & Persistent Preferences
 */
export interface UserProfile {
  userId: string;
  displayName?: string;
  preferredLanguage: SupportedLanguage;
  speechVoice?: string;
  speechRate?: number;
  outputVerbosity: OutputVerbosity;
  defaultSearchEngine?: string;
  defaultDownloadDirectory?: string;
  customPreferences: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export const userProfileSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().optional(),
  preferredLanguage: z.enum(['en', 'ur', 'ar', 'mixed']).default('en'),
  speechVoice: z.string().optional(),
  speechRate: z.number().min(0.5).max(2.0).optional(),
  outputVerbosity: z.enum(['concise', 'balanced', 'detailed']).default('balanced'),
  defaultSearchEngine: z.string().optional(),
  defaultDownloadDirectory: z.string().optional(),
  customPreferences: z.record(z.unknown()).default({}),
  createdAt: z.number().default(() => Date.now()),
  updatedAt: z.number().default(() => Date.now()),
});

/**
 * Domain-Specific Preference
 */
export interface DomainPreference {
  domain: string;
  autoFillAllowed?: boolean;
  preferredSearchUrl?: string;
  customRules?: string[];
  notes?: string;
  lastVisitedAt?: number;
  visitCount?: number;
  updatedAt: number;
}

export const domainPreferenceSchema = z.object({
  domain: z.string().min(1),
  autoFillAllowed: z.boolean().optional(),
  preferredSearchUrl: z.string().url().optional(),
  customRules: z.array(z.string()).optional(),
  notes: z.string().optional(),
  lastVisitedAt: z.number().optional(),
  visitCount: z.number().int().min(0).optional(),
  updatedAt: z.number().default(() => Date.now()),
});

/**
 * Active Session State
 */
export interface SessionState {
  sessionId: string;
  startedAt: number;
  updatedAt: number;
  status: SessionStatus;
  activeUrl?: string;
  activeTabId?: string;
  currentGoal?: string;
  activePlanId?: string;
  metadata: Record<string, unknown>;
}

export const sessionStateSchema = z.object({
  sessionId: z.string().min(1),
  startedAt: z.number().default(() => Date.now()),
  updatedAt: z.number().default(() => Date.now()),
  status: z.enum(['ACTIVE', 'IDLE', 'PAUSED', 'COMPLETED']).default('ACTIVE'),
  activeUrl: z.string().optional(),
  activeTabId: z.string().optional(),
  currentGoal: z.string().optional(),
  activePlanId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

/**
 * Persisted Task / Workflow Record
 */
export interface TaskRecord {
  taskId: string;
  sessionId?: string;
  instruction: string;
  intent: string;
  language: string;
  status: TaskExecutionStatus;
  stepsCount: number;
  startedAt: number;
  completedAt?: number;
  summary: string;
  speechSummary?: string;
  error?: string;
  riskLevel?: RiskLevel;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export const taskRecordSchema = z.object({
  taskId: z.string().min(1),
  sessionId: z.string().optional(),
  instruction: z.string().min(1),
  intent: z.string().default('UNKNOWN'),
  language: z.string().default('en'),
  status: z.enum([
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'WAITING_FOR_AUTHORIZATION',
    'WAITING_FOR_USER',
  ]),
  stepsCount: z.number().int().min(0).default(0),
  startedAt: z.number().default(() => Date.now()),
  completedAt: z.number().optional(),
  summary: z.string().default(''),
  speechSummary: z.string().optional(),
  error: z.string().optional(),
  riskLevel: z.enum(['R0', 'R1', 'R2', 'R3']).optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Filter for querying task execution history
 */
export interface MemoryQueryFilter {
  query?: string;
  intent?: string;
  status?: TaskExecutionStatus;
  domain?: string;
  fromDate?: number;
  toDate?: number;
  limit?: number;
  offset?: number;
}
