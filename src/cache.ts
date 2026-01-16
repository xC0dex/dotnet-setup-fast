import * as core from '@actions/core';
import * as toolCache from '@actions/tool-cache';
import * as os from 'node:os';

export interface CacheResult {
	hit: boolean;
	path: string;
}

/**
 * Setup caching for .NET installation
 */
export async function setupCache(
	dotnetVersion: string,
	type: 'sdk' | 'runtime',
): Promise<CacheResult> {
	core.info('Checking cache...');

	// Generate cache key including version, type, platform, and arch
	const cacheKey = `dotnet-${type}`;
	const platform = os.platform();
	const arch = os.arch();

	core.debug(`Cache lookup: key='${cacheKey}', version='${dotnetVersion}'`);
	core.debug(`Platform: ${platform}, Architecture: ${arch}`);

	// Try to find cached installation
	const cachedPath = toolCache.find(cacheKey, dotnetVersion);

	if (cachedPath) {
		core.info(`Cache hit for ${type} ${dotnetVersion}`);
		core.debug(`Cached installation found at: ${cachedPath}`);
		// Add cached path to PATH
		core.debug(`Adding cached path to PATH: ${cachedPath}`);
		core.addPath(cachedPath);
		return {
			hit: true,
			path: cachedPath,
		};
	}

	core.info(`Cache miss for ${type} ${dotnetVersion}`);
	core.debug('No cached installation found, proceeding with download');
	return {
		hit: false,
		path: '',
	};
}

/**
 * Generate cache key for .NET installation
 */
export function generateCacheKey(
	dotnetVersion: string,
	type: 'sdk' | 'runtime',
): string {
	const platform = os.platform();
	const arch = os.arch();

	// Include platform and architecture in cache key for cross-platform support
	return `dotnet-${type}-${dotnetVersion}-${platform}-${arch}-v1`;
}
