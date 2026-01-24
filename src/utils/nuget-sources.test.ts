import * as exec from '@actions/exec';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@actions/exec');
import {
	parseNuGetSourcesInput,
	resolveNuGetConfigPath,
	setupNuGetSources,
	sourceNameFromUrl,
} from './nuget-sources';

describe('parseNuGetSourcesInput', () => {
	it('should return empty array for empty input', () => {
		expect(parseNuGetSourcesInput('')).toEqual([]);
		expect(parseNuGetSourcesInput('   ')).toEqual([]);
	});

	it('should parse single feed without token', () => {
		expect(
			parseNuGetSourcesInput('https://api.nuget.org/v3/index.json'),
		).toEqual([{ source: 'https://api.nuget.org/v3/index.json' }]);
	});

	it('should parse URL|TOKEN', () => {
		expect(
			parseNuGetSourcesInput(
				'https://pkgs.dev.azure.com/org/feed/nuget/v3/index.json|my-token',
			),
		).toEqual([
			{
				source: 'https://pkgs.dev.azure.com/org/feed/nuget/v3/index.json',
				token: 'my-token',
			},
		]);
	});

	it('should parse URL|TOKEN|USER with custom username', () => {
		expect(parseNuGetSourcesInput('https://a.com|mytoken|myuser')).toEqual([
			{ source: 'https://a.com', token: 'mytoken', username: 'myuser' },
		]);
	});

	it('should parse comma-separated feeds', () => {
		expect(
			parseNuGetSourcesInput(
				'https://api.nuget.org/v3/index.json, https://example.com/feed',
			),
		).toEqual([
			{ source: 'https://api.nuget.org/v3/index.json' },
			{ source: 'https://example.com/feed' },
		]);
	});

	it('should parse newline-separated feeds', () => {
		expect(
			parseNuGetSourcesInput(
				'https://api.nuget.org/v3/index.json\nhttps://example.com/feed',
			),
		).toEqual([
			{ source: 'https://api.nuget.org/v3/index.json' },
			{ source: 'https://example.com/feed' },
		]);
	});

	it('should parse URL|TOKEN|USER as three segments', () => {
		expect(parseNuGetSourcesInput('https://a.com|part1|part2')).toEqual([
			{ source: 'https://a.com', token: 'part1', username: 'part2' },
		]);
	});

	it('should filter out empty lines and YAML markers', () => {
		expect(
			parseNuGetSourcesInput('https://a.com\n\nhttps://b.com\n- https://c.com'),
		).toEqual([{ source: 'https://a.com' }, { source: 'https://b.com' }]);
	});

	it('should trim whitespace', () => {
		expect(
			parseNuGetSourcesInput('  https://a.com  ,  https://b.com  '),
		).toEqual([{ source: 'https://a.com' }, { source: 'https://b.com' }]);
	});

	it('should treat empty token after pipe as source only', () => {
		expect(parseNuGetSourcesInput('https://a.com|')).toEqual([
			{ source: 'https://a.com' },
		]);
	});

	it('should parse URL|TOKEN| with empty third segment as username undefined', () => {
		expect(parseNuGetSourcesInput('https://a.com|t||')).toEqual([
			{ source: 'https://a.com', token: 't', username: undefined },
		]);
	});
});

describe('resolveNuGetConfigPath', () => {
	let tempDir: string;

	afterEach(() => {
		if (tempDir) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should return nuget.config when it exists', () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'nuget-resolve-'));
		writeFileSync(path.join(tempDir, 'nuget.config'), '');

		const result = resolveNuGetConfigPath(tempDir);

		expect(result).toEqual({
			configPath: path.join(tempDir, 'nuget.config'),
			isNew: false,
		});
	});

	it('should return NuGet.Config when it exists and nuget.config does not', () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'nuget-resolve-'));
		writeFileSync(path.join(tempDir, 'NuGet.Config'), '');

		const result = resolveNuGetConfigPath(tempDir);

		expect(result.isNew).toBe(false);
		expect([
			path.join(tempDir, 'nuget.config'),
			path.join(tempDir, 'NuGet.Config'),
		]).toContain(result.configPath);
	});

	it('should prefer nuget.config over NuGet.Config when both exist', () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'nuget-resolve-'));
		writeFileSync(path.join(tempDir, 'nuget.config'), '');
		writeFileSync(path.join(tempDir, 'NuGet.Config'), '');

		const result = resolveNuGetConfigPath(tempDir);

		expect(result.configPath).toBe(path.join(tempDir, 'nuget.config'));
		expect(result.isNew).toBe(false);
	});

	it('should return isNew true and nuget.config path when neither exists', () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'nuget-resolve-'));

		const result = resolveNuGetConfigPath(tempDir);

		expect(result).toEqual({
			configPath: path.join(tempDir, 'nuget.config'),
			isNew: true,
		});
	});
});

describe('setupNuGetSources', () => {
	let tempDir: string;

	afterEach(() => {
		vi.clearAllMocks();
		if (tempDir) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should do nothing when feeds is empty', async () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'nuget-setup-'));
		const configPath = path.join(tempDir, 'nuget.config');

		await setupNuGetSources([], configPath, true);

		expect(vi.mocked(exec.exec)).not.toHaveBeenCalled();
	});

	it('should create minimal config and add source when isNew', async () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'nuget-setup-'));
		const configPath = path.join(tempDir, 'nuget.config');
		const url = 'https://api.nuget.org/v3/index.json';
		vi.mocked(exec.exec).mockResolvedValue(0);

		await setupNuGetSources([{ source: url }], configPath, true);

		expect(vi.mocked(exec.exec)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(exec.exec)).toHaveBeenCalledWith('dotnet', [
			'nuget',
			'add',
			'source',
			url,
			'--name',
			sourceNameFromUrl(url),
			'--configfile',
			configPath,
		]);
		expect(readFileSync(configPath, 'utf-8')).toContain('<configuration>');
	});

	it('should only add when isNew is false and config has no entry for that URL', async () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'nuget-setup-'));
		const configPath = path.join(tempDir, 'nuget.config');
		const url = 'https://example.com/feed';
		writeFileSync(
			configPath,
			'<?xml version="1.0"?><configuration></configuration>',
		);
		vi.mocked(exec.exec).mockResolvedValue(0);

		await setupNuGetSources([{ source: url }], configPath, false);

		expect(vi.mocked(exec.exec)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(exec.exec)).toHaveBeenCalledWith('dotnet', [
			'nuget',
			'add',
			'source',
			url,
			'--name',
			sourceNameFromUrl(url),
			'--configfile',
			configPath,
		]);
	});

	it('should remove by existing key in config when URL matches, then add', async () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'nuget-setup-'));
		const configPath = path.join(tempDir, 'nuget.config');
		const url = 'https://example.com/feed';
		writeFileSync(
			configPath,
			`<?xml version="1.0"?>
<configuration>
  <packageSources>
    <add key="my-feed" value="${url}" />
  </packageSources>
</configuration>`,
		);
		vi.mocked(exec.exec).mockResolvedValue(0);

		await setupNuGetSources([{ source: url }], configPath, false);

		expect(vi.mocked(exec.exec)).toHaveBeenCalledTimes(2);
		expect(vi.mocked(exec.exec)).toHaveBeenNthCalledWith(
			1,
			'dotnet',
			['nuget', 'remove', 'source', 'my-feed', '--configfile', configPath],
			{ ignoreReturnCode: true },
		);
		expect(vi.mocked(exec.exec)).toHaveBeenNthCalledWith(2, 'dotnet', [
			'nuget',
			'add',
			'source',
			url,
			'--name',
			sourceNameFromUrl(url),
			'--configfile',
			configPath,
		]);
	});

	it('should pass username, password, and store-password-in-clear-text when token', async () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'nuget-setup-'));
		const configPath = path.join(tempDir, 'nuget.config');
		const url = 'https://pkgs.dev.azure.com/org/feed/nuget/v3/index.json';
		vi.mocked(exec.exec).mockResolvedValue(0);

		await setupNuGetSources(
			[{ source: url, token: 'secret-token', username: 'nuget' }],
			configPath,
			true,
		);

		expect(vi.mocked(exec.exec)).toHaveBeenCalledWith('dotnet', [
			'nuget',
			'add',
			'source',
			url,
			'--name',
			sourceNameFromUrl(url),
			'--configfile',
			configPath,
			'--username',
			'nuget',
			'--password',
			'secret-token',
			'--store-password-in-clear-text',
		]);
	});

	it('should pass custom username when URL|TOKEN|USER', async () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'nuget-setup-'));
		const configPath = path.join(tempDir, 'nuget.config');
		const url = 'https://example.com/feed';
		vi.mocked(exec.exec).mockResolvedValue(0);

		await setupNuGetSources(
			[{ source: url, token: 't', username: 'myuser' }],
			configPath,
			true,
		);

		expect(vi.mocked(exec.exec)).toHaveBeenCalledWith('dotnet', [
			'nuget',
			'add',
			'source',
			url,
			'--name',
			sourceNameFromUrl(url),
			'--configfile',
			configPath,
			'--username',
			'myuser',
			'--password',
			't',
			'--store-password-in-clear-text',
		]);
	});

	it('should throw when add source returns non-zero', async () => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'nuget-setup-'));
		const configPath = path.join(tempDir, 'nuget.config');
		vi.mocked(exec.exec).mockResolvedValue(1);

		await expect(
			setupNuGetSources(
				[{ source: 'https://example.com/feed' }],
				configPath,
				true,
			),
		).rejects.toThrow(
			'dotnet nuget add source failed for https://example.com/feed (exit code 1)',
		);
	});
});
