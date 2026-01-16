import * as core from '@actions/core';
import { installDotNet } from './installer';
import { parseVersions } from './utils/input-parser';

interface InstallationResult {
	version: string;
	type: 'sdk' | 'runtime';
	path: string;
}

/**
 * Main entry point for the GitHub Action
 */
export async function run(): Promise<void> {
	try {
		const sdkInput = core.getInput('dotnet-sdk');
		const runtimeInput = core.getInput('dotnet-runtime');

		const sdkVersions = parseVersions(sdkInput);
		const runtimeVersions = parseVersions(runtimeInput);

		if (sdkVersions.length === 0 && runtimeVersions.length === 0) {
			throw new Error(
				'At least one of dotnet-sdk or dotnet-runtime must be specified',
			);
		}

		// Show installation plan
		const installPlan: string[] = [];
		if (sdkVersions.length > 0) {
			installPlan.push(`SDK ${sdkVersions.join(', ')}`);
		}
		if (runtimeVersions.length > 0) {
			installPlan.push(`Runtime ${runtimeVersions.join(', ')}`);
		}
		core.info(`📦 Installing .NET: ${installPlan.join(' | ')}`);

		// Prepare installation tasks
		const installTasks: Promise<InstallationResult>[] = [];

		for (const version of sdkVersions) {
			installTasks.push(
				installDotNet({
					version,
					type: 'sdk',
				}),
			);
		}

		for (const version of runtimeVersions) {
			installTasks.push(
				installDotNet({
					version,
					type: 'runtime',
				}),
			);
		}

		// Install in parallel
		const installations = await Promise.all(installTasks);

		core.info('');

		core.info('');

		// Log results
		core.info('✅ Installation complete:');
		for (const result of installations) {
			const typeLabel = result.type.toUpperCase().padEnd(7);
			core.info(`   ${typeLabel} ${result.version}`);
		}
		core.info(`   Path: ${installations[0].path}`);

		// Set outputs
		const versions = installations
			.map((i) => `${i.type}:${i.version}`)
			.join(', ');
		const paths = installations.map((i) => i.path).join(':');

		core.setOutput('dotnet-version', versions);
		core.setOutput('dotnet-path', paths);
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		} else {
			core.setFailed('An unknown error occurred');
		}
	}
}

// Run the action
run();
