import * as core from '@actions/core';
import { installDotNet } from './installer';

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
		core.info('Setting up .NET');

		// Read inputs
		const sdkVersion = core.getInput('dotnet-sdk');
		const runtimeVersion = core.getInput('dotnet-runtime');

		core.debug(`Input: dotnet-sdk='${sdkVersion}'`);
		core.debug(`Input: dotnet-runtime='${runtimeVersion}'`);

		// Validate inputs - at least one must be specified
		if (!sdkVersion && !runtimeVersion) {
			throw new Error(
				'At least one of dotnet-sdk or dotnet-runtime must be specified',
			);
		}

		// Prepare installation tasks
		const installTasks: Promise<InstallationResult>[] = [];

		if (sdkVersion) {
			core.info(`Installing .NET SDK ${sdkVersion}...`);
			installTasks.push(
				installDotNet({
					version: sdkVersion,
					type: 'sdk',
				}),
			);
		}

		if (runtimeVersion) {
			core.info(`Installing .NET Runtime ${runtimeVersion}...`);
			installTasks.push(
				installDotNet({
					version: runtimeVersion,
					type: 'runtime',
				}),
			);
		}

		// Install in parallel
		const installations = await Promise.all(installTasks);

		// Log results
		for (const result of installations) {
			core.info(
				`✓ .NET ${result.type} ${result.version} installed at ${result.path}`,
			);
		}

		// Set outputs
		const versions = installations
			.map((i) => `${i.type}:${i.version}`)
			.join(', ');
		const paths = installations.map((i) => i.path).join(':');

		core.setOutput('dotnet-version', versions);
		core.setOutput('dotnet-path', paths);

		core.info('✓ .NET setup completed successfully');
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
