/** Variable expansion is one pass; inserted values are not re-interpreted as templates. */
export const commandVariables = (command: string) => [
	...new Set([...command.matchAll(/\$\{([\w.-]+)\}/g)].map((match) => match[1]!)),
];

export const expandCommand = (command: string, values: Record<string, string>) =>
	command.replace(/\$\{([\w.-]+)\}/g, (match, name) => values[name] ?? match);
