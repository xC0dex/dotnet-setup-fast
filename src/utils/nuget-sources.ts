import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

export interface NuGetFeed {
	source: string;
	token?: string;
	username?: string;
}

/**
 * Deterministic source name from URL for remove/add. Same URL always yields same name.
 */
export function sourceNameFromUrl(url: string): string {
	const hash = crypto
		.createHash('sha256')
		.update(url)
		.digest('hex')
		.slice(0, 12);
	return `nuget-${hash}`;
}

/**
 * Parse nuget-sources input. All auth via pipes: URL, URL|TOKEN (user nuget), or URL|TOKEN|USER.
 * Comma/newline separated. Token and username only when non-empty.
 */
export function parseNuGetSourcesInput(sources: string): NuGetFeed[] {
	if (!sources) return [];

	const entries = sources
		.split(/[\n,]/)
		.map((e) => e.trim())
		.filter((e) => e.length > 0 && !e.startsWith('-'));

	const feeds: NuGetFeed[] = [];

	for (const entry of entries) {
		const parts = entry.split('|').map((p) => p.trim());

		if (parts.length === 1) {
			feeds.push({ source: parts[0] });
		} else if (parts.length === 2) {
			const token = parts[1] || undefined;
			feeds.push({ source: parts[0], token });
		} else {
			const token = parts[1] || undefined;
			const username = parts[2] || undefined;
			feeds.push({ source: parts[0], token, username });
		}
	}

	return feeds;
}

/**
 * Resolve NuGet config file path in workspace.
 * Looks for nuget.config or NuGet.Config; if neither exists, returns path for new file.
 */
export function resolveNuGetConfigPath(workspace: string): {
	configPath: string;
	isNew: boolean;
} {
	const nugetConfig = path.join(workspace, 'nuget.config');
	const nugetConfigAlt = path.join(workspace, 'NuGet.Config');

	if (existsSync(nugetConfig)) {
		return { configPath: nugetConfig, isNew: false };
	}
	if (existsSync(nugetConfigAlt)) {
		return { configPath: nugetConfigAlt, isNew: false };
	}
	return { configPath: nugetConfig, isNew: true };
}

/**
 * Find the packageSource key (name) in nuget.config whose value equals url.
 * Only searches within <packageSources>. Returns null if not found or no packageSources block.
 */
async function findPackageSourceNameByUrl(
	configPath: string,
	url: string,
): Promise<string | null> {
	const content = await readFile(configPath, 'utf-8');
	const start = content.indexOf('<packageSources>');
	const end = content.indexOf('</packageSources>');
	if (start === -1 || end === -1) return null;

	const block = content.slice(start, end);
	const addRegex = /<add\s+[^>]+>/g;
	let match = addRegex.exec(block);
	while (match !== null) {
		const tag = match[0];
		const keyMatch = tag.match(/key="([^"]*)"/);
		const valueMatch = tag.match(/value="([^"]*)"/);
		if (keyMatch && valueMatch && valueMatch[1] === url) return keyMatch[1];
		match = addRegex.exec(block);
	}
	return null;
}

const MINIMAL_NUGET_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<configuration></configuration>
`;

/**
 * Add NuGet sources via dotnet nuget add source.
 * When isNew, creates minimal nuget.config first. When existing config has an entry for the same URL
 * (under any key, e.g. "my-feed"), we remove that by its key first, then add with sourceNameFromUrl.
 */
export async function setupNuGetSources(
	feeds: NuGetFeed[],
	configPath: string,
	isNew: boolean,
): Promise<void> {
	if (feeds.length === 0) return;

	if (isNew) {
		await mkdir(path.dirname(configPath), { recursive: true });
		await writeFile(configPath, MINIMAL_NUGET_CONFIG, 'utf-8');
	}

	for (const feed of feeds) {
		const name = sourceNameFromUrl(feed.source);

		if (feed.token) {
			core.setSecret(feed.token);
		}

		if (!isNew) {
			const existingName = await findPackageSourceNameByUrl(
				configPath,
				feed.source,
			);
			if (existingName) {
				await exec.exec(
					'dotnet',
					[
						'nuget',
						'remove',
						'source',
						existingName,
						'--configfile',
						configPath,
					],
					{ ignoreReturnCode: true },
				);
			}
		}

		const addArgs: string[] = [
			'nuget',
			'add',
			'source',
			feed.source,
			'--name',
			name,
			'--configfile',
			configPath,
		];

		if (feed.token) {
			addArgs.push(
				'--username',
				feed.username ?? 'nuget',
				'--password',
				feed.token,
			);
			addArgs.push('--store-password-in-clear-text');
		}

		const exitCode = await exec.exec('dotnet', addArgs);
		if (exitCode !== 0) {
			throw new Error(
				`dotnet nuget add source failed for ${feed.source} (exit code ${exitCode})`,
			);
		}
	}
}
