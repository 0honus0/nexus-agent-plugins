import { definitions } from './definitions.mjs';
import { createToolRuntime } from '../../../lib/model-tools/runtime.mjs';
import { decodeInput } from './input.mjs';
import { perform } from './perform.mjs';

export default createToolRuntime({ definitions, decode: decodeInput, perform });
