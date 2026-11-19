import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');

describe('Firestore Security Rules & Blueprint Integrity', () => {
  const rules = fs.readFileSync(rulesPath, 'utf8');
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8')) as {
    entities: Record<string, unknown>;
    firestore: Record<string, unknown>;
  };

  it('enforces a global default-deny catch-all rule', () => {
    expect(rules).toMatch(/match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/);
  });

  it('prevents self-escalation of user roles on profile creation and updates', () => {
    expect(rules).toContain("incoming().role == 'patient'");
    expect(rules).toContain('incoming().role == existing().role');
  });

  it('protects immutable audit logs and event trails from modification or deletion', () => {
    expect(rules).toMatch(/match \/audit_logs\/\{auditId\}[\s\S]*allow update, delete: if false;/);
    expect(rules).toMatch(/match \/events\/\{eventId\}[\s\S]*allow update, delete: if false;/);
    expect(rules).toMatch(/match \/triage_logs\/\{triageId\}[\s\S]*allow update, delete: if false;/);
  });

  it('isolates live tenant vs demo-maharashtra tenant on updates', () => {
    expect(rules).toContain('incoming().tenantId == existing().tenantId');
    expect(rules).toContain("isDemoTenant(tenantId)");
    expect(rules).toContain("tenantId in ['mh-live', 'demo-maharashtra']");
  });

  it('defines matching collections in firebase-blueprint.json', () => {
    expect(blueprint.entities).toBeDefined();
    expect(Object.keys(blueprint.firestore).length).toBeGreaterThan(5);
    expect(blueprint.firestore['/users/{uid}/ai_sessions/{sessionId}']).toBeDefined();
  });

  it('enforces owner-only access on ai_sessions and immutable ai messages', () => {
    expect(rules).toMatch(/match \/ai_sessions\/\{sessionId\}[\s\S]*isOwner\(uid\)/);
    expect(rules).toMatch(/match \/messages\/\{messageId\}[\s\S]*allow update: if false;/);
  });
});
