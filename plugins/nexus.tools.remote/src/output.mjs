function fields(value, names) {
	const result = {};
	for (const name of names) {
		if (Object.hasOwn(value, name)) {
			result[name] = value[name];
		}
	}
	return result;
}

function commands(values) {
	return values.map((item) =>
		fields(item, ['index', 'status', 'exitCode', 'signal', 'stdout', 'stderr', 'truncated']),
	);
}

function job(value) {
	const result = fields(value, [
		'jobId',
		'waitingForSpace',
		'state',
		'revision',
		'createdAt',
		'updatedAt',
		'offset',
		'nextOffset',
		'capturedBytes',
		'available',
		'complete',
	]);
	if (Object.hasOwn(value, 'result')) {
		result.result =
			value.result === null
				? null
				: {
						status: value.result.status,
						...(value.result.commands === undefined ? {} : { commands: commands(value.result.commands) }),
					};
	}
	if (value.output !== undefined) {
		result.output = value.output.map((item) => ({
			commandIndex: item.commandIndex,
			stream: item.stream,
			text: item.text,
		}));
	}
	return result;
}

export function shellOutput(value) {
	const result = fields(value, [
		'jobId',
		'accepted',
		'waitingForSpace',
		'state',
		'revision',
		'createdAt',
		'updatedAt',
		'status',
		'nextIndex',
		'nextOffset',
	]);
	if (value.outputRead !== undefined) {
		result.outputRead = {
			connectionId: value.outputRead.connectionId,
			action: value.outputRead.action,
			jobIds: value.outputRead.jobIds.map((id) => id),
			offset: value.outputRead.offset,
		};
	}
	if (value.commands !== undefined) {
		result.commands = commands(value.commands);
	}
	if (Object.hasOwn(value, 'result')) {
		result.result = job(value).result;
	}
	if (value.jobs !== undefined) {
		result.jobs = value.jobs.map(job);
	}
	return result;
}

export function hostDiagnostics(value) {
	return {
		collectedAt: value.collectedAt,
		process: fields(value.process, [
			'uptimeSeconds',
			'residentBytes',
			'heapUsedBytes',
			'runtimeVersion',
			'heapTotalBytes',
			'externalBytes',
			'arrayBufferBytes',
			'cpuUserSeconds',
			'cpuSystemSeconds',
			'gcCount',
			'gcDurationSeconds',
		]),
		modules: value.modules.map((module) => ({
			id: module.id,
			status: module.status,
			metrics: module.metrics.map((metric) => ({ name: metric.name, unit: metric.unit, value: metric.value })),
		})),
		database: { available: value.database.available, schemaVersion: value.database.schemaVersion },
	};
}
