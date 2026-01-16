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
		const enableCache = core.getBooleanInput('enable-cache');

		core.debug(`Input: dotnet-sdk='${sdkVersion}'`);
		core.debug(`Input: dotnet-runtime='${runtimeVersion}'`);
		core.debug(`Input: enable-cache='${enableCache}'`);

		// Validate inputs - at least one must be specified
		if (!sdkVersion && !runtimeVersion) {
			throw new Error(
				'At least one of dotnet-sdk or dotnet-runtime must be specified',
			);
		}

		const installations: InstallationResult[] = [];
		let overallCacheHit = true;

		// Install SDK if specified
		if (sdkVersion) {
			core.info(`Installing .NET SDK ${sdkVersion}...`);
			core.debug('Starting SDK installation');
			const result = await installDotNet({
				version: sdkVersion,
				type: 'sdk',
				enableCache,
			});
			installations.push(result);
			core.debug(`SDK installation result: ${JSON.stringify(result)}`);
			if (!result.cacheHit) {
				overallCacheHit = false;
			}
			core.info(`✓ .NET SDK ${result.version} installed at ${result.path}`);
		}

		// Install Runtime if specified
		if (runtimeVersion) {
			core.info(`Installing .NET Runtime ${runtimeVersion}...`);
			core.debug('Starting Runtime installation');
			const result = await installDotNet({
				version: runtimeVersion,
				type: 'runtime',
				enableCache,
			});
			installations.push(result);
			core.debug(`Runtime installation result: ${JSON.stringify(result)}`);
			if (!result.cacheHit) {
				overallCacheHit = false;
			}
			core.info(`✓ .NET Runtime ${result.version} installed at ${result.path}`);
		}

		// Set outputs
		const versions = installations
			.map((i) => `${i.type}:${i.version}`)
			.join(', ');
		const paths = installations.map((i) => i.path).join(':');

		core.debug(`Setting output dotnet-version: ${versions}`);
		core.debug(`Setting output cache-hit: ${overallCacheHit}`);
		core.debug(`Setting output dotnet-path: ${paths}`);

		core.setOutput('dotnet-version', versions);
		core.setOutput('cache-hit', overallCacheHit.toString());
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
