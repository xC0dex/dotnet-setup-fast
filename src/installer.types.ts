import type { DotnetType, InstallSource } from './types';

export interface InstallOptions {
	version: string;
	type: DotnetType;
}

export interface InstallResult {
	version: string;
	type: DotnetType;
	path: string;
	source: InstallSource;
}

export interface DownloadInfo {
	url: string;
	hash: string;
}
