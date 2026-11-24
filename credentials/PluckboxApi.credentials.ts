import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PluckboxApi implements ICredentialType {
	name = 'pluckboxApi';

	displayName = 'Pluckbox API';

	icon: Icon = { light: 'file:../icons/pluckbox.svg', dark: 'file:../icons/pluckbox.svg' };

	documentationUrl = 'https://pluckbox.onibaku.co.uk/docs';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Find or create a key in Pluckbox under API keys. The trigger needs the webhooks:write scope; parsing needs documents:write.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://pluckbox.onibaku.co.uk/v1',
			url: '/me',
		},
	};
}
