import { describe, expect, it } from 'vitest';
import { resolveToast } from './remediationToast';

describe('resolveToast', () => {
  it('reports success when reprocessing started', () => {
    const t = resolveToast({ spark_triggered: true, message: 'ok' }, 'T1');
    expect(t).toEqual({ type: 'success', message: 'ok' });
  });

  it('warns when the ticket closed but reprocessing did not start', () => {
    const t = resolveToast({ spark_triggered: false, trigger_error: 'daemon unreachable (ConnectionError)' }, 'T1');
    expect(t.type).toBe('warning');
    expect(t.message).toContain('T1');
    expect(t.message).toContain('ยังไม่ได้เริ่มประมวลผล');
    expect(t.message).toContain('daemon unreachable (ConnectionError)');
  });

  it('warns even when the server sent no reason', () => {
    expect(resolveToast({ spark_triggered: false }, 'T1').type).toBe('warning');
  });

  it('keeps showing success for a response that predates the flag', () => {
    expect(resolveToast({ message: 'done' }, 'T1')).toEqual({ type: 'success', message: 'done' });
    expect(resolveToast(undefined, 'T1').type).toBe('success');
  });
});
