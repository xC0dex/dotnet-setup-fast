import * as core from '@actions/core';
import * as toolCache from '@actions/tool-cache';
import { extractArchive } from './utils/archive-utils';
import { getArchitecture, getPlatform } from './utils/platform-utils';
import { resolveVersion } from './utils/version-resolver';

export interface InstallOptions {
	version: string;
	type: 'sdk' | 'runtime';
}

export interface InstallResult {
	version: string;
	type: 'sdk' | 'runtime';
	path: string;
}

/**
 * Install .NET SDK or Runtime
 */
export async function installDotNet(
	options: InstallOptions,
): Promise<InstallResult> {
	const { version, type } = options;

	core.debug(`installDotNet called with: version='${version}', type='${type}'`);

	// Resolve wildcard versions to concrete version
	core.debug(`Resolving version: ${version}`);
	const resolvedVersion = await resolveVersion(version, type);
	core.info(`Resolved version: ${resolvedVersion}`);

	// Download and install
	core.info(`Downloading .NET ${type} ${resolvedVersion}...`);
	const platform = getPlatform();
	const arch = getArchitecture();
	core.debug(`Platform: ${platform}, Architecture: ${arch}`);
	const downloadUrl = getDotNetDownloadUrl(resolvedVersion, type);
	core.debug(`Download URL: ${downloadUrl}`);

	core.debug('Starting download...');
	let downloadPath: string;
	try {
		downloadPath = await downloadWithRetry(downloadUrl, 3);
		core.debug(`Downloaded to: ${downloadPath}`);
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		core.error(`Download failed after retries: ${errorMsg}`);
		core.debug(`Full error details: ${JSON.stringify(error)}`);
		throw new Error(
			`Failed to download .NET ${type} ${resolvedVersion} from ${downloadUrl}: ${errorMsg}`,
		);
	}

	// Extract archive
	core.info('Extracting archive...');
	core.debug(`Extracting archive from: ${downloadPath}`);
	const ext = platform === 'win' ? 'zip' : 'tar.gz';
	const extractedPath = await extractArchive(downloadPath, ext);
	core.debug(`Extracted to: ${extractedPath}`);

	// Add to PATH
	core.debug(`Adding to PATH: ${extractedPath}`);
	core.addPath(extractedPath);
	core.info('Added to PATH');

	return {
		version: resolvedVersion,
		type,
		path: extractedPath,
	};
}

/**
 * Get the download URL for .NET
 */
export function getDotNetDownloadUrl(
	version: string,
	type: 'sdk' | 'runtime',
): string {
	const platform = getPlatform();
	const arch = getArchitecture();
	const ext = platform === 'win' ? 'zip' : 'tar.gz';

	const typeCapitalized = type === 'sdk' ? 'Sdk' : 'Runtime';
	const packageName = type === 'sdk' ? 'sdk' : 'runtime';

	return `https://builds.dotnet.microsoft.com/dotnet/${typeCapitalized}/${version}/dotnet-${packageName}-${version}-${platform}-${arch}.${ext}`;
}

/**
 * Download with retry logic
 */
async function downloadWithRetry(
	url: string,
	maxRetries: number,
): Promise<string> {
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			core.debug(`Download attempt ${attempt}/${maxRetries}`);
			const downloadPath = await toolCache.downloadTool(url);
			core.debug(`Download successful on attempt ${attempt}`);
			return downloadPath;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			core.warning(
				`Download attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
			);

			if (attempt < maxRetries) {
				const waitTime = attempt * 5;
				core.info(`Waiting ${waitTime} seconds before retry...`);
				await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
			}
		}
	}

	throw lastError || new Error('Download failed for unknown reason');
}
