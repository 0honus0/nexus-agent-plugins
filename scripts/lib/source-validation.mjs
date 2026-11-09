/** Do not depend on GitHub's conclusion-filter index to find a just-completed run. */
export async function requireSuccessfulSourceValidation({ github, owner, repo, sha }) {
	for await (const page of github.paginate.iterator(github.rest.actions.listWorkflowRuns, {
		owner,
		repo,
		workflow_id: 'validate.yml',
		head_sha: sha,
		per_page: 100,
	})) {
		const run = page.data.find(
			(item) =>
				item.head_sha === sha &&
				item.path === '.github/workflows/validate.yml' &&
				item.status === 'completed' &&
				item.conclusion === 'success',
		);
		if (run) {
			return run;
		}
	}
	throw new Error('Complete successful Validate workflow required for this exact source');
}
