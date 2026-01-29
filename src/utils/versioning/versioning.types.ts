export interface ReleaseInfo {
	'channel-version': string;
	'latest-sdk': string;
	'latest-release': string;
	'latest-runtime'?: string;
	'release-type': 'sts' | 'lts';
	'support-phase': string;
}

export interface ResolvedVersion {
	value: string;
	channel: string;
}

export interface SdkIncludedVersions {
	runtime: string | null;
	aspnetcore: string | null;
}
