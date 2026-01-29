export interface GlobalJson {
	sdk?: {
		version?: string;
		rollForward?: string;
		allowPrerelease?: boolean;
	};
}

export interface SdkInfo {
	version: string;
	allowPrerelease: boolean;
}
