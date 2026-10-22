import { connectNexusPlugin } from '/sdk/frontend-v1.mjs';

const frontendStatus = document.querySelector('[data-testid="fullstack-frontend-status"]');
const backendStatus = document.querySelector('[data-testid="fullstack-backend-status"]');
const writeButton = document.querySelector('[data-testid="fullstack-write-storage"]');
const storageResult = document.querySelector('[data-testid="fullstack-storage-result"]');

try {
  const nexus = await connectNexusPlugin();
  const request = async (input) => {
    const response = await nexus.request(input);
    if (response.method !== input.method) throw new Error('PLUGIN_RESPONSE_MISMATCH');
    return response.value;
  };
  const app = await request({ method: 'host.appInfo', params: {} });
  frontendStatus.textContent = `frontend:ready:${app.appId}@${app.version}`;

  const backend = await request({ method: 'storage.get', params: { key: 'backend.status' } });
  const backendValue = backend?.valueJson === null || !backend ? null : JSON.parse(backend.valueJson);
  backendStatus.textContent = backendValue?.state === 'active' ? 'backend:active' : 'backend:missing';

  writeButton.addEventListener('click', async () => {
    writeButton.disabled = true;
    try {
      const current = await request({ method: 'storage.get', params: { key: 'frontend.demo' } });
      const previous = current?.valueJson === null || !current ? null : JSON.parse(current.valueJson);
      const counter = Number.isSafeInteger(previous?.counter) && previous.counter >= 0 ? previous.counter + 1 : 1;
      const next = await request({
        method: 'storage.put',
        params: {
          key: 'frontend.demo',
          expectedVersion: current?.version ?? 0,
          operationId: crypto.randomUUID(),
          valueJson: JSON.stringify({ source: 'frontend', counter }),
        },
      });
      storageResult.textContent = `storage:version:${next.version}:counter:${counter}`;
    } catch (error) {
      storageResult.textContent = `storage:error:${error instanceof Error ? error.message : String(error)}`;
    } finally {
      writeButton.disabled = false;
    }
  });
} catch (error) {
  frontendStatus.textContent = `frontend:error:${error instanceof Error ? error.message : String(error)}`;
}
