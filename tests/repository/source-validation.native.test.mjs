import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireSuccessfulSourceValidation } from '../../scripts/lib/source-validation.mjs';

const valid = {
	head_sha: 'source',
	path: '.github/workflows/validate.yml',
	status: 'completed',
	conclusion: 'success',
};

function client(pages) {
	const listWorkflowRuns = Symbol('listWorkflowRuns');
	return {
		rest: { actions: { listWorkflowRuns } },
		paginate: {
			async *iterator(method, options) {
				assert.equal(method, listWorkflowRuns);
				assert.deepEqual(options, {
					owner: 'owner',
					repo: 'repo',
					workflow_id: 'validate.yml',
					head_sha: 'source',
					per_page: 100,
				});
				for (const page of pages) {
					yield { data: page };
				}
			},
		},
	};
}

const invalid = [
	{ ...valid, head_sha: 'another-source' },
	{ ...valid, path: '.github/workflows/release.yml' },
	{ ...valid, status: 'in_progress' },
	{ ...valid, conclusion: 'failure' },
	{ ...valid, conclusion: 'cancelled' },
	{ ...valid, conclusion: 'skipped' },
];

test('release validation paginates exact-source runs without relying on the conclusion index', async () => {
	const result = await requireSuccessfulSourceValidation({
		github: client([invalid, [valid]]),
		owner: 'owner',
		repo: 'repo',
		sha: 'source',
	});
	assert.equal(result, valid);
});

test('release validation rejects absent, incomplete, failed and different-source workflows', async () => {
	for (const pages of [[], [invalid]]) {
		await assert.rejects(
			requireSuccessfulSourceValidation({ github: client(pages), owner: 'owner', repo: 'repo', sha: 'source' }),
			/Complete successful Validate workflow required/,
		);
	}
});
