import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

let active = false;
let activation = null;

const assertDenied = (probe, expectedPermission) => {
  try {
    probe();
  } catch (error) {
    if (error?.code === 'ERR_ACCESS_DENIED' && error?.permission === expectedPermission) return true;
    throw error;
  }
  throw new Error(`FULLSTACK_PERMISSION_NOT_ENFORCED:${expectedPermission}`);
};

const module = {
  async activate(input) {
    const { context, request } = input;
    if (context.protocol !== 1 || context.sdkVersion !== '1') throw new Error('PLUGIN_CONTEXT_MISMATCH');
    const requestHost = async (value) => {
      const response = await request(value);
      if (!response.ok) throw new Error(response.error.code);
      if (response.result.method !== value.method) throw new Error('PLUGIN_RESPONSE_MISMATCH');
      return response.result.value;
    };
    const fileReadDenied = assertDenied(() => fs.readFileSync('/etc/passwd', 'utf8'), 'FileSystemRead');
    const childProcessDenied = assertDenied(() => spawnSync(process.execPath, ['--version']), 'ChildProcess');
    const current = await requestHost({ method: 'storage.get', params: { key: 'backend.status' } });
    await requestHost({
      method: 'storage.put',
      params: {
        key: 'backend.status',
        expectedVersion: current?.version ?? 0,
        operationId: randomUUID(),
        valueJson: JSON.stringify({
          state: 'active',
          source: 'backend',
          appId: context.appId,
          version: context.version,
          protocolVersion: context.protocol,
          fileReadDenied,
          childProcessDenied,
        }),
      },
    });
    activation = context;
    active = true;
  },

  health() {
    return active && activation !== null;
  },

  quiesce() {
    return undefined;
  },

  dispose() {
    active = false;
    activation = null;
  },
};

export default module;
