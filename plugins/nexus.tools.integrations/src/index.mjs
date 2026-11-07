import { definitions } from './definitions.mjs';
import { createToolRuntime } from '../../../lib/model-tools/runtime.mjs';
import { decodeInput } from './input.mjs';
import { executeIntegrations } from './operations.mjs';

export default createToolRuntime({ definitions, decode: decodeInput, perform: executeIntegrations });
